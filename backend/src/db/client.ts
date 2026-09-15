import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import * as schema from "./schema/index.js";

/**
 * DATABASE CONNECTION
 * ---------------------------------------------------------------
 * The connection is created lazily on first use, not at import time, so:
 *   - the API (and its tests) still start when no database is configured,
 *   - nothing tries to open a socket while the process is only type-checking.
 *
 * The connection string lives in `DATABASE_URL` and contains a password, so
 * it is never logged. Only the host is ever mentioned in a log line.
 */

export type Database = ReturnType<typeof createDatabase>;

let client: postgres.Sql | null = null;
let database: Database | null = null;

function createDatabase(sqlClient: postgres.Sql) {
  return drizzle(sqlClient, { schema, logger: false });
}

/** True when a database connection string is configured. */
export function isDatabaseConfigured(): boolean {
  return env.hasDatabase;
}

/** Host of the configured database, safe to log (never the password). */
export function databaseHost(): string | null {
  if (!env.DATABASE_URL) return null;
  try {
    return new URL(env.DATABASE_URL).host;
  } catch {
    return null;
  }
}

export function getDb(): Database {
  if (database) return database;

  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and add the Supabase connection string.",
    );
  }

  client = postgres(env.DATABASE_URL, {
    // Supabase's pooled connections do not support prepared statements.
    prepare: false,
    // Supabase requires TLS; a plain local Postgres does not.
    ssl: env.DATABASE_URL.includes("localhost") ? false : "require",
    max: env.isTest ? 1 : 10,
    idle_timeout: 20,
    connect_timeout: 15,
  });

  database = createDatabase(client);
  logger.info({ host: databaseHost() }, "database connection pool created");
  return database;
}

/** Cheap round-trip used by the readiness check. Never throws. */
export async function pingDatabase(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch (error) {
    logger.error({ err: error, host: databaseHost() }, "database ping failed");
    return false;
  }
}

/** Closes the pool during graceful shutdown. */
export async function closeDatabase(): Promise<void> {
  if (!client) return;
  await client.end({ timeout: 5 });
  client = null;
  database = null;
}
