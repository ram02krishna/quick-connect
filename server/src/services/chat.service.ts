import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { decryptMessage } from "./crypto.service.js";
import { forgetContacts, forgetMembership } from "./membership.service.js";

const MAX_GROUP_MEMBERS = 100;

// Member profiles are visible to everyone in a chat, so contact details such as
// the email address are deliberately not selected here.
const memberUserSelect = { id: true, name: true, username: true, avatarUrl: true, bio: true } as const;

const chatInclude = {
  members: { include: { user: { select: memberUserSelect } } },
  lastMessage: {
    select: {
      id: true,
      content: true,
      type: true,
      createdAt: true,
      deletedForEveryoneAt: true,
      sender: { select: { id: true, name: true } },
      receipts: { select: { userId: true, deliveredAt: true, readAt: true } },
    },
  },
} as const;

function withDecryptedPreview<T extends { lastMessage?: { content: string | null } | null }>(chat: T): T {
  if (chat.lastMessage?.content) {
    chat.lastMessage.content = decryptMessage(chat.lastMessage.content);
  }
  return chat;
}

/** Incoming messages the user hasn't opened yet, per chat. */
async function getUnreadCounts(userId: string, chatIds?: string[]): Promise<Map<string, number>> {
  const grouped = await prisma.message.groupBy({
    by: ["chatId"],
    where: {
      ...(chatIds ? { chatId: { in: chatIds } } : { chat: { members: { some: { userId } } } }),
      senderId: { not: userId },
      type: { not: "SYSTEM" },
      deletedForEveryoneAt: null,
      deletions: { none: { userId } },
      receipts: { none: { userId, readAt: { not: null } } },
    },
    _count: { _all: true },
  });
  return new Map(grouped.map((row) => [row.chatId, row._count._all]));
}

export async function getOrCreateDirectChat(userId: string, targetUserId: string) {
  if (userId === targetUserId) {
    throw new ApiError(400, "You can't start a chat with yourself");
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!target) throw new ApiError(404, "That user doesn't exist");

  const lockKey = [userId, targetUserId].sort().join(":");

  const { chat, isNew } = await prisma.$transaction(async (tx) => {
    // Serialises concurrent requests for the same pair so two taps can't create two chats.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const existing = await tx.chat.findFirst({
      where: {
        type: "DIRECT",
        AND: [{ members: { some: { userId } } }, { members: { some: { userId: targetUserId } } }],
      },
      include: chatInclude,
    });
    if (existing) return { chat: existing, isNew: false };

    const created = await tx.chat.create({
      data: {
        type: "DIRECT",
        createdBy: userId,
        members: { create: [{ userId }, { userId: targetUserId }] },
      },
      include: chatInclude,
    });
    return { chat: created, isNew: true };
  });

  if (isNew) await forgetContacts([userId, targetUserId]);

  const unread = await getUnreadCounts(userId, [chat.id]);
  return { chat: { ...withDecryptedPreview(chat), unreadCount: unread.get(chat.id) ?? 0 }, isNew };
}

export async function createGroupChat(
  userId: string,
  title: string,
  memberIds: string[],
  photoUrl?: string
) {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new ApiError(400, "Group name is required");

  const uniqueMembers = [...new Set([userId, ...memberIds])];
  if (uniqueMembers.length < 2) throw new ApiError(400, "A group needs at least 2 members");
  if (uniqueMembers.length > MAX_GROUP_MEMBERS) {
    throw new ApiError(400, `Groups can have at most ${MAX_GROUP_MEMBERS} members`);
  }

  const existingUsers = await prisma.user.count({ where: { id: { in: uniqueMembers } } });
  if (existingUsers !== uniqueMembers.length) {
    throw new ApiError(400, "One or more selected users no longer exist");
  }

  const chat = await prisma.chat.create({
    data: {
      type: "GROUP",
      title: cleanTitle,
      photoUrl: photoUrl || null,
      createdBy: userId,
      members: { create: uniqueMembers.map((id) => ({ userId: id })) },
    },
    include: chatInclude,
  });

  await forgetContacts(uniqueMembers);
  return { ...withDecryptedPreview(chat), unreadCount: 0 };
}

export async function getUserChats(userId: string) {
  const [memberships, unread] = await Promise.all([
    prisma.chatMember.findMany({
      where: { userId },
      orderBy: { chat: { updatedAt: "desc" } },
      include: { chat: { include: chatInclude } },
    }),
    getUnreadCounts(userId),
  ]);

  return memberships.map(({ chat }) => ({
    ...withDecryptedPreview(chat),
    unreadCount: unread.get(chat.id) ?? 0,
  }));
}

export async function getChatById(chatId: string, userId: string) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: chatInclude });
  if (!chat) throw new ApiError(404, "Chat not found");

  if (!chat.members.some((member) => member.userId === userId)) {
    throw new ApiError(403, "You are not a member of this chat");
  }

  const unread = await getUnreadCounts(userId, [chatId]);
  return { ...withDecryptedPreview(chat), unreadCount: unread.get(chatId) ?? 0 };
}

async function loadGroupForManagement(chatId: string, requesterId: string) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: { members: true } });
  if (!chat) throw new ApiError(404, "Chat not found");
  if (chat.type !== "GROUP") throw new ApiError(400, "This only works in group chats");
  if (!chat.members.some((member) => member.userId === requesterId)) {
    throw new ApiError(403, "You are not in this chat");
  }
  return chat;
}

export async function addMember(chatId: string, requesterId: string, newUserId: string) {
  const chat = await loadGroupForManagement(chatId, requesterId);

  if (chat.createdBy !== requesterId) throw new ApiError(403, "Only the group owner can add members");
  if (chat.members.some((member) => member.userId === newUserId)) {
    throw new ApiError(400, "That user is already in this chat");
  }
  if (chat.members.length >= MAX_GROUP_MEMBERS) {
    throw new ApiError(400, `Groups can have at most ${MAX_GROUP_MEMBERS} members`);
  }

  const newUser = await prisma.user.findUnique({ where: { id: newUserId }, select: { id: true } });
  if (!newUser) throw new ApiError(404, "That user doesn't exist");

  const member = await prisma.chatMember.create({
    data: { chatId, userId: newUserId },
    include: { user: { select: memberUserSelect } },
  });

  await forgetMembership(chatId, [newUserId, ...chat.members.map((m) => m.userId)]);
  return member;
}

/**
 * Removes someone from a group. Anyone may remove themselves; only the owner may
 * remove other people. If the owner leaves, ownership passes to the longest-standing
 * member, and an emptied group is deleted.
 */
export async function removeMember(chatId: string, requesterId: string, targetUserId: string) {
  const chat = await loadGroupForManagement(chatId, requesterId);

  const target = chat.members.find((member) => member.userId === targetUserId);
  if (!target) throw new ApiError(404, "That user is not in this chat");

  if (requesterId !== targetUserId && chat.createdBy !== requesterId) {
    throw new ApiError(403, "Only the group owner can remove other members");
  }

  const remaining = chat.members
    .filter((member) => member.userId !== targetUserId)
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());

  if (remaining.length === 0) {
    await prisma.chat.delete({ where: { id: chatId } });
    await forgetMembership(chatId, [targetUserId]);
    return { chatDeleted: true, newOwnerId: null as string | null, remainingMemberIds: [] as string[] };
  }

  let newOwnerId: string | null = null;
  await prisma.$transaction(async (tx) => {
    await tx.chatMember.deleteMany({ where: { chatId, userId: targetUserId } });
    if (chat.createdBy === targetUserId) {
      newOwnerId = remaining[0].userId;
      await tx.chat.update({ where: { id: chatId }, data: { createdBy: newOwnerId } });
    }
  });

  await forgetMembership(chatId, [targetUserId, ...remaining.map((m) => m.userId)]);
  return { chatDeleted: false, newOwnerId, remainingMemberIds: remaining.map((m) => m.userId) };
}

export async function updateGroupChat(
  chatId: string,
  userId: string,
  data: { title?: string; photoUrl?: string | null }
) {
  const chat = await loadGroupForManagement(chatId, userId);
  if (chat.createdBy !== userId) throw new ApiError(403, "Only the group owner can edit this group");

  const update: { title?: string; photoUrl?: string | null } = {};
  if (data.title !== undefined) {
    const title = data.title.trim();
    if (!title) throw new ApiError(400, "Group name cannot be empty");
    update.title = title;
  }
  if (data.photoUrl !== undefined) update.photoUrl = data.photoUrl || null;

  const updated = await prisma.chat.update({ where: { id: chatId }, data: update });
  return { chat: updated, memberIds: chat.members.map((member) => member.userId) };
}

/**
 * Deleting removes the conversation for everyone: direct chats can be deleted by
 * either person, groups only by the owner (members can leave instead).
 */
export async function deleteChat(chatId: string, userId: string) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: { members: true } });
  if (!chat) throw new ApiError(404, "Chat not found");

  if (!chat.members.some((member) => member.userId === userId)) {
    throw new ApiError(403, "You are not a member of this chat");
  }
  if (chat.type === "GROUP" && chat.createdBy !== userId) {
    throw new ApiError(403, "Only the group owner can delete a group. You can leave it instead.");
  }

  await prisma.chat.delete({ where: { id: chatId } });
  await forgetMembership(chatId, chat.members.map((member) => member.userId));
  return chat;
}
