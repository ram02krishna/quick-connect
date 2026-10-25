import type { Request, Response } from "express";
import * as chatService from "../services/chat.service.js";
import { sendMessage } from "../services/message.service.js";
import { sendSuccess } from "../utils/ApiResponse.js";
import { getIO } from "../sockets/io.js";
import { SOCKET_EVENTS } from "../sockets/events.js";
import { getOnlineStatuses } from "../sockets/presence.js";
import { prisma } from "../config/prisma.js";

/** Posts a server-generated announcement ("Ana added Ben") into a chat and pushes it live. */
async function announce(chatId: string, actorId: string, text: string) {
  const { message, memberIds } = await sendMessage(chatId, actorId, text, "SYSTEM");
  const io = getIO();
  for (const memberId of memberIds) {
    io.to(`user:${memberId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, message);
  }
  return memberIds;
}

function notifyChatUpdated(chatId: string, memberIds: string[]) {
  const io = getIO();
  for (const memberId of memberIds) {
    io.to(`user:${memberId}`).emit(SOCKET_EVENTS.CHAT_UPDATED, { chatId });
  }
}

async function nameOf(userId: string, fallback: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name || fallback;
}

export async function startNewChat(req: Request, res: Response) {
  const { targetUserId } = req.body;
  const { chat, isNew } = await chatService.getOrCreateDirectChat(req.user!.id, targetUserId);
  const onlineStatuses = await getOnlineStatuses([targetUserId]);

  sendSuccess(res, isNew ? "Chat created" : "Chat opened", { chat, onlineStatuses }, isNew ? 201 : 200);
}

export async function createGroup(req: Request, res: Response) {
  const { title, memberIds, photoUrl } = req.body;
  const chat = await chatService.createGroupChat(req.user!.id, title, memberIds, photoUrl);

  const creatorName = await nameOf(req.user!.id, "Someone");
  await announce(chat.id, req.user!.id, `${creatorName} created the group "${chat.title}"`);

  sendSuccess(res, "Group created", { chat }, 201);
}

export async function getAllMyChats(req: Request, res: Response) {
  const chats = await chatService.getUserChats(req.user!.id);

  const partnerIds = chats
    .filter((chat) => chat.type === "DIRECT")
    .map((chat) => chat.members.find((member) => member.userId !== req.user!.id)?.user.id)
    .filter((id): id is string => Boolean(id));

  const onlineStatuses = partnerIds.length > 0 ? await getOnlineStatuses(partnerIds) : {};

  sendSuccess(res, "Chats fetched", { chats, onlineStatuses });
}

export async function getChat(req: Request, res: Response) {
  const chat = await chatService.getChatById(req.params.chatId as string, req.user!.id);
  sendSuccess(res, "Chat fetched", { chat });
}

export async function updateChat(req: Request, res: Response) {
  const { title, photoUrl } = req.body;
  const { chat, memberIds } = await chatService.updateGroupChat(
    req.params.chatId as string,
    req.user!.id,
    { title, photoUrl }
  );

  notifyChatUpdated(chat.id, memberIds);
  sendSuccess(res, "Group updated", { chat });
}

export async function addMember(req: Request, res: Response) {
  const chatId = req.params.chatId as string;
  const { userId } = req.body;
  const member = await chatService.addMember(chatId, req.user!.id, userId);

  const [adder, added] = await Promise.all([nameOf(req.user!.id, "Someone"), nameOf(userId, "a new member")]);
  const memberIds = await announce(chatId, req.user!.id, `${adder} added ${added}`);
  notifyChatUpdated(chatId, memberIds);

  sendSuccess(res, "Member added", { member }, 201);
}

async function removeFromGroup(req: Request, res: Response, targetUserId: string) {
  const chatId = req.params.chatId as string;
  const requesterId = req.user!.id;
  const isSelf = requesterId === targetUserId;

  const [requesterName, targetName] = await Promise.all([
    nameOf(requesterId, "Someone"),
    nameOf(targetUserId, "a member"),
  ]);

  const result = await chatService.removeMember(chatId, requesterId, targetUserId);
  const io = getIO();

  // The removed person's open tabs must stop receiving this chat's typing/receipt/call events.
  io.in(`user:${targetUserId}`).socketsLeave(`chat:${chatId}`);
  io.to(`user:${targetUserId}`).emit(SOCKET_EVENTS.CHAT_DELETED, { chatId });

  if (!result.chatDeleted) {
    await announce(
      chatId,
      requesterId,
      isSelf ? `${targetName} left the group` : `${requesterName} removed ${targetName}`
    );
    notifyChatUpdated(chatId, result.remainingMemberIds);
  }

  sendSuccess(res, isSelf ? "You left the group" : "Member removed");
}

export async function removeMember(req: Request, res: Response) {
  return removeFromGroup(req, res, req.params.userId as string);
}

export async function leaveChat(req: Request, res: Response) {
  return removeFromGroup(req, res, req.user!.id);
}

export async function deleteChat(req: Request, res: Response) {
  const chatId = req.params.chatId as string;
  const chat = await chatService.deleteChat(chatId, req.user!.id);

  const io = getIO();
  for (const member of chat.members) {
    io.in(`user:${member.userId}`).socketsLeave(`chat:${chatId}`);
    io.to(`user:${member.userId}`).emit(SOCKET_EVENTS.CHAT_DELETED, { chatId });
  }

  sendSuccess(res, "Chat deleted");
}
