import { prisma } from "../config/prisma.js";
import { redis } from "../config/redis.js";

// Short-lived positive cache so socket events (typing, receipts, calls) don't hit
// the database every time. Only "is a member" is cached: a cached "no" would lock
// out people who are added to a chat a moment later.
const MEMBER_TTL_SECONDS = 5 * 60;
const CONTACTS_TTL_SECONDS = 5 * 60;

const memberKey = (chatId: string, userId: string) => `member:${chatId}:${userId}`;
const contactsKey = (userId: string) => `user:partners:${userId}`;

export async function isChatMember(chatId: string, userId: string): Promise<boolean> {
  const key = memberKey(chatId, userId);
  try {
    if (await redis.get(key)) return true;
  } catch {
    /* fall through to the database */
  }

  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { userId: true },
  });
  if (!member) return false;

  void redis.set(key, true, { ex: MEMBER_TTL_SECONDS }).catch(() => undefined);
  return true;
}

/** Drops cached membership and contact lists after anyone joins or leaves a chat. */
export async function forgetMembership(chatId: string, userIds: string[]) {
  const keys = [...userIds.map((id) => memberKey(chatId, id)), ...userIds.map(contactsKey)];
  if (keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (error) {
    console.warn("Failed to clear membership cache:", error);
  }
}

/** Contact lists change whenever a chat is created; clear them for everyone involved. */
export async function forgetContacts(userIds: string[]) {
  if (userIds.length === 0) return;
  try {
    await redis.del(...userIds.map(contactsKey));
  } catch (error) {
    console.warn("Failed to clear contact cache:", error);
  }
}

/** Every user that shares at least one chat with `userId`. */
export async function getContactIds(userId: string): Promise<string[]> {
  try {
    const cached = await redis.get<string[]>(contactsKey(userId));
    if (cached) return cached;
  } catch {
    /* fall through */
  }

  const rows = await prisma.chatMember.findMany({
    where: { userId: { not: userId }, chat: { members: { some: { userId } } } },
    select: { userId: true },
  });
  const contacts: string[] = [...new Set<string>(rows.map((row: { userId: string }) => row.userId))];

  void redis.set(contactsKey(userId), contacts, { ex: CONTACTS_TTL_SECONDS }).catch(() => undefined);
  return contacts;
}

export async function getChatMemberIds(chatId: string): Promise<string[]> {
  const rows = await prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } });
  return rows.map((row) => row.userId);
}
