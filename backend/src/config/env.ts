import "dotenv/config";
import { z } from "zod";

/**
 * Every environment variable the API needs is declared and validated here.
 * The process refuses to boot on invalid config rather than failing later
 * with a confusing runtime error in production.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  /** Comma-separated list of browser origins allowed to call this API. */
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:8080"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

  /**
   * Postgres connection string (Supabase). Optional so the API still boots,
   * and its tests still run, on a machine that has no database configured —
   * routes that need data report themselves as unavailable instead.
   * Contains a password: it belongs in `.env` only, never in git.
   */
  DATABASE_URL: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  // Deliberately not using the logger: config is what the logger depends on.
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === "production",
  isTest: raw.NODE_ENV === "test",
  corsAllowedOrigins: raw.CORS_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  hasDatabase: Boolean(raw.DATABASE_URL),
} as const;

export type Env = typeof env;
