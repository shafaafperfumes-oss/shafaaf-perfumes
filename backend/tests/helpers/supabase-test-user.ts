import { createClient } from "@supabase/supabase-js";
import { env } from "../../src/config/env.js";

/**
 * Test-only helper: creates a throwaway Supabase user, signs them in to get
 * a real access token, and tears the user down afterwards. Only used by
 * tests gated on `env.hasAuth && env.SUPABASE_SERVICE_ROLE_KEY` being set —
 * see tests/me.route.test.ts.
 *
 * Signing in normally uses the browser-safe anon key; the password-grant
 * endpoint also accepts the service-role key as its `apikey` header, so
 * this test harness needs only the one key the backend already has.
 */
export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  cleanup: () => Promise<void>;
}

export async function createSignedInTestUser(): Promise<TestUser> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for this test.");
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `shafaaf-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = `Test-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`Could not create test user: ${createError?.message}`);
  }

  const tokenResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!tokenResponse.ok) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(`Could not sign in test user: ${tokenResponse.status}`);
  }

  const tokenBody = (await tokenResponse.json()) as { access_token: string };

  return {
    id: created.user.id,
    email,
    accessToken: tokenBody.access_token,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(created.user.id);
    },
  };
}
