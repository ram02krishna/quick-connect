import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError.js";
import { env } from "../config/env.js";

// body-parser / http-errors attach a numeric `status` (e.g. 400 for bad JSON, 413 for large bodies)
function statusFromError(err: Error & { status?: number; statusCode?: number }) {
  if (err instanceof ApiError) return err.statusCode;
  const candidate = err.status ?? err.statusCode;
  if (typeof candidate === "number" && candidate >= 400 && candidate < 600) return candidate;
  return 500;
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  // A response that already started streaming (e.g. a download) can't be replaced by JSON.
  if (res.headersSent) {
    res.destroy();
    return next(err);
  }

  const statusCode = statusFromError(err);

  if (statusCode >= 500) {
    console.error(`[ERROR] ${new Date().toISOString()} — ${err.message}`, err.stack);
  }

  const message =
    statusCode >= 500 && env.NODE_ENV === "production"
      ? "Something went wrong on our end."
      : statusCode === 400 && err.name === "SyntaxError"
        ? "Malformed request body."
        : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    ...(err instanceof ApiError && err.data ? { data: err.data } : {}),
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  });
}
