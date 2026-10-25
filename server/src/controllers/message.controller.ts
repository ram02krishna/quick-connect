import type { Request, Response } from "express";
import * as messageService from "../services/message.service.js";
import { sendSuccess } from "../utils/ApiResponse.js";
import { getIO } from "../sockets/io.js";
import { SOCKET_EVENTS } from "../sockets/events.js";

export async function sendNewMessage(req: Request, res: Response) {
  const { content, type, attachments } = req.body;
  const { message, memberIds } = await messageService.sendMessage(
    req.params.chatId as string,
    req.user!.id,
    content,
    type,
    attachments
  );

  const io = getIO();
  for (const memberId of memberIds) {
    io.to(`user:${memberId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, message);
  }

  sendSuccess(res, "Message sent", { message }, 201);
}

export async function fetchChatMessages(req: Request, res: Response) {
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = Number(req.query.limit) || 30;

  const messages = await messageService.getChatMessages(
    req.params.chatId as string,
    req.user!.id,
    cursor,
    limit
  );

  sendSuccess(res, "Messages fetched", { messages });
}

export async function deleteChatMessage(req: Request, res: Response) {
  const result = await messageService.deleteMessage(
    req.params.chatId as string,
    req.params.messageId as string,
    req.user!.id,
    req.body.scope
  );

  if (result.scope === "everyone") {
    const io = getIO();
    for (const memberId of result.memberIds) {
      io.to(`user:${memberId}`).emit(SOCKET_EVENTS.MESSAGE_DELETED_FOR_EVERYONE, {
        chatId: result.chatId,
        messageId: result.messageId,
      });
    }
  }

  sendSuccess(res, "Message deleted", { result });
}
