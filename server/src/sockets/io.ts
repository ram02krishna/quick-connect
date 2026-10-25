import type { Server } from "socket.io";

// Controllers need the Socket.IO server, but importing it from server.ts creates
// a circular import (server -> app -> routes -> controllers -> server).
// server.ts registers the instance here once it exists instead.
let instance: Server | null = null;

export function setIO(io: Server) {
  instance = io;
}

export function getIO(): Server {
  if (!instance) throw new Error("Socket.IO server has not been initialised yet");
  return instance;
}
