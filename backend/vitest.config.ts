import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      CORS_ALLOWED_ORIGINS: "http://localhost:8080",
    },
  },
});
