import type { Request, Response } from "express";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { prisma } from "../config/prisma.js";
import * as mediaService from "../services/media.service.js";
import { cloudinary } from "../config/cloudinary.js";
import { env } from "../config/env.js";
import { sendSuccess } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { isOwnCloudinaryUrl, sanitizeFileName } from "../utils/validators.js";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CHAT_FOLDER = new RegExp(`^chat-app/(${UUID})$`, "i");

// Only these may be rendered inline. Anything else (HTML, SVG, scripts…) is always
// forced to download, otherwise the proxy would serve user-supplied markup from our API origin.
const INLINE_SAFE_TYPE = /^(image\/(png|jpe?g|gif|webp|avif)|video\/|audio\/|application\/pdf)/i;

// generate a Cloudinary upload signature for direct client-side uploads
export async function getSignature(req: Request, res: Response) {
  const folder = typeof req.query.folder === "string" ? req.query.folder : "";
  if (!folder) throw new ApiError(400, "Folder is required");

  const isShared = folder === "chat-app/avatars" || folder === "chat-app/general";
  const chatMatch = folder.match(CHAT_FOLDER);

  if (!isShared && !chatMatch) throw new ApiError(400, "Invalid folder path");

  // Uploading into a chat's folder requires being in that chat.
  if (chatMatch) {
    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: chatMatch[1], userId: req.user!.id } },
    });
    if (!membership) throw new ApiError(403, "You are not in this chat");
  }

  sendSuccess(res, "Signature generated", mediaService.generateUploadSignature(folder));
}

// update user avatar URL after a direct Cloudinary upload
export async function updateAvatarUrl(req: Request, res: Response) {
  const { avatarUrl } = req.body;
  if (typeof avatarUrl !== "string" || !isOwnCloudinaryUrl(avatarUrl)) {
    throw new ApiError(400, "avatarUrl must be an uploaded image from this app");
  }

  await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl } });
  sendSuccess(res, "Avatar updated", { avatarUrl });
}

// Resolve resource type + public id from a stored Cloudinary URL so a signed fetch URL
// can be generated (plain fetches 401 for private/raw resources).
function toSignedFetchUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const match = parsed.pathname.match(/\/(image|video|raw|auto)\/upload\/(?:.*?\/)?v\d+\/(.+)$/);
  if (!match) throw new ApiError(400, "Unrecognised media URL");

  const resourceType = (match[1] === "auto" ? "raw" : match[1]) as "image" | "video" | "raw";
  return cloudinary.url(decodeURIComponent(match[2]), {
    resource_type: resourceType,
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + 300,
    type: "upload",
  });
}

// Proxy a file so downloads keep their original name and extension.
export async function downloadFile(req: Request, res: Response) {
  const url = typeof req.query.url === "string" ? req.query.url : "";
  const requestedName = typeof req.query.name === "string" ? req.query.name : "";
  const wantsInline = req.query.inline === "true";

  if (!url) throw new ApiError(400, "URL query parameter is required");
  if (!requestedName) throw new ApiError(400, "Filename query parameter is required");

  // The server fetches this URL, so it must never be an arbitrary address (SSRF).
  if (!isOwnCloudinaryUrl(url)) throw new ApiError(400, "Only files stored by this app can be downloaded");

  const upstream = await fetch(toSignedFetchUrl(url), { redirect: "error" }).catch((err) => {
    console.error("Download proxy fetch failed:", err);
    throw new ApiError(502, "Could not reach file storage");
  });
  if (!upstream.ok || !upstream.body) {
    throw new ApiError(upstream.status === 404 ? 404 : 502, "Could not fetch the file from storage");
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const inline = wantsInline && INLINE_SAFE_TYPE.test(contentType);
  const fileName = sanitizeFileName(requestedName);
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_");

  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  if (inline) {
    // Let the web client frame it (e.g. PDF preview) while forbidding scripts in the document.
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", `default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self' ${env.CLIENT_URL}`);
  }

  const length = upstream.headers.get("content-length");
  if (length) res.setHeader("Content-Length", length);

  await pipeline(Readable.fromWeb(upstream.body as any), res);
}
