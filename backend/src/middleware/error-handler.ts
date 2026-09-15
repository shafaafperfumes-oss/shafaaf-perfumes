import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import type { ErrorBody } from "../utils/respond.js";
import { logger } from "../utils/logger.js";

/** Anything that reaches here without matching a route is a 404. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No endpoint matches ${req.method} ${req.originalUrl}`));
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    // Field names and messages are safe to return; they describe the client's
    // own payload and help them fix the request.
    return ApiError.validation("Some fields are invalid.", {
      fields: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (error instanceof SyntaxError && "body" in error) {
    return ApiError.badRequest("Request body is not valid JSON.");
  }

  return ApiError.internal();
}

/**
 * The single place errors become responses.
 *
 * Clients never receive stack traces, database messages or internal
 * details — only a stable code, a safe message and the request id. The
 * full error is logged server-side against that same id.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const apiError = toApiError(error);
  const requestId = req.requestId ?? "unknown";

  const logPayload = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    statusCode: apiError.statusCode,
    code: apiError.code,
    err: error,
  };

  if (apiError.statusCode >= 500) {
    logger.error(logPayload, "Unhandled error");
  } else {
    logger.warn(logPayload, "Request rejected");
  }

  const body: ErrorBody = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      requestId,
      ...(apiError.details ? { details: apiError.details } : {}),
    },
  };

  res.status(apiError.statusCode).json(body);
}
