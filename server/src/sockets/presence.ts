import type { Server } from "socket.io";
import { redis } from "../config/redis.js";
import { prisma } from "../config/prisma.js";
import { SOCKET_EVENTS } from "./events.js";

// Get all user IDs that share a chat with the given user
async function getChatPartners(userId: string): Promise<string[]> {
  const cacheKey = `user:partners:${userId}`;
  const cached = await redis.get<string[]>(cacheKey);
  if (cached) return cached;

  const members = await prisma.chatMember.findMany({
    where: {
      chat: {
        members: { some: { userId } },
      },
      userId: { not: userId },
    },
    select: { userId: true },
  });

  const partners = [...new Set(members.map((m) => m.userId))];

  // Cache for 5 minutes
  await redis.set(cacheKey, partners, { ex: 300 });
  return partners;
}

export async function handleUserConnect(userId: string, socketId: string, io: Server) {
  try {
    const connKey = `user:conn_count:${userId}`;
    const count = await redis.incr(connKey);

    // Fetch partners once and reuse
    const partners = await getChatPartners(userId);

    // Only mark online on first connection (handles multiple tabs)
    if (count === 1) {
      await redis.sadd("online_users", userId);

      for (const partnerId of partners) {
        io.to(`user:${partnerId}`).emit(SOCKET_EVENTS.PRESENCE_CHANGE, {
          userId,
          status: "online",
        });
      }
    }

    // Send current online statuses of all partners to this newly connected socket
    if (partners.length > 0) {
      const partnerStatuses = await getOnlineStatuses(partners);
      for (const [partnerId, statusObj] of Object.entries(partnerStatuses)) {
        io.to(socketId).emit(SOCKET_EVENTS.PRESENCE_CHANGE, {
          userId: partnerId,
          status: statusObj.status,
          lastSeen: statusObj.lastSeen,
        });
      }
    }
  } catch (error) {
    console.error(`Error in handleUserConnect for user ${userId}:`, error);
  }
}

export async function handleUserDisconnect(userId: string, socketId: string, io: Server) {
  try {
    const connKey = `user:conn_count:${userId}`;
    const count = await redis.decr(connKey);

    // Only mark offline if no more active connections
    if (count <= 0) {
      await redis.del(connKey);
      await redis.srem("online_users", userId);

      const lastSeen = new Date().toISOString();
      await redis.set(`user:last_seen:${userId}`, lastSeen);

      const partners = await getChatPartners(userId);
      for (const partnerId of partners) {
        io.to(`user:${partnerId}`).emit(SOCKET_EVENTS.PRESENCE_CHANGE, {
          userId,
          status: "offline",
          lastSeen,
        });
      }
    }
  } catch (error) {
    console.error(`Error in handleUserDisconnect for user ${userId}:`, error);
  }
}


export async function getOnlineStatuses(
  userIds: string[]
): Promise<Record<string, { status: "online" | "offline"; lastSeen?: string | null }>> {
  const statuses: Record<string, { status: "online" | "offline"; lastSeen?: string | null }> = {};
  if (!userIds || userIds.length === 0) return statuses;

  try {
    // 1. Fetch all online user IDs in ONE Redis call
    const onlineList = (await redis.smembers("online_users")) || [];
    const onlineSet = new Set(onlineList);

    const offlineUserIds: string[] = [];

    // Mark online users immediately
    for (const id of userIds) {
      if (onlineSet.has(id)) {
        statuses[id] = { status: "online", lastSeen: null };
      } else {
        offlineUserIds.push(id);
      }
    }

    if (offlineUserIds.length === 0) {
      return statuses;
    }

    // 2. Fetch all offline users' last_seen in ONE Redis MGET call
    const keys = offlineUserIds.map((id) => `user:last_seen:${id}`);
    const lastSeenValues: (string | null)[] = await redis.mget(...keys);

    const missingDbIds: string[] = [];

    offlineUserIds.forEach((id, index) => {
      const val = lastSeenValues[index];
      if (val) {
        statuses[id] = { status: "offline", lastSeen: val };
      } else {
        missingDbIds.push(id);
      }
    });

    // 3. Fallback to Database in ONE single query for any users without cached lastSeen
    if (missingDbIds.length > 0) {
      const usersFromDb = await prisma.user.findMany({
        where: { id: { in: missingDbIds } },
        select: { id: true, updatedAt: true },
      });

      const dbMap = new Map(usersFromDb.map((u) => [u.id, u.updatedAt.toISOString()]));

      for (const id of missingDbIds) {
        const lastSeen = dbMap.get(id) || null;
        statuses[id] = { status: "offline", lastSeen };
        if (lastSeen) {
          // Asynchronously cache for next time
          void redis.set(`user:last_seen:${id}`, lastSeen);
        }
      }
    }
  } catch (error) {
    console.error("Error fetching online statuses:", error);
    // Fallback: fill defaults
    for (const id of userIds) {
      if (!statuses[id]) {
        statuses[id] = { status: "offline", lastSeen: null };
      }
    }
  }

  return statuses;
}
