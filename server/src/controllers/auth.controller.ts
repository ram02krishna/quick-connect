import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { sendSuccess } from "../utils/ApiResponse.js";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { decryptDeterministic } from "../services/crypto.service.js";

export async function register(req: Request, res: Response) {
  const { name, username, email, password } = req.body;

  const user = await authService.register({ name, username, email, password });

  return sendSuccess(res, "Account created successfully!", { user }, 201);
}

export async function login(req: Request, res: Response) {
  const { identifier, password } = req.body;

  const { token, user } = await authService.login({ identifier, password });

  const isProd = env.NODE_ENV === "production";
  res.cookie("token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return sendSuccess(res, "Logged in successfully", { token, user });
}

export async function logout(req: Request, res: Response) {
  res.clearCookie("token");
  return sendSuccess(res, "Logged out successfully");
}

export async function verifyEmail(req: Request, res: Response) {
  const { userId, otp } = req.body;
  if (!userId || !otp) {
    return res.status(400).json({ success: false, message: "userId and otp are required" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await authService.verifyEmail(decryptDeterministic(user.email), otp);
  return sendSuccess(res, "Email verified successfully");
}

export async function resendVerification(req: Request, res: Response) {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ success: false, message: "userId is required" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await authService.resendVerification(decryptDeterministic(user.email));
  return sendSuccess(res, "Verification code sent successfully");
}

export async function forgotPassword(req: Request, res: Response) {
  const identifier = req.body.identifier || req.body.username || req.body.email;
  if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
    return res.status(400).json({ success: false, message: "Username or email is required" });
  }

  const data = await authService.forgotPassword(identifier.trim());
  return sendSuccess(res, "Password reset code sent", data);
}

export async function resetPassword(req: Request, res: Response) {
  const { userId, otp, newPassword } = req.body;
  if (!userId || !otp || !newPassword) {
    return res.status(400).json({ success: false, message: "userId, otp, and newPassword are required" });
  }

  await authService.resetPassword(userId, otp, newPassword);
  return sendSuccess(res, "Password reset successfully");
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  return sendSuccess(res, "Password changed successfully");
}
