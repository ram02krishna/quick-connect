export class ApiError extends Error {
  statusCode: number;
  /** Optional machine-readable payload the client can act on (e.g. a userId to verify). */
  data?: Record<string, unknown>;

  constructor(statusCode: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
    this.name = "ApiError";
    Error.captureStackTrace(this, this.constructor);
  }
}
