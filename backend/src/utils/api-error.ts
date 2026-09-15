/**
 * Errors that are safe to show a client.
 *
 * Anything thrown that is *not* an ApiError is treated as an unexpected
 * failure: the client gets a generic message, the details go to the logs.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = "Invalid request.", details?: unknown): ApiError {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Authentication required."): ApiError {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "You do not have access to this resource."): ApiError {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Resource not found."): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message = "That action conflicts with the current state."): ApiError {
    return new ApiError(409, "CONFLICT", message);
  }

  static validation(message = "Some fields are invalid.", details?: unknown): ApiError {
    return new ApiError(422, "VALIDATION_ERROR", message, details);
  }

  static tooManyRequests(message = "Too many requests. Please slow down."): ApiError {
    return new ApiError(429, "RATE_LIMITED", message);
  }

  static internal(message = "Something went wrong on our end."): ApiError {
    return new ApiError(500, "INTERNAL_ERROR", message);
  }
}
