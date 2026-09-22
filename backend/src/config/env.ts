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
   *
   * This is normally Supabase's *pooled* (transaction-mode, port 6543)
   * connection string — what the running API uses for everyday queries.
   */
  DATABASE_URL: z.string().min(1).optional(),

  /**
   * Supabase's *direct/session-mode* connection string (port 5432, no
   * pgbouncer). Schema migrations run through this one instead, because
   * DDL and multi-statement transactions are not reliable over a
   * transaction-mode pooler. Falls back to DATABASE_URL if not set.
   */
  DIRECT_URL: z.string().min(1).optional(),

  /**
   * The Supabase project's URL, e.g. https://abcdefgh.supabase.co.
   * Not a secret — it is the same URL the browser's own Supabase client
   * uses. The backend uses it to verify sign-in tokens (see
   * src/lib/supabase-jwt.ts): it fetches Supabase's public signing keys
   * from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` and checks every
   * token's signature against them — no shared secret required.
   * Optional, like DATABASE_URL: login routes report themselves as
   * unavailable rather than crashing when it is not set.
   */
  SUPABASE_URL: z.string().url().optional(),

  /**
   * The service-role key. This bypasses every database access rule —
   * SERVER ONLY, never sent to a browser, never logged. Used for the one
   * thing the database connection cannot do: writing product photos to
   * Supabase Storage (see src/lib/storage.ts). Without it the API boots
   * and the admin upload route reports itself as unavailable.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  /**
   * Razorpay. All three optional, like the database/auth config above: the
   * API still boots without them, and checkout still places orders — it
   * simply cannot create a payment for one yet (`payment: null` in the
   * response) until these are set. See docs/RAZORPAY-SETUP.md.
   *
   * RAZORPAY_KEY_ID        — not a secret; also used by the browser's
   *                           Razorpay Checkout widget.
   * RAZORPAY_KEY_SECRET    — SERVER ONLY. Signs API requests to Razorpay.
   * RAZORPAY_WEBHOOK_SECRET — SERVER ONLY. A separate secret (set in the
   *                           Razorpay dashboard's webhook config, not the
   *                           API keys page) used only to verify that a
   *                           webhook call really came from Razorpay.
   */
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),

  /**
   * Outgoing email (Resend) — see docs/EMAIL-SETUP.md. Optional like
   * everything above: without a key the API boots and simply sends no
   * mail. Today this powers one thing: an alert to the shop owner the
   * moment an order is paid.
   *
   * RESEND_API_KEY    — SERVER ONLY. Authenticates calls to Resend.
   * EMAIL_FROM        — not a secret; the sender shown to recipients.
   *                     Resend's shared onboarding address works with no
   *                     domain setup but only delivers to the Resend
   *                     account's own inbox — swap in an address on the
   *                     shop's verified domain once it has one.
   * ORDER_ALERT_EMAIL — not a secret; where "new paid order" alerts go.
   *                     Blank means no alerts, even with a key set.
   */
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default("Shafaaf Perfumes <onboarding@resend.dev>"),
  ORDER_ALERT_EMAIL: z.string().email().optional(),

  /**
   * Meta (Facebook Page + Instagram) auto-posting — see docs/META-SETUP.md.
   * Optional like everything above: without a token the API boots, the
   * admin Content tab still works, and approved posts simply wait for the
   * owner to copy them by hand.
   *
   * META_PAGE_ACCESS_TOKEN — SERVER ONLY. A long-lived Page token; posts
   *                          to the Page and to the Instagram account
   *                          linked to it. Never logged, never sent to a
   *                          browser.
   * META_PAGE_ID           — not a secret; the Facebook Page's numeric id.
   * META_IG_USER_ID        — not a secret; the Instagram account's id.
   *                          Optional: looked up from the Page when blank.
   * META_GRAPH_VERSION     — Graph API version, e.g. v21.0.
   * CONTENT_PUBLISHER_INTERVAL_MS — how often the server looks for approved
   *                          posts whose time has come. 0 turns the
   *                          scheduler off (the "Publish now" button
   *                          still works).
   * SITE_PUBLIC_URL        — where the site's photos can be fetched from
   *                          publicly (Meta downloads them by URL). Defaults
   *                          to the first non-local CORS origin, so it
   *                          follows the domain automatically.
   */
  META_PAGE_ACCESS_TOKEN: z.string().min(1).optional(),
  META_PAGE_ID: z.string().regex(/^\d+$/).optional(),
  META_IG_USER_ID: z.string().regex(/^\d+$/).optional(),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v21.0"),
  CONTENT_PUBLISHER_INTERVAL_MS: z.coerce.number().int().min(0).default(5 * 60_000),
  SITE_PUBLIC_URL: z.string().url().optional(),
});

// A variable left blank (`RESEND_API_KEY=` in .env, or an empty Railway
// variable) means "not set", exactly like a missing one — otherwise every
// optional value above would reject the empty string it was left as.
const source = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));

const parsed = envSchema.safeParse(source);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  // Deliberately not using the logger: config is what the logger depends on.
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const raw = parsed.data;

/**
 * The public website: the first non-localhost origin the API is allowed
 * to serve. Null when only local origins are configured.
 */
const siteUrl =
  raw.CORS_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .find((origin) => origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin)) ?? null;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === "production",
  isTest: raw.NODE_ENV === "test",
  corsAllowedOrigins: raw.CORS_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  hasDatabase: Boolean(raw.DATABASE_URL),
  hasAuth: Boolean(raw.SUPABASE_URL),
  hasPayments: Boolean(raw.RAZORPAY_KEY_ID && raw.RAZORPAY_KEY_SECRET),
  hasPaymentWebhook: Boolean(raw.RAZORPAY_WEBHOOK_SECRET),
  hasEmail: Boolean(raw.RESEND_API_KEY),
  hasStorage: Boolean(raw.SUPABASE_URL && raw.SUPABASE_SERVICE_ROLE_KEY),
  hasOrderAlerts: Boolean(raw.RESEND_API_KEY && raw.ORDER_ALERT_EMAIL),
  hasMeta: Boolean(raw.META_PAGE_ACCESS_TOKEN && raw.META_PAGE_ID),
  /** Used to build links in emails; null means emails carry no links. */
  siteUrl,
  /**
   * Where a site-relative photo path ("images/x.webp") can be fetched
   * from publicly, no trailing slash — Meta downloads post photos by URL.
   * Null until a public origin is known.
   */
  publicSiteUrl: (raw.SITE_PUBLIC_URL ?? siteUrl)?.replace(/\/$/, "") ?? null,
} as const;

export type Env = typeof env;
