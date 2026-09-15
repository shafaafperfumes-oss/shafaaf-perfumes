import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Configuration for drizzle-kit, the tool that turns `src/db/schema` into SQL
 * migration files. The connection string is only read from the environment —
 * it is never written here, because this file is committed to git.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
