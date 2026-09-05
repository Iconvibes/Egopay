/**
 * Application-level error type. Every error that reaches the client passes
 * through here so the response shape is consistent and internal details
 * (stack traces, upstream payloads, secrets) never leak.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  badRequest: (message: string, code = 'BAD_REQUEST', details?: unknown) =>
    new AppError(400, code, message, details),
  unauthorized: (message = 'Authentication required', code = 'UNAUTHORIZED') =>
    new AppError(401, code, message),
  forbidden: (message = 'You do not have access to this resource', code = 'FORBIDDEN') =>
    new AppError(403, code, message),
  notFound: (message = 'Resource not found', code = 'NOT_FOUND') => new AppError(404, code, message),
  conflict: (message = 'Resource already exists', code = 'CONFLICT') =>
    new AppError(409, code, message),
  unprocessable: (message: string, code = 'UNPROCESSABLE_ENTITY', details?: unknown) =>
    new AppError(422, code, message, details),
  badGateway: (message = 'Upstream service error', code = 'BAD_GATEWAY') =>
    new AppError(502, code, message),
  gatewayTimeout: (message = 'Upstream service timed out', code = 'GATEWAY_TIMEOUT') =>
    new AppError(504, code, message),
};