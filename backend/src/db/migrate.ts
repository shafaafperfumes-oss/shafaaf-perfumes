import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../config/env.js";
import { isDatabaseConfigured } from "./client.js";

/**
 * Applies any migration files in `drizzle/` that this database has not run yet.
 * Run with:  npm run db:migrate
 *
 * Drizzle records what it has applied in its own table, so running this twice
 * does nothing the second time — it never re-runs or duplicates a migration.
 *
 * This uses its OWN short-lived connection — DIRECT_URL when set, otherwise
 * DATABASE_URL — rather than the app's shared pool. Migrations run DDL and
 * multi-statement transactions, which Supabase's transaction-mode pooler
 * (port 6543, `pgbouncer=true`) does not support reliably; the direct/
 * session-mode connection (port 5432) does.
 */
async function main() {
  if (!isDatabaseConfigured()) {
    console.error(
      "No DATABASE_URL found. Add the Supabase connection string to backend/.env first.",
    );
    process.exit(1);
  }

  const connectionString = env.DIRECT_URL ?? env.DATABASE_URL!;
  const host = safeHost(connectionString);
  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

  console.log(`Applying migrations to ${host ?? "the database"} ...`);

  const client = postgres(connectionString, {
    max: 1,
    prepare: false,
    ssl: connectionString.includes("localhost") ? false : "require",
    connect_timeout: 15,
  });

  try {
    await migrate(drizzle(client), { migrationsFolder });
    console.log("Migrations are up to date.");
  } catch (error) {
    console.error("Migration failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

function safeHost(connectionString: string): string | null {
  try {
    return new URL(connectionString).host;
  } catch {
    return null;
  }
}

await main();
