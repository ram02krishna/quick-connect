import type { Server } from "socket.io";
import { redis } from "../config/redis.js";
import { prisma } from "../config/prisma.js";
import { SOCKET_EVENTS } from "./events.js";
import { getContactIds } from "../services/membership.service.js";

const ONLINE_SET = "online_users";
const lastSeenKey = (userId: string) => `user:last_seen:${userId}`;

type PresenceStatus = { status: "online" | "offline"; lastSeen?: string | null };

/**
 * Presence used to be tracked with a Redis counter (INCR/DECR per socket). A crash or
 * redeploy skipped the decrements, leaving people "online" forever. Asking Socket.IO how
 * many sockets a user actually has right now can't drift, so that is the source of truth.
 */
async function liveSocketCount(io: Server, userId: string) {
  return (await io.in(`user:${userId}`).fetchSockets()).length;
}

/** Called once on boot: nobody is connected yet, so discard presence left by a previous process. */
export async function resetPresence() {
  try {
    await redis.del(ONLINE_SET);
  } catch (error) {
    console.warn("Could not reset presence:", error);
  }
}

export async function handleUserConnect(userId: string, socketId: string, io: Server) {
  try {
    const contacts = await getContactIds(userId);

    // Only announce "online" for the first live connection (extra tabs stay quiet).
    if ((await liveSocketCount(io, userId)) === 1) {
      await redis.sadd(ONLINE_SET, userId);
      for (const contactId of contacts) {
        io.to(`user:${contactId}`).emit(SOCKET_EVENTS.PRESENCE_CHANGE, { userId, status: "online" });
      }
    }

    // Tell the newly connected socket where everyone else stands.
    if (contacts.length > 0) {
      const statuses = await getOnlineStatuses(contacts);
      for (const [contactId, info] of Object.entries(statuses)) {
        io.to(socketId).emit(SOCKET_EVENTS.PRESENCE_CHANGE, {
          userId: contactId,
          status: info.status,
          lastSeen: info.lastSeen,
        });
      }
    }
  } catch (error) {
    console.error(`Error in handleUserConnect for user ${userId}:`, error);
  }
}

export async function handleUserDisconnect(userId: string, io: Server) {
  try {
    if ((await liveSocketCount(io, userId)) > 0) return; // still connected in another tab/device

    const lastSeen = new Date().toISOString();
    await Promise.all([redis.srem(ONLINE_SET, userId), redis.set(lastSeenKey(userId), lastSeen)]);

    for (const contactId of await getContactIds(userId)) {
      io.to(`user:${contactId}`).emit(SOCKET_EVENTS.PRESENCE_CHANGE, {
        userId,
        status: "offline",
        lastSeen,
      });
    }
  } catch (error) {
    console.error(`Error in handleUserDisconnect for user ${userId}:`, error);
  }
}

export async function getOnlineStatuses(userIds: string[]): Promise<Record<string, PresenceStatus>> {
  const statuses: Record<string, PresenceStatus> = {};
  if (!userIds || userIds.length === 0) return statuses;

  try {
    // One round trip for the whole batch instead of loading every online user id.
    const flags = (await redis.smismember(ONLINE_SET, userIds as [string, ...string[]])) as number[];
    const offlineIds: string[] = [];

    userIds.forEach((id, index) => {
      if (flags[index]) statuses[id] = { status: "online", lastSeen: null };
      else offlineIds.push(id);
    });

    if (offlineIds.length === 0) return statuses;

    const cached = (await redis.mget<(string | null)[]>(...offlineIds.map(lastSeenKey))) as (string | null)[];
    const missing: string[] = [];

    offlineIds.forEach((id, index) => {
      const value = cached[index];
      if (typeof value === "string" && value) statuses[id] = { status: "offline", lastSeen: value };
      else missing.push(id);
    });

    if (missing.length > 0) {
      const rows = await prisma.user.findMany({
        where: { id: { in: missing } },
        select: { id: true, updatedAt: true },
      });
      const byId = new Map<string, string>(rows.map((row: { id: string; updatedAt: Date }) => [row.id, row.updatedAt.toISOString()]));

      for (const id of missing) {
        const lastSeen = byId.get(id) ?? null;
        statuses[id] = { status: "offline", lastSeen };
        if (lastSeen) void redis.set(lastSeenKey(id), lastSeen).catch(() => undefined);
      }
    }
  } catch (error) {
    console.error("Error fetching online statuses:", error);
    for (const id of userIds) {
      if (!statuses[id]) statuses[id] = { status: "offline", lastSeen: null };
    }
  }

  return statuses;
}
