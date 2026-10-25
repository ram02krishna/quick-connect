import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { sendSuccess } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { decryptDeterministic } from "../services/crypto.service.js";

const ownProfileSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  emailVerified: true,
  avatarUrl: true,
  bio: true,
  createdAt: true,
} as const;

export async function getMe(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: ownProfileSelect,
  });

  if (!user) throw new ApiError(404, "User not found");

  sendSuccess(res, "Profile fetched", { user: { ...user, email: decryptDeterministic(user.email) } });
}

export async function updateMe(req: Request, res: Response) {
  const { name, bio, avatarUrl, username } = req.body;

  if (username) {
    const taken = await prisma.user.findFirst({
      where: { username, id: { not: req.user!.id } },
      select: { id: true },
    });
    if (taken) throw new ApiError(409, "That username is already taken");
  }

  let updated;
  try {
    updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(name && { name }),
        ...(bio !== undefined && { bio: bio ? bio : null }),
        // `null` or "" removes the picture; leaving the field out keeps it.
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
        ...(username && { username }),
      },
      select: ownProfileSelect,
    });
  } catch (error: any) {
    if (error?.code === "P2002") throw new ApiError(409, "That username is already taken");
    throw error;
  }

  sendSuccess(res, "Profile updated", { user: { ...updated, email: decryptDeterministic(updated.email) } });
}

export async function searchUsers(req: Request, res: Response) {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 50) : "";

  if (q.length < 2) {
    sendSuccess(res, "Search results", { users: [] });
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      id: { not: req.user!.id },
      // People who never confirmed their email shouldn't be discoverable.
      emailVerified: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, username: true, avatarUrl: true },
    orderBy: { name: "asc" },
    take: 20,
  });

  sendSuccess(res, "Search results", { users });
}
