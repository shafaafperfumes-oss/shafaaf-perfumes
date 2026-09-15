import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The database lives on a remote Supabase region; each test file opens
    // its own short-lived connection pool, and that first round trip can be
    // slower than Vitest's 5s default — especially with several files
    // connecting at once. This gives real network calls room without
    // hiding a test that is actually stuck.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      NODE_ENV: "test",
      CORS_ALLOWED_ORIGINS: "http://localhost:8080",
    },
  },
});
