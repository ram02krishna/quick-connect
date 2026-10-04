import { Router } from "express";
import { z } from "zod";
import * as authController from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores"),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100),
});

const loginSchema = z.object({
  identifier: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

const verifySchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

const resendSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  type: z.string().optional(),
});

const forgotPasswordSchema = z
  .object({
    identifier: z.string().optional(),
    username: z.string().optional(),
    email: z.string().optional(),
  })
  .refine(
    (data) =>
      Boolean(
        (data.identifier && data.identifier.trim().length > 0) ||
        (data.username && data.username.trim().length > 0) ||
        (data.email && data.email.trim().length > 0)
      ),
    {
      message: "Username or email is required",
    }
  );

const resetPasswordSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(100),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(100),
});

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.post("/logout", authenticate, authController.logout);
router.post("/change-password", authenticate, validate(changePasswordSchema), authController.changePassword);
router.post("/verify-email", validate(verifySchema), authController.verifyEmail);
router.post("/resend-verification", validate(resendSchema), authController.resendVerification);
router.post("/forgot-password", validate(forgotPasswordSchema), authController.forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), authController.resetPassword);

export default router;
