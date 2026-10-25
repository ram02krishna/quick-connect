import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "./events.js";
import { isChatMember } from "../services/membership.service.js";
import { recordReceipts } from "../services/message.service.js";

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

export function setupChatSockets(io: Server, socket: Socket) {
  const userId = socket.data.userId as string | undefined;
  if (!userId) return;

  const roomOf = (chatId: string) => `chat:${chatId}`;

  // Join a chat room (only if the user is actually a member).
  socket.on(SOCKET_EVENTS.JOIN_CHAT, async ({ chatId }: { chatId?: string } = {}) => {
    try {
      if (!isId(chatId)) return;

      if (!(await isChatMember(chatId, userId))) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "You are not a member of this chat" });
        return;
      }
      await socket.join(roomOf(chatId));
    } catch (error) {
      console.error("Error joining chat room:", error);
      socket.emit(SOCKET_EVENTS.ERROR, { message: "Failed to join chat room" });
    }
  });

  socket.on(SOCKET_EVENTS.LEAVE_CHAT, ({ chatId }: { chatId?: string } = {}) => {
    if (isId(chatId)) void socket.leave(roomOf(chatId));
  });

  // Typing indicators — only relayed for rooms this socket legitimately joined.
  const relayTyping = (event: typeof SOCKET_EVENTS.TYPING_START | typeof SOCKET_EVENTS.TYPING_STOP) =>
    ({ chatId }: { chatId?: string } = {}) => {
      if (!isId(chatId) || !socket.rooms.has(roomOf(chatId))) return;
      socket.to(roomOf(chatId)).emit(event, { chatId, userId });
    };
  socket.on(SOCKET_EVENTS.TYPING_START, relayTyping(SOCKET_EVENTS.TYPING_START));
  socket.on(SOCKET_EVENTS.TYPING_STOP, relayTyping(SOCKET_EVENTS.TYPING_STOP));

  // Delivery / read receipts. The sender of each message is told directly (via their user
  // room) so their ticks update even when they aren't looking at that chat.
  const handleReceipts = (kind: "delivered" | "read") =>
    async (payload: { messageId?: string; messageIds?: string[]; chatId?: string } = {}) => {
      try {
        const { chatId } = payload;
        if (!isId(chatId)) return;

        const ids = Array.isArray(payload.messageIds)
          ? payload.messageIds
          : payload.messageId
            ? [payload.messageId]
            : [];
        if (ids.length === 0) return;

        if (!(await isChatMember(chatId, userId))) return;

        const acknowledged = await recordReceipts(chatId, userId, ids, kind);
        const event = kind === "read" ? SOCKET_EVENTS.MESSAGE_READ : SOCKET_EVENTS.MESSAGE_DELIVERED;

        for (const { messageId, senderId, receipt } of acknowledged) {
          io.to(`user:${senderId}`).emit(event, { messageId, chatId, receipt });
        }
      } catch (error) {
        console.error(`Error recording ${kind} receipt:`, error);
      }
    };
  socket.on(SOCKET_EVENTS.MESSAGE_DELIVERED, handleReceipts("delivered"));
  socket.on(SOCKET_EVENTS.MESSAGE_READ, handleReceipts("read"));
}
