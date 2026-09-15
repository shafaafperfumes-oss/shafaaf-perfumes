import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDatabase, databaseHost, getDb, isDatabaseConfigured } from "./client.js";

/**
 * Applies any migration files in `drizzle/` that this database has not run yet.
 * Run with:  npm run db:migrate
 *
 * Drizzle records what it has applied in its own table, so running this twice
 * does nothing the second time — it never re-runs or duplicates a migration.
 */
async function main() {
  if (!isDatabaseConfigured()) {
    console.error(
      "No DATABASE_URL found. Add the Supabase connection string to backend/.env first.",
    );
    process.exit(1);
  }

  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
  console.log(`Applying migrations to ${databaseHost() ?? "the database"} ...`);

  try {
    await migrate(getDb(), { migrationsFolder });
    console.log("Migrations are up to date.");
  } catch (error) {
    console.error("Migration failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

await main();
