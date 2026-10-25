import type { CookieOptions, Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { sendSuccess } from "../utils/ApiResponse.js";
import { env } from "../config/env.js";

const isProd = env.NODE_ENV === "production";

// clearCookie only works when it is given the same attributes the cookie was set with.
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "strict",
  path: "/",
};

export async function register(req: Request, res: Response) {
  const { name, username, email, password } = req.body;
  const user = await authService.register({ name, username, email, password });
  return sendSuccess(res, "Account created. Check your email for a verification code.", { user }, 201);
}

export async function login(req: Request, res: Response) {
  const { identifier, password } = req.body;
  const { token, user } = await authService.login({ identifier, password });

  res.cookie("token", token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
  return sendSuccess(res, "Logged in successfully", { token, user });
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie("token", cookieOptions);
  return sendSuccess(res, "Logged out successfully");
}

export async function verifyEmail(req: Request, res: Response) {
  await authService.verifyEmail(req.body.userId, req.body.otp);
  return sendSuccess(res, "Email verified successfully");
}

export async function resendVerification(req: Request, res: Response) {
  await authService.resendVerification(req.body.userId);
  return sendSuccess(res, "Verification code sent");
}

export async function forgotPassword(req: Request, res: Response) {
  const identifier = req.body.identifier || req.body.username || req.body.email;
  const data = await authService.forgotPassword(identifier);
  return sendSuccess(res, "If an account matches, a reset code is on its way.", data);
}

export async function resetPassword(req: Request, res: Response) {
  const { userId, otp, newPassword } = req.body;
  await authService.resetPassword(userId, otp, newPassword);
  return sendSuccess(res, "Password reset successfully");
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  return sendSuccess(res, "Password changed successfully");
}
