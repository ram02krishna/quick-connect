import { z } from "zod";
import { env } from "../config/env.js";

const CLOUDINARY_HOST = "res.cloudinary.com";

/** True only for https URLs that live in this app's own Cloudinary account. */
export function isOwnCloudinaryUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      url.hostname === CLOUDINARY_HOST &&
      url.pathname.startsWith(`/${env.CLOUDINARY_CLOUD_NAME}/`)
    );
  } catch {
    return false;
  }
}

export const cloudinaryUrl = z
  .string()
  .max(2048)
  .refine(isOwnCloudinaryUrl, "Must be a media URL from this app's storage");

/** Strips characters that are unsafe inside HTTP headers / file names. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f"\\/<>:|?*]+/g, "_")
    .trim()
    .slice(0, 180);
  return cleaned || "download";
}
