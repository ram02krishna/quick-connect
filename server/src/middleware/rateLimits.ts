import { rateLimit } from "express-rate-limit";

const base = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
};

/**
 * Guards password / OTP guessing. Only failed attempts count, so normal
 * users are never throttled for logging in successfully.
 */
export const credentialLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many failed attempts — please wait 15 minutes and try again.",
  },
});

/** Guards endpoints that send an email (registration, resend, password reset). */
export const emailLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 15,
  message: {
    success: false,
    message: "Too many email requests — please try again in an hour.",
  },
});
