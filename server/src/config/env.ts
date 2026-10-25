import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("5000"),
  // Normalised: a trailing slash would silently break the CORS origin match.
  CLIENT_URL: z
    .string()
    .url()
    .transform((value) => value.replace(/\/+$/, "")),

  DATABASE_URL: z.string(),

  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string(),

  JWT_SECRET: z.string().min(32),

  COOKIE_SECRET: z.string().min(32),

  RESEND_API_KEY: z.string(),
  EMAIL_FROM: z.string(),

  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),

  RATE_LIMIT_WINDOW_MS: z.string().default("900000"),
  RATE_LIMIT_MAX_REQUESTS: z.string().default("1000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid or missing environment variables:\n",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const env = parsed.data;

export type Env = typeof env;
