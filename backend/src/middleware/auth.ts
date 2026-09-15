import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { getProfileById } from "../repositories/profile.repository.js";
import { InvalidTokenError, verifySupabaseToken } from "../lib/supabase-jwt.js";
import { ApiError } from "../utils/api-error.js";

/**
 * WHO IS ALLOWED TO DO WHAT
 * ---------------------------------------------------------------
 * `requireAuth` only proves *who is asking* — a signature-verified,
 * unexpired Supabase token. It does not decide *what they may do*.
 *
 * `requireRole` decides that, and it asks the database, not the token:
 * it reads `profiles.role` fresh on every request. A customer cannot
 * become an admin by editing a token, because the token's own claims
 * are never consulted for authorization — only for identity.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email?: string };
    }
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.hasAuth) {
      throw ApiError.serviceUnavailable("Sign-in is not available right now.");
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw ApiError.unauthorized("Sign in to continue.");
    }

    const claims = await verifySupabaseToken(token);
    req.user = { id: claims.sub, email: claims.email };
    next();
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      next(ApiError.unauthorized("Your session has expired. Please sign in again."));
      return;
    }
    next(error);
  }
}

/**
 * Use after `requireAuth`. Looks the caller's role up in `profiles` —
 * never from the token — so a role change takes effect on the very next
 * request, with nothing cached that could go stale.
 */
export function requireRole(...allowedRoles: Array<"customer" | "admin">) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized("Sign in to continue.");
      }

      const profile = await getProfileById(req.user.id);
      if (!profile || !allowedRoles.includes(profile.role)) {
        throw ApiError.forbidden("You do not have access to this resource.");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
