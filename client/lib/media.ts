import api from "./api";

export type AttachmentKind = "IMAGE" | "VIDEO" | "AUDIO" | "FILE";

export const MAX_UPLOAD_BYTES: Record<AttachmentKind, number> = {
  IMAGE: 10 * 1024 * 1024,
  VIDEO: 100 * 1024 * 1024,
  AUDIO: 50 * 1024 * 1024,
  FILE: 50 * 1024 * 1024,
};

export function kindOfFile(file: { type: string }): AttachmentKind {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  if (file.type.startsWith("audio/")) return "AUDIO";
  return "FILE";
}

/** Uploads straight to Cloudinary using a short-lived signature from our API. */
export async function uploadToCloudinary(file: File, folder: string): Promise<{ url: string }> {
  const sig = await api.get("/media/signature", { params: { folder } });
  const { signature, timestamp, cloudName, apiKey, folder: signedFolder } = sig.data.data;

  const body = new FormData();
  body.append("file", file);
  body.append("api_key", apiKey);
  body.append("timestamp", String(timestamp));
  body.append("signature", signature);
  body.append("folder", signedFolder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, { method: "POST", body });
  if (!res.ok) throw new Error("Upload failed. Please try again.");

  const uploaded = await res.json();
  return { url: uploaded.secure_url as string };
}

/** Shrinks photos before upload; falls back to the original if compression fails. */
export async function compressImage(file: File, maxSizeMB = 1, maxDimension = 1920): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const out = await imageCompression(file, { maxSizeMB, maxWidthOrHeight: maxDimension, useWebWorker: true });
    return new File([out], file.name, { type: out.type, lastModified: Date.now() });
  } catch (err) {
    console.warn("Image compression skipped:", err);
    return file;
  }
}
