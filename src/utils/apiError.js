/**
 * Operational error carrying an HTTP status. Thrown anywhere in the request
 * lifecycle and translated into a JSON response by the error middleware.
 */
class ApiError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code; // stable machine-readable code, e.g. 'INVALID_OTP'
    this.details = details; // optional structured context (validation errors, etc.)
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', opts) {
    return new ApiError(400, message, opts);
  }

  static unauthorized(message = 'Unauthorized', opts) {
    return new ApiError(401, message, opts);
  }

  static forbidden(message = 'Forbidden', opts) {
    return new ApiError(403, message, opts);
  }

  static notFound(message = 'Not found', opts) {
    return new ApiError(404, message, opts);
  }

  static conflict(message = 'Conflict', opts) {
    return new ApiError(409, message, opts);
  }

  static tooManyRequests(message = 'Too many requests', opts) {
    return new ApiError(429, message, opts);
  }

  static internal(message = 'Internal server error', opts) {
    return new ApiError(500, message, opts);
  }
}

export default ApiError;
