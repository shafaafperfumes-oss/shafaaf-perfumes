import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";

/**
 * VERIFYING A SUPABASE SIGN-IN TOKEN
 * ---------------------------------------------------------------
 * The browser signs in through Supabase directly — this backend never
 * sees a password, and never asks Supabase to confirm a token over the
 * network on every request either. Supabase signs each token with a
 * private key and publishes the matching *public* key at a well-known
 * URL; we fetch that once, cache it, and check the signature locally.
 * A forged or tampered token fails this check no matter what it claims.
 *
 * What is deliberately NOT trusted: any `role` the token itself claims.
 * A customer's own browser could, in principle, hold a modified token
 * claiming to be an admin — the signature check catches a *tampered*
 * token, but the right question is always "what role does OUR database
 * say this user has", asked fresh from `profiles.role` (see
 * src/middleware/auth.ts), never taken from the token's contents.
 */

export interface SupabaseTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  role?: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not configured.");
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL));
  }
  return jwks;
}

export class InvalidTokenError extends Error {}

/**
 * Verifies a Supabase access token's signature, issuer and expiry.
 * Throws `InvalidTokenError` for anything that fails — expired, wrong
 * project, malformed, or a signature that does not match.
 */
export async function verifySupabaseToken(token: string): Promise<SupabaseTokenClaims> {
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not configured.");
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: new URL("/auth/v1", env.SUPABASE_URL).toString(),
      audience: "authenticated",
    });

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new InvalidTokenError("Token has no subject.");
    }

    return payload as SupabaseTokenClaims;
  } catch (error) {
    if (error instanceof InvalidTokenError) throw error;
    throw new InvalidTokenError(error instanceof Error ? error.message : "Invalid token.");
  }
}
