import type { Response } from "express";

export const sendSuccess = (
  res: Response,
  message: string,
  data: Record<string, unknown> = {},
  statusCode = 200
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};
