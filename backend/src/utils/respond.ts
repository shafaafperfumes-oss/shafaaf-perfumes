import type { Response } from "express";

/** Pagination/meta information returned alongside list responses. */
export interface ResponseMeta {
  page?: number;
  perPage?: number;
  total?: number;
  [key: string]: unknown;
}

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

/**
 * Every successful response in the API uses this envelope, so the frontend
 * can rely on one shape regardless of which endpoint it called.
 */
export function sendSuccess<T>(res: Response, data: T, meta?: ResponseMeta, statusCode = 200): void {
  const body: SuccessBody<T> = meta ? { success: true, data, meta } : { success: true, data };
  res.status(statusCode).json(body);
}
