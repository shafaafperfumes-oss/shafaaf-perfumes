import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import request from "supertest";
import { API_PREFIX, createApp } from "../src/app/app.js";
import { env } from "../src/config/env.js";
import { closeDatabase, getDb } from "../src/db/client.js";
import { auditLogs, contentPosts, profiles } from "../src/db/schema/index.js";
import { importAgentDrafts } from "../src/repositories/content.repository.js";
import { createSignedInTestUser, type TestUser } from "./helpers/supabase-test-user.js";

const app = createApp();

const hasTestCredentials = env.hasAuth && Boolean(env.SUPABASE_SERVICE_ROLE_KEY) && env.hasDatabase;
const describeWithAuth = hasTestCredentials ? describe : describe.skip;

describeWithAuth("the owner's content drafts", () => {
  let admin: TestUser;
  let customer: TestUser;
  // Every row this suite makes carries the stamp in its title, so cleanup only ever touches its own.
  const stamp = `zz-test-${Date.now()}`;
  let postId: string;

  beforeAll(async () => {
    [admin, customer] = await Promise.all([createSignedInTestUser(), createSignedInTestUser()]);
    await getDb().update(profiles).set({ role: "admin" }).where(eq(profiles.id, admin.id));
  }, 40_000);

  afterAll(async () => {
    const db = getDb();
    await db.delete(contentPosts).where(like(contentPosts.title, `${stamp}%`));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [admin.id, customer.id]));
    await Promise.all([admin.cleanup(), customer.cleanup()]);
    await closeDatabase();
  });

  function asAdmin(req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${admin.accessToken}`);
  }

  it("refuses a customer account", async () => {
    const res = await request(app)
      .get(`${API_PREFIX}/admin/content`)
      .set("Authorization", `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("lets the owner write a post by hand", async () => {
    const res = await asAdmin(request(app).post(`${API_PREFIX}/admin/content`)).send({
      platform: "instagram",
      title: `${stamp} Oud Kaaba Friday`,
      caption: "Friday ka attar: Oud Kaaba.",
      hashtags: "#attar #oud",
      productSlug: "oud-kaaba",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.post.status).toBe("draft");
    expect(res.body.data.post.source).toBe("admin");
    expect(res.body.data.post.kind).toBe("post");
    postId = res.body.data.post.id;
  });

  it("refuses a post with an unknown platform or extra fields", async () => {
    const bad = await asAdmin(request(app).post(`${API_PREFIX}/admin/content`)).send({
      platform: "tiktok",
      title: `${stamp} nope`,
      caption: "x",
    });
    expect(bad.status).toBe(422);
    const extra = await asAdmin(request(app).post(`${API_PREFIX}/admin/content`)).send({
      platform: "facebook",
      title: `${stamp} nope`,
      caption: "x",
      status: "published",
    });
    expect(extra.status).toBe(422);
  });

  it("lists drafts with a count per status", async () => {
    const res = await asAdmin(request(app).get(`${API_PREFIX}/admin/content`)).query({ status: "draft" });
    expect(res.status).toBe(200);
    expect(res.body.data.posts.some((p: { id: string }) => p.id === postId)).toBe(true);
    expect(res.body.meta.counts).toHaveProperty("draft");
    expect(res.body.meta.counts.draft).toBeGreaterThan(0);
    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  it("lets the owner edit the caption", async () => {
    const res = await asAdmin(request(app).patch(`${API_PREFIX}/admin/content/${postId}`)).send({
      caption: "  Friday ka attar: Oud Kaaba — 12ml ₹699.  ",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.post.caption).toBe("Friday ka attar: Oud Kaaba — 12ml ₹699.");
    expect(res.body.data.post.status).toBe("draft");
  });

  it("approves a draft and records who did it", async () => {
    const res = await asAdmin(request(app).patch(`${API_PREFIX}/admin/content/${postId}`)).send({ status: "approved" });
    expect(res.status).toBe(200);
    expect(res.body.data.post.status).toBe("approved");
    const rows = await getDb()
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, postId));
    expect(rows.map((r) => r.action)).toContain("content.approved");
  });

  it("rejects with a note the agent can read next time", async () => {
    const res = await asAdmin(request(app).patch(`${API_PREFIX}/admin/content/${postId}`)).send({
      status: "rejected",
      ownerNote: "Too long, keep it to two lines.",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.post.status).toBe("rejected");
    expect(res.body.data.post.ownerNote).toBe("Too long, keep it to two lines.");
  });

  it("never lets an admin mark a post published by hand", async () => {
    const res = await asAdmin(request(app).patch(`${API_PREFIX}/admin/content/${postId}`)).send({ status: "published" });
    expect(res.status).toBe(422);
  });

  it("keeps a published post's words fixed", async () => {
    await getDb().update(contentPosts).set({ status: "published", publishedAt: new Date() }).where(eq(contentPosts.id, postId));
    const edit = await asAdmin(request(app).patch(`${API_PREFIX}/admin/content/${postId}`)).send({ caption: "changed" });
    expect(edit.status).toBe(409);
    const note = await asAdmin(request(app).patch(`${API_PREFIX}/admin/content/${postId}`)).send({ ownerNote: "went well" });
    expect(note.status).toBe(200);
    const del = await asAdmin(request(app).delete(`${API_PREFIX}/admin/content/${postId}`));
    expect(del.status).toBe(409);
  });

  it("imports agent drafts once, skipping keys it has seen", async () => {
    const drafts = [
      { agentKey: `${stamp}-ig-1`, platform: "instagram" as const, title: `${stamp} agent one`, caption: "one" },
      { agentKey: `${stamp}-fb-1`, platform: "facebook" as const, title: `${stamp} agent two`, caption: "two", kind: "reel" as const },
    ];
    expect(await importAgentDrafts(drafts)).toEqual({ inserted: 2, skipped: 0 });
    expect(await importAgentDrafts(drafts)).toEqual({ inserted: 0, skipped: 2 });
    const [row] = await getDb().select().from(contentPosts).where(eq(contentPosts.agentKey, `${stamp}-fb-1`));
    expect(row?.source).toBe("agent");
    expect(row?.status).toBe("draft");
    expect(row?.kind).toBe("reel");
  });

  it("deletes a draft that never went out", async () => {
    const [row] = await getDb().select({ id: contentPosts.id }).from(contentPosts).where(eq(contentPosts.agentKey, `${stamp}-ig-1`));
    const res = await asAdmin(request(app).delete(`${API_PREFIX}/admin/content/${row!.id}`));
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    const again = await asAdmin(request(app).get(`${API_PREFIX}/admin/content/${row!.id}`));
    expect(again.status).toBe(404);
  });
  it("reports whether auto-posting is set up, without ever returning a token", async () => {
    const res = await asAdmin(request(app).get(`${API_PREFIX}/admin/content/meta-status`));
    expect(res.status).toBe(200);
    expect(typeof res.body.data.configured).toBe("boolean");
    expect(JSON.stringify(res.body)).not.toMatch(/access_token|EAA/);
  });

  it("will not publish a draft, nor a post that must stay manual", async () => {
    const draft = await asAdmin(request(app).post(`${API_PREFIX}/admin/content`)).send({
      platform: "facebook",
      title: `${stamp} publish-draft`,
      caption: "not yet",
    });
    const res = await asAdmin(request(app).post(`${API_PREFIX}/admin/content/${draft.body.data.post.id}/publish`));
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Approve/);

    const yt = await asAdmin(request(app).post(`${API_PREFIX}/admin/content`)).send({
      platform: "youtube",
      title: `${stamp} publish-yt`,
      caption: "shots",
    });
    await asAdmin(request(app).patch(`${API_PREFIX}/admin/content/${yt.body.data.post.id}`)).send({ status: "approved" });
    const manual = await asAdmin(request(app).post(`${API_PREFIX}/admin/content/${yt.body.data.post.id}/publish`));
    expect(manual.status).toBe(409);
    expect(manual.body.error.message).toMatch(/YouTube/);
    const [row] = await getDb().select().from(contentPosts).where(eq(contentPosts.id, yt.body.data.post.id));
    expect(row?.status).toBe("approved");
  });

  it("re-approving a post gives the scheduler fresh attempts", async () => {
    const made = await asAdmin(request(app).post(`${API_PREFIX}/admin/content`)).send({
      platform: "facebook",
      title: `${stamp} retry`,
      caption: "again",
    });
    const id = made.body.data.post.id;
    await getDb().update(contentPosts).set({ status: "approved", publishAttempts: 3, lastError: "Meta said no" }).where(eq(contentPosts.id, id));
    const back = await asAdmin(request(app).patch(`${API_PREFIX}/admin/content/${id}`)).send({ status: "draft" });
    expect(back.status).toBe(200);
    expect(back.body.data.post.publishAttempts).toBe(0);
    expect(back.body.data.post.lastError).toBeNull();
  });
});
