import crypto from "crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { encryptDeterministic, decryptDeterministic } from "./crypto.service.js";
import { redis } from "../config/redis.js";
import { sendMail } from "../config/mail.js";

const OTP_TTL_SECONDS = 15 * 60;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

type OtpPurpose = "verify" | "reset";

const otpKey = (purpose: OtpPurpose, email: string) =>
  purpose === "verify" ? `otp:${email}` : `pwd_reset:${email}`;
const attemptsKey = (purpose: OtpPurpose, email: string) => `otp_attempts:${purpose}:${email}`;
const cooldownKey = (purpose: OtpPurpose, email: string) => `otp_cooldown:${purpose}:${email}`;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Cryptographically secure 6-digit code (Math.random is predictable). */
function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Emails are stored deterministically encrypted. Accounts created before emails
 * were lower-cased may be stored with their original casing, so lookups try both.
 */
function emailLookupValues(raw: string) {
  const trimmed = raw.trim();
  return [...new Set([encryptDeterministic(trimmed), encryptDeterministic(trimmed.toLowerCase())])];
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const maskedLocal =
    local.length > 2 ? local.slice(0, 2) + "*".repeat(local.length - 2) : "*".repeat(local.length);
  return `${maskedLocal}@${domain}`;
}

function createToken(userId: string, email: string) {
  return jwt.sign({ id: userId, email }, env.JWT_SECRET, { expiresIn: "7d" });
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function otpEmailHtml(heading: string, intro: string, otp: string) {
  return `
    <div style="font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #1b1a17;">
      <h2 style="margin: 0 0 12px;">${escapeHtml(heading)}</h2>
      <p style="margin: 0 0 20px; line-height: 1.5;">${escapeHtml(intro)}</p>
      <div style="background: #f4f1ea; padding: 18px; text-align: center; border-radius: 8px; margin: 0 0 20px;">
        <span style="font-size: 30px; font-weight: 700; letter-spacing: 6px;">${otp}</span>
      </div>
      <p style="color: #6f6a5d; font-size: 13px; margin: 0;">The code expires in 15 minutes. If you didn't request it, you can ignore this email.</p>
    </div>
  `;
}

/**
 * Generates and emails a one-time code. Throws 429 when called again inside the
 * cooldown window so the endpoint can't be used to spam someone's inbox.
 */
async function issueOtp(purpose: OtpPurpose, email: string) {
  const claimed = await redis.set(cooldownKey(purpose, email), "1", {
    ex: OTP_RESEND_COOLDOWN_SECONDS,
    nx: true,
  });
  if (!claimed) {
    throw new ApiError(429, "Please wait a minute before requesting another code.");
  }

  const otp = generateOTP();
  await Promise.all([
    redis.set(otpKey(purpose, email), otp, { ex: OTP_TTL_SECONDS }),
    redis.del(attemptsKey(purpose, email)),
  ]);

  try {
    await sendMail({
      to: email,
      subject: purpose === "verify" ? "Verify your QuickConnect account" : "Reset your QuickConnect password",
      html:
        purpose === "verify"
          ? otpEmailHtml("Verify your email", "Use this 6-digit code to finish creating your QuickConnect account.", otp)
          : otpEmailHtml("Reset your password", "Use this 6-digit code to choose a new QuickConnect password.", otp),
    });
  } catch (error) {
    // Let the user retry immediately instead of waiting out the cooldown for a mail that never left.
    await redis.del(cooldownKey(purpose, email));
    console.error(`Failed to send ${purpose} email:`, error);
    throw new ApiError(502, "We couldn't send the email right now. Please try again in a moment.");
  }
}

/** Checks a submitted code, enforcing a hard cap on guesses per issued code. */
async function consumeOtp(purpose: OtpPurpose, email: string, submitted: string) {
  const stored = await redis.get<string | number>(otpKey(purpose, email));
  if (stored === null || stored === undefined) {
    throw new ApiError(400, "That code has expired. Please request a new one.");
  }

  const attempts = await redis.incr(attemptsKey(purpose, email));
  if (attempts === 1) await redis.expire(attemptsKey(purpose, email), OTP_TTL_SECONDS);
  if (attempts > OTP_MAX_ATTEMPTS) {
    await redis.del(otpKey(purpose, email));
    throw new ApiError(429, "Too many incorrect attempts. Please request a new code.");
  }

  if (!safeEqual(String(stored), submitted)) {
    const left = OTP_MAX_ATTEMPTS - attempts;
    throw new ApiError(400, left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Incorrect code.");
  }

  await Promise.all([redis.del(otpKey(purpose, email)), redis.del(attemptsKey(purpose, email))]);
}

// Used to keep login timing similar whether or not the account exists.
let dummyHashPromise: Promise<string> | null = null;
const getDummyHash = () => (dummyHashPromise ??= argon2.hash("quickconnect-timing-pad"));

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  emailVerified: true,
} as const;

// ─── register / verify ────────────────────────────────────────────────────────

interface RegisterInput {
  name: string;
  username: string;
  email: string;
  password: string;
}

export async function register(input: RegisterInput) {
  const { name, username } = input;
  const email = normalizeEmail(input.email);
  const encryptedEmail = encryptDeterministic(email);
  const passwordHash = await argon2.hash(input.password);

  const existingByEmail = await prisma.user.findFirst({
    where: { email: { in: emailLookupValues(email) } },
  });
  const existingByUsername = await prisma.user.findUnique({ where: { username } });

  if (existingByEmail?.emailVerified) throw new ApiError(409, "This email is already registered");

  // An earlier sign-up that never confirmed its email doesn't own the address,
  // so a fresh sign-up is allowed to take that record over.
  const reclaimable = existingByEmail && !existingByEmail.emailVerified ? existingByEmail : null;

  if (existingByUsername && existingByUsername.id !== reclaimable?.id) {
    throw new ApiError(409, "This username is already taken");
  }

  let user;
  try {
    user = reclaimable
      ? await prisma.user.update({
          where: { id: reclaimable.id },
          data: { name, username, email: encryptedEmail, passwordHash },
          select: publicUserSelect,
        })
      : await prisma.user.create({
          data: { name, username, email: encryptedEmail, passwordHash },
          select: publicUserSelect,
        });
  } catch (error: any) {
    if (error?.code === "P2002") throw new ApiError(409, "That username or email is already in use");
    throw error;
  }

  // The account exists either way; if mail fails the user can use "Resend code".
  try {
    await issueOtp("verify", email);
  } catch (error) {
    console.warn("Registration succeeded but the verification email was not sent:", (error as Error).message);
  }

  return { ...user, email: decryptDeterministic(user.email) };
}

export async function verifyEmail(userId: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "Account not found");
  if (user.emailVerified) throw new ApiError(400, "Email is already verified");

  await consumeOtp("verify", decryptDeterministic(user.email), code);
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  return { success: true };
}

export async function resendVerification(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "Account not found");
  if (user.emailVerified) throw new ApiError(400, "Email is already verified");

  await issueOtp("verify", decryptDeterministic(user.email));
  return { success: true };
}

// ─── login ────────────────────────────────────────────────────────────────────

interface LoginInput {
  identifier: string;
  password: string;
}

export async function login(input: LoginInput) {
  const identifier = input.identifier.trim();

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: { in: emailLookupValues(identifier) } }] },
  });

  const passwordOk = await argon2.verify(user?.passwordHash ?? (await getDummyHash()), input.password);
  if (!user || !passwordOk) throw new ApiError(401, "Invalid credentials");

  const email = decryptDeterministic(user.email);

  if (!user.emailVerified) {
    // Nudge a fresh code out, but never let a cooldown error mask the real message.
    try {
      await issueOtp("verify", email);
    } catch {
      /* cooldown or mail failure — the verify page offers "Resend code" */
    }
    throw new ApiError(403, "Please verify your email before signing in.", {
      requiresVerification: true,
      userId: user.id,
      email: maskEmail(email),
    });
  }

  return {
    token: createToken(user.id, email),
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    },
  };
}

// ─── password reset ───────────────────────────────────────────────────────────

/**
 * Always answers the same way — whether or not the account exists — so this
 * endpoint can't be used to find out who has an account.
 */
export async function forgotPassword(identifier: string) {
  const trimmed = identifier.trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: trimmed }, { email: { in: emailLookupValues(trimmed) } }] },
  });

  if (!user) return { userId: crypto.randomUUID() };

  try {
    await issueOtp("reset", decryptDeterministic(user.email));
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 429) throw error;
    console.error("Password reset email failed:", error);
  }

  return { userId: user.id };
}

export async function resetPassword(userId: string, otp: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(400, "That code has expired. Please request a new one.");

  await consumeOtp("reset", decryptDeterministic(user.email), otp);

  const passwordHash = await argon2.hash(newPassword);
  await prisma.user.update({
    where: { id: userId },
    // Receiving the code at this address also proves the user owns it.
    data: { passwordHash, emailVerified: true },
  });

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
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return { success: true };
}
