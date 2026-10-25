import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import type { MessageType } from "@prisma/client";
import { encryptMessage, decryptMessage } from "./crypto.service.js";

export const MAX_MESSAGE_LENGTH = 5000;
const MAX_PAGE_SIZE = 100;
const MAX_RECEIPT_BATCH = 100;

function decryptMessageObj<T extends { content: string | null }>(message: T): T {
  if (message?.content) message.content = decryptMessage(message.content);
  return message;
}

const messageInclude = {
  sender: { select: { id: true, name: true, username: true, avatarUrl: true } },
  attachments: true,
  receipts: { select: { userId: true, deliveredAt: true, readAt: true } },
} as const;

const deletedMessageText = "This message was deleted";

export interface AttachmentInput {
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  mimeType: string;
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  content: string | null | undefined,
  type: MessageType = "TEXT",
  attachments?: AttachmentInput[]
): Promise<{ message: any; memberIds: string[] }> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { members: { select: { userId: true } } },
  });
  if (!chat) throw new ApiError(404, "Chat not found");

  const memberIds = chat.members.map((member) => member.userId);
  // SYSTEM messages are only ever created by the server (e.g. "Ana left the group"),
  // sometimes right after the sender has been removed, so they skip this check.
  if (type !== "SYSTEM" && !memberIds.includes(senderId)) {
    throw new ApiError(403, "You are not in this chat");
  }

  const text = content?.trim() ?? "";
  const hasAttachments = Boolean(attachments && attachments.length > 0);
  if (type === "TEXT" && !text) throw new ApiError(400, "A message can't be empty");
  if (type !== "TEXT" && type !== "SYSTEM" && !hasAttachments) {
    throw new ApiError(400, "Attachments are required for this message type");
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new ApiError(400, `Messages can be at most ${MAX_MESSAGE_LENGTH} characters`);
  }

  // The message and the chat's "last message" pointer change together or not at all,
  // so the chat list can never point at a message that failed to save.
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        chatId,
        senderId,
        content: text ? encryptMessage(text) : null,
        type,
        ...(hasAttachments && {
          attachments: {
            create: attachments!.map((att) => ({
              fileName: att.fileName,
              fileType: att.fileType,
              fileSize: att.fileSize,
              fileUrl: att.fileUrl,
              mimeType: att.mimeType,
            })),
          },
        }),
      },
      include: messageInclude,
    });

    await tx.chat.update({
      where: { id: chatId },
      data: { lastMessageId: created.id, updatedAt: new Date() },
    });

    return created;
  });

  return { message: decryptMessageObj(message), memberIds };
}

/**
 * Messages are returned oldest-first. Pass `cursor` (the oldest message id you
 * already have) to page backwards through history.
 */
export async function getChatMessages(chatId: string, userId: string, cursor?: string, limit = 30) {
  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  if (!membership) throw new ApiError(403, "You are not in this chat");

  const take = Math.min(Math.max(Math.trunc(limit) || 30, 1), MAX_PAGE_SIZE);

  const messages = await prisma.message.findMany({
    where: { chatId, deletions: { none: { userId } } },
    take,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: messageInclude,
  });

  return messages.map(decryptMessageObj).reverse();
}

export async function deleteMessage(
  chatId: string,
  messageId: string,
  userId: string,
  scope: "me" | "everyone"
) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { chat: { include: { members: { select: { userId: true } } } } },
  });

  if (!message || message.chatId !== chatId) throw new ApiError(404, "Message not found");

  const memberIds = message.chat.members.map((member) => member.userId);
  if (!memberIds.includes(userId)) throw new ApiError(403, "You are not a member of this chat");
  if (message.type === "SYSTEM") throw new ApiError(400, "System messages can't be deleted");

  if (scope === "everyone") {
    if (message.senderId !== userId) {
      throw new ApiError(403, "Only the sender can delete this message for everyone");
    }
    if (message.deletedForEveryoneAt) return { scope, chatId, messageId, memberIds };

    const deletedAt = new Date();
    await prisma.message.update({
      where: { id: messageId },
      data: {
        content: encryptMessage(deletedMessageText),
        type: "TEXT",
        deletedForEveryoneAt: deletedAt,
        attachments: { deleteMany: {} },
      },
    });
    return { scope, chatId, messageId, memberIds, deletedAt };
  }

  await prisma.messageDeletion.upsert({
    where: { messageId_userId: { messageId, userId } },
    update: {},
    create: { messageId, userId },
  });
  return { scope, chatId, messageId, memberIds: [userId] };
}

/**
 * Records delivered/read receipts for messages other people sent in a chat.
 * Anything that isn't in that chat, or was sent by the caller, is ignored.
 * Returns who sent each acknowledged message so the right people can be notified.
 */
export async function recordReceipts(
  chatId: string,
  userId: string,
  messageIds: string[],
  kind: "delivered" | "read"
) {
  const ids = [...new Set(messageIds.filter((id) => typeof id === "string"))].slice(0, MAX_RECEIPT_BATCH);
  if (ids.length === 0) return [];

  const messages = await prisma.message.findMany({
    where: { id: { in: ids }, chatId, senderId: { not: userId }, type: { not: "SYSTEM" } },
    select: { id: true, senderId: true },
  });
  if (messages.length === 0) return [];

  const now = new Date();
  await prisma.$transaction(
    messages.map(({ id }) =>
      prisma.messageReceipt.upsert({
        where: { messageId_userId: { messageId: id, userId } },
        update: kind === "read" ? { readAt: now } : { deliveredAt: now },
        create:
          kind === "read"
            ? { messageId: id, userId, deliveredAt: now, readAt: now }
            : { messageId: id, userId, deliveredAt: now },
      })
    )
  );

  return messages.map(({ id, senderId }) => ({
    messageId: id,
    senderId,
    receipt: { userId, deliveredAt: now, readAt: kind === "read" ? now : null },
  }));
}
