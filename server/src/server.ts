import { createServer } from "http";
import { Server } from "socket.io";

import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { initializeSockets } from "./sockets/index.js";
import { setIO } from "./sockets/io.js";
import { resetPresence } from "./sockets/presence.js";

const PORT = Number(env.PORT) || 5000;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: env.CLIENT_URL,
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  // Detect dropped connections in ~30s at worst instead of the 45s default.
  pingTimeout: 20000,
  pingInterval: 10000,
  perMessageDeflate: { threshold: 1024 },
  maxHttpBufferSize: 1e6,
});

setIO(io);
initializeSockets(io);

async function startServer() {
  try {
    await prisma.$connect();
    console.log("Database connected");

    await resetPresence();

    httpServer.listen(PORT, () => {
      console.log(`QuickConnect server running on port ${PORT} (${env.NODE_ENV})`);
      console.log(`Client: ${env.CLIENT_URL}`);
      console.log(`Health: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down...`);

  const forceExit = setTimeout(() => {
    console.error("Forced shutdown after 10s");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  // io.close() also closes the underlying HTTP server and drops open sockets;
  // waiting on httpServer.close() alone would hang on long-lived websocket connections.
  await io.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// A bug in one request/socket handler must not take every connected user down with it.
process.on("unhandledRejection", (reason: unknown) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err: Error) => {
  console.error("Uncaught Exception:", err.message, err.stack);
  process.exit(1);
});

void startServer();
