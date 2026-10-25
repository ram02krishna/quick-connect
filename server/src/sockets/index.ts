import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { SOCKET_EVENTS } from "./events.js";
import { handleUserConnect, handleUserDisconnect } from "./presence.js";
import { setupChatSockets } from "./chat.socket.js";
import { setupCallSockets } from "./call.socket.js";

export function initializeSockets(io: Server) {
  // Verify the JWT before letting a socket connect.
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token || typeof token !== "string") {
      return next(new Error("Authentication error: Token missing"));
    }

    try {
      const rawToken = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
      const payload = jwt.verify(rawToken, env.JWT_SECRET) as { id: string; email: string };

      // socket.data (unlike ad-hoc properties) is restored when a dropped connection is recovered.
      socket.data.userId = payload.id;
      next();
    } catch {
      next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  io.on(SOCKET_EVENTS.CONNECTION, async (socket: Socket) => {
    const userId = socket.data.userId as string | undefined;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    // A personal room lets the server address every tab/device a user has open.
    await socket.join(`user:${userId}`);
    await handleUserConnect(userId, socket.id, io);

    setupChatSockets(io, socket);
    setupCallSockets(io, socket);

    socket.on(SOCKET_EVENTS.DISCONNECT, async () => {
      await handleUserDisconnect(userId, io);
    });
  });
}
