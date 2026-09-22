import { describe, expect, it } from "vitest";
import { createMetaClient, MetaApiError, MetaNotConfiguredError } from "../src/lib/meta.js";

/**
 * The Meta client against a fake `fetch`: no token in the environment, no
 * network. Checks the exact call sequence Meta expects and that the token
 * can never leak through an error message.
 */

const TOKEN = "EAAB-secret-page-token";

interface Call {
  method: string;
  path: string;
  params: URLSearchParams;
}

function fakeGraph(answers: Array<Record<string, unknown> | { status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const params = method === "GET" ? url.searchParams : new URLSearchParams(String(init?.body));
    calls.push({ method, path: url.pathname, params });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected call ${method} ${url.pathname}`);
    const status = "status" in next && typeof next.status === "number" && "body" in next ? next.status : 200;
    const body = "status" in next && "body" in next ? next.body : next;
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function client(fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createMetaClient>[0]> = {}) {
  return createMetaClient({ accessToken: TOKEN, pageId: "111", fetchImpl, sleep: async () => {}, ...extra });
}

describe("the Meta client", () => {
  it("refuses to do anything without a token", async () => {
    const { fetchImpl, calls } = fakeGraph([]);
    const meta = createMetaClient({ accessToken: undefined, pageId: "111", fetchImpl });
    await expect(meta.publishFacebookText({ message: "hi" })).rejects.toBeInstanceOf(MetaNotConfiguredError);
    expect(calls).toHaveLength(0);
  });

  it("publishes an Instagram photo: container → ready → publish → permalink", async () => {
    const { fetchImpl, calls } = fakeGraph([
      { instagram_business_account: { id: "ig9" } },
      { id: "c1" },
      { status_code: "IN_PROGRESS" },
      { status_code: "FINISHED" },
      { id: "m1" },
      { permalink: "https://www.instagram.com/p/abc/" },
    ]);
    const result = await client(fetchImpl).publishInstagramImage({
      imageUrl: "https://cdn.example/x.jpg",
      caption: "Friday ka attar\n\n#attar",
    });
    expect(result).toEqual({ id: "m1", permalink: "https://www.instagram.com/p/abc/" });

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /v21.0/111",
      "POST /v21.0/ig9/media",
      "GET /v21.0/c1",
      "GET /v21.0/c1",
      "POST /v21.0/ig9/media_publish",
      "GET /v21.0/m1",
    ]);
    const container = calls[1]!.params;
    expect(container.get("image_url")).toBe("https://cdn.example/x.jpg");
    expect(container.get("caption")).toBe("Friday ka attar\n\n#attar");
    expect(container.get("access_token")).toBe(TOKEN);
    expect(calls[4]!.params.get("creation_id")).toBe("c1");
  });

  it("remembers the Instagram id it was given and skips the lookup", async () => {
    const { fetchImpl, calls } = fakeGraph([{ id: "c1" }, { status_code: "FINISHED" }, { id: "m1" }, { permalink: null }]);
    await client(fetchImpl, { igUserId: "ig42" }).publishInstagramImage({ imageUrl: "https://x/y.jpg", caption: "c" });
    expect(calls[0]!.path).toBe("/v21.0/ig42/media");
  });

  it("explains a Page with no Instagram account linked", async () => {
    const { fetchImpl } = fakeGraph([{ id: "111", name: "Shafaaf" }]);
    await expect(client(fetchImpl).publishInstagramImage({ imageUrl: "https://x/y.jpg", caption: "c" })).rejects.toThrow(
      /No Instagram professional account is linked/,
    );
  });

  it("publishes a Facebook photo post and builds its link", async () => {
    const { fetchImpl, calls } = fakeGraph([
      { id: "p1", post_id: "111_222" },
      { permalink_url: "https://www.facebook.com/111/posts/222" },
    ]);
    const result = await client(fetchImpl).publishFacebookPhoto({ imageUrl: "https://x/y.jpg", message: "hello" });
    expect(result).toEqual({ id: "111_222", permalink: "https://www.facebook.com/111/posts/222" });
    expect(calls[0]!.path).toBe("/v21.0/111/photos");
    expect(calls[0]!.params.get("url")).toBe("https://x/y.jpg");
    expect(calls[0]!.params.get("message")).toBe("hello");
  });

  it("publishes a text-only Facebook post", async () => {
    const { fakeCalls, fetchImpl } = (() => {
      const f = fakeGraph([{ id: "111_333" }]);
      return { fakeCalls: f.calls, fetchImpl: f.fetchImpl };
    })();
    const result = await client(fetchImpl).publishFacebookText({ message: "text only" });
    expect(result).toEqual({ id: "111_333", permalink: "https://www.facebook.com/111_333" });
    expect(fakeCalls[0]!.path).toBe("/v21.0/111/feed");
  });

  it("reports the Page and Instagram account behind the token", async () => {
    const { fetchImpl } = fakeGraph([
      { id: "111", name: "Shafaaf Perfumes", instagram_business_account: { id: "ig9" } },
      { id: "ig9", username: "shafaaf.perfumes" },
    ]);
    const who = await client(fetchImpl).whoAmI();
    expect(who).toEqual({ page: { id: "111", name: "Shafaaf Perfumes" }, instagram: { id: "ig9", username: "shafaaf.perfumes" } });
  });

  it("turns a Meta error into a readable message that never contains the token", async () => {
    const { fetchImpl } = fakeGraph([
      {
        status: 400,
        body: { error: { message: `Invalid OAuth access token ${TOKEN} - Cannot parse access token`, type: "OAuthException", code: 190 } },
      },
    ]);
    const error = await client(fetchImpl)
      .publishFacebookText({ message: "x" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MetaApiError);
    expect((error as MetaApiError).code).toBe(190);
    expect((error as MetaApiError).message).not.toContain(TOKEN);
    expect((error as MetaApiError).message).toContain("[token]");
  });

  it("gives up on a photo Instagram cannot prepare", async () => {
    const { fetchImpl } = fakeGraph([
      { id: "c1" },
      { status_code: "ERROR", status: "Media aspect ratio is not supported" },
    ]);
    await expect(
      client(fetchImpl, { igUserId: "ig9" }).publishInstagramImage({ imageUrl: "https://x/y.jpg", caption: "c" }),
    ).rejects.toThrow(/aspect ratio/);
  });
});
