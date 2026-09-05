/**
 * Error thrown by the NibssByPhoenix client whenever the upstream API rejects
 * a request or cannot be reached. `statusCode` is the upstream HTTP status
 * when one was returned; it is undefined for timeouts/network failures.
 */
export class NibssError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'NibssError';
  }
}