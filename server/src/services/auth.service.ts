import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { encryptDeterministic, decryptDeterministic } from "./crypto.service.js";
import { redis } from "../config/redis.js";
import { sendMail } from "../config/mail.js";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendAndStoreOTP(email: string) {
  const otp = generateOTP();
  await redis.set(`otp:${email}`, otp, { ex: 15 * 60 }); // expires in 15 minutes

  await sendMail({
    to: email,
    subject: "Verify your QuickConnect account",
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2>Welcome to QuickConnect!</h2>
        <p>Please use the following 6-digit code to verify your email. It expires in 15 minutes.</p>
        <div style="background-color: #f4f4f5; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
          <h1 style="margin: 0; letter-spacing: 4px; color: #18181b;">${otp}</h1>
        </div>
        <p style="color: #71717a; font-size: 14px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length > 2 ? local.slice(0, 2) + '*'.repeat(local.length - 2) : '*'.repeat(local.length);
  return `${maskedLocal}@${domain}`;
}

async function sendPasswordResetOTP(email: string) {
  const otp = generateOTP();
  await redis.set(`pwd_reset:${email}`, otp, { ex: 15 * 60 }); // expires in 15 minutes

  await sendMail({
    to: email,
    subject: "Reset your QuickConnect password",
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Please use the following 6-digit code to reset your password. It expires in 15 minutes.</p>
        <div style="background-color: #f4f4f5; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
          <h1 style="margin: 0; letter-spacing: 4px; color: #18181b;">${otp}</h1>
        </div>
        <p style="color: #71717a; font-size: 14px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
}

interface RegisterInput {
  name: string;
  username: string;
  email: string;
  password: string;
}

interface LoginInput {
  identifier: string;
  password: string;
}

function createToken(userId: string, email: string) {
  return jwt.sign(
    { id: userId, email },
    env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function register(input: RegisterInput) {
  const { name, username, email, password } = input;

  const encryptedEmail = encryptDeterministic(email);

  const usernameTaken = await prisma.user.findUnique({ where: { username } });
  if (usernameTaken) throw new ApiError(409, "This username is already taken");

  const emailTaken = await prisma.user.findUnique({ where: { email: encryptedEmail } });
  if (emailTaken) throw new ApiError(409, "This email is already registered");

  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.create({
    data: { name, username, email: encryptedEmail, passwordHash },
    select: { id: true, name: true, email: true, username: true, emailVerified: true },
  });

  await sendAndStoreOTP(email);

  return {
    ...user,
    email: decryptDeterministic(user.email),
  };
}

export async function verifyEmail(email: string, code: string) {
  const encryptedEmail = encryptDeterministic(email);
  const user = await prisma.user.findUnique({ where: { email: encryptedEmail } });

  if (!user) throw new ApiError(404, "User not found");
  if (user.emailVerified) throw new ApiError(400, "Email is already verified");

  const storedOtp = await redis.get(`otp:${email}`);
  if (!storedOtp) {
    throw new ApiError(400, "Verification code expired or not found. Please request a new one.");
  }

  if (String(storedOtp) !== code) {
    throw new ApiError(400, "Invalid verification code");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });

  await redis.del(`otp:${email}`);
  return { success: true };
}

export async function resendVerification(email: string) {
  const encryptedEmail = encryptDeterministic(email);
  const user = await prisma.user.findUnique({ where: { email: encryptedEmail } });

  if (!user) throw new ApiError(404, "User not found");
  if (user.emailVerified) throw new ApiError(400, "Email is already verified");

  await sendAndStoreOTP(email);
  return { success: true };
}

export async function login(input: LoginInput) {
  const { identifier, password } = input;

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: identifier },
        { email: encryptDeterministic(identifier) },
      ],
    },
  });

  if (!user) throw new ApiError(401, "Invalid credentials");

  const passwordOk = await argon2.verify(user.passwordHash, password);
  if (!passwordOk) throw new ApiError(401, "Invalid credentials");

  const token = createToken(user.id, decryptDeterministic(user.email));

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: decryptDeterministic(user.email),
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    },
  };
}

export async function forgotPassword(identifier: string) {
  const trimmed = identifier.trim();
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: trimmed },
        { email: encryptDeterministic(trimmed) },
        { email: encryptDeterministic(trimmed.toLowerCase()) },
      ],
    },
  });
  if (!user) throw new ApiError(404, "User not found");

  const email = decryptDeterministic(user.email);
  await sendPasswordResetOTP(email);

  return { userId: user.id, email: maskEmail(email) };
}

export async function resetPassword(userId: string, otp: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "User not found");

  const email = decryptDeterministic(user.email);
  const storedOtp = await redis.get(`pwd_reset:${email}`);

  if (!storedOtp) {
    throw new ApiError(400, "Verification code expired or not found. Please request a new one.");
  }

  if (String(storedOtp) !== otp) {
    throw new ApiError(400, "Invalid verification code");
  }

  const passwordHash = await argon2.hash(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await redis.del(`pwd_reset:${email}`);
  return { success: true };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "User not found");

  const passwordOk = await argon2.verify(user.passwordHash, currentPassword);
  if (!passwordOk) throw new ApiError(400, "Current password is incorrect");

  if (currentPassword === newPassword) {
    throw new ApiError(400, "New password must be different from current password");
  }

  const passwordHash = await argon2.hash(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return { success: true };
}
