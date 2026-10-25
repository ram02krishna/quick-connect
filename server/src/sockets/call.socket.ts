import type { Server, Socket } from "socket.io";
import { prisma } from "../config/prisma.js";
import { getChatMemberIds, getContactIds } from "../services/membership.service.js";

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const isCallType = (v: unknown): v is "audio" | "video" => v === "audio" || v === "video";
// Session descriptions are a few KB; anything huge is abuse.
const isSdp = (v: unknown) => typeof v === "object" && v !== null && JSON.stringify(v).length < 100_000;

/** 1:1 calls in progress (ringing or connected): userId -> the other person. Both directions stored. */
const directCalls = new Map<string, string>();

/** Group calls in progress, keyed by chat. */
const groupCalls = new Map<string, { initiatorId: string; participants: Set<string> }>();

const userRoom = (id: string) => `user:${id}`;

async function profileOf(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { name: true, avatarUrl: true } });
}

async function isOnline(io: Server, userId: string) {
  return (await io.in(userRoom(userId)).fetchSockets()).length > 0;
}

function endDirectCall(userId: string): string | null {
  const partner = directCalls.get(userId) ?? null;
  directCalls.delete(userId);
  if (partner && directCalls.get(partner) === userId) directCalls.delete(partner);
  return partner;
}

export function setupCallSockets(io: Server, socket: Socket) {
  const userId = socket.data.userId as string | undefined;
  if (!userId) return;

  // Callers must already share a chat with the person they ring.
  const canReach = async (targetId: string) => isId(targetId) && (await getContactIds(userId)).includes(targetId);

  /** Only relay 1:1 signalling between the two people actually on that call. */
  const isCallPeer = (targetId: unknown): targetId is string =>
    isId(targetId) && directCalls.get(userId) === targetId;

  // ── 1:1 calls ───────────────────────────────────────────────────────────────

  socket.on("call:initiate", async (payload: any = {}) => {
    try {
      const { targetUserId, sdp, callType } = payload;
      if (!isId(targetUserId) || !isCallType(callType) || !isSdp(sdp)) return;

      if (!(await canReach(targetUserId))) return;
      if (directCalls.has(userId)) {
        socket.emit("call:declined", { fromUserId: targetUserId, reason: "busy" });
        return;
      }
      if (directCalls.has(targetUserId)) {
        socket.emit("call:declined", { fromUserId: targetUserId, reason: "busy" });
        return;
      }
      if (!(await isOnline(io, targetUserId))) {
        socket.emit("call:unavailable", { targetUserId });
        return;
      }

      const caller = await profileOf(userId);
      directCalls.set(userId, targetUserId);
      directCalls.set(targetUserId, userId);

      io.to(userRoom(targetUserId)).emit("call:incoming", {
        fromUserId: userId,
        fromUserName: caller?.name ?? "Someone",
        fromUserAvatar: caller?.avatarUrl ?? null,
        sdp,
        callType,
      });
    } catch (err) {
      console.error("Error in call:initiate:", err);
    }
  });

  socket.on("call:accept", ({ targetUserId, sdp }: any = {}) => {
    if (!isCallPeer(targetUserId) || !isSdp(sdp)) return;
    io.to(userRoom(targetUserId)).emit("call:answered", { fromUserId: userId, sdp });
  });

  socket.on("call:decline", ({ targetUserId, reason }: any = {}) => {
    if (!isCallPeer(targetUserId)) return;
    endDirectCall(userId);
    io.to(userRoom(targetUserId)).emit("call:declined", {
      fromUserId: userId,
      reason: reason === "busy" ? "busy" : "declined",
    });
  });

  socket.on("call:hangup", ({ targetUserId }: any = {}) => {
    if (!isCallPeer(targetUserId)) return;
    endDirectCall(userId);
    io.to(userRoom(targetUserId)).emit("call:ended", { fromUserId: userId });
  });

  // Used by both 1:1 and group calls. The sender id always comes from the verified socket.
  socket.on("call:ice-candidate", async ({ targetUserId, candidate }: any = {}) => {
    if (!isId(targetUserId) || typeof candidate !== "object" || candidate === null) return;
    const inDirect = directCalls.get(userId) === targetUserId;
    const inGroup = [...groupCalls.values()].some(
      (call) => call.participants.has(userId) && call.participants.has(targetUserId)
    );
    if (!inDirect && !inGroup) return;
    io.to(userRoom(targetUserId)).emit("call:ice-candidate", { fromUserId: userId, candidate });
  });

  // ── group calls ─────────────────────────────────────────────────────────────

  const otherMembers = async (chatId: string) =>
    (await getChatMemberIds(chatId)).filter((id) => id !== userId);

  const amMember = async (chatId: string) => (await getChatMemberIds(chatId)).includes(userId);

  socket.on("call:initiate-group", async ({ chatId, callType }: any = {}) => {
    try {
      if (!isId(chatId) || !isCallType(callType) || !(await amMember(chatId))) return;

      if (groupCalls.has(chatId)) {
        socket.emit("call:group-busy", { chatId });
        return;
      }

      const [chat, caller, others] = await Promise.all([
        prisma.chat.findUnique({ where: { id: chatId }, select: { title: true, photoUrl: true } }),
        profileOf(userId),
        otherMembers(chatId),
      ]);

      groupCalls.set(chatId, { initiatorId: userId, participants: new Set([userId]) });

      for (const memberId of others) {
        io.to(userRoom(memberId)).emit("call:incoming-group", {
          chatId,
          chatTitle: chat?.title ?? "Group",
          chatAvatar: chat?.photoUrl ?? null,
          fromUserId: userId,
          fromUserName: caller?.name ?? "Someone",
          fromUserAvatar: caller?.avatarUrl ?? null,
          callType,
        });
      }
    } catch (err) {
      console.error("Error in call:initiate-group:", err);
    }
  });

  const leaveGroupCall = async (chatId: string) => {
    const call = groupCalls.get(chatId);
    if (!call || !call.participants.delete(userId)) return;

    const members = await getChatMemberIds(chatId);
    for (const memberId of members) {
      if (memberId !== userId) {
        io.to(userRoom(memberId)).emit("call:participant-left", { chatId, userId });
      }
    }

    // Last person out ends the call for anyone still being rung.
    if (call.participants.size === 0) {
      groupCalls.delete(chatId);
      for (const memberId of members) {
        io.to(userRoom(memberId)).emit("call:group-ended", { chatId });
      }
    }
  };

  socket.on("call:join-group", async ({ chatId }: any = {}) => {
    try {
      if (!isId(chatId) || !(await amMember(chatId))) return;
      const call = groupCalls.get(chatId);
      if (!call) {
        socket.emit("call:group-ended", { chatId });
        return;
      }
      call.participants.add(userId);
      for (const memberId of await otherMembers(chatId)) {
        io.to(userRoom(memberId)).emit("call:participant-joined", { chatId, userId });
      }
    } catch (err) {
      console.error("Error in call:join-group:", err);
    }
  });

  socket.on("call:group-response", async ({ chatId, status }: any = {}) => {
    try {
      if (!isId(chatId) || !["accepted", "declined"].includes(status) || !(await amMember(chatId))) return;
      const call = groupCalls.get(chatId);
      if (!call) return;

      const responder = await profileOf(userId);
      // Only people on the call need to hear about it.
      for (const participantId of call.participants) {
        if (participantId !== userId) {
          io.to(userRoom(participantId)).emit("call:group-response", {
            chatId,
            userId,
            userName: responder?.name ?? "Someone",
            status,
          });
        }
      }
    } catch (err) {
      console.error("Error in call:group-response:", err);
    }
  });

  // The person who started the call can cancel it for everyone who hasn't joined yet.
  socket.on("call:end-group", async ({ chatId }: any = {}) => {
    if (!isId(chatId)) return;
    const call = groupCalls.get(chatId);
    if (!call || call.initiatorId !== userId) return;
    await leaveGroupCall(chatId);
  });

  socket.on("call:leave-group", async ({ chatId }: any = {}) => {
    if (isId(chatId)) await leaveGroupCall(chatId);
  });

  // Mesh signalling: offers/answers only between people on the same group call.
  const relayGroupSignal = (event: "call:offer" | "call:answer") =>
    ({ targetUserId, sdp, callType }: any = {}) => {
      if (!isId(targetUserId) || !isSdp(sdp)) return;
      const shared = [...groupCalls.values()].some(
        (call) => call.participants.has(userId) && call.participants.has(targetUserId)
      );
      if (!shared) return;
      io.to(userRoom(targetUserId)).emit(event, {
        fromUserId: userId,
        sdp,
        ...(event === "call:offer" && isCallType(callType) ? { callType } : {}),
      });
    };
  socket.on("call:offer", relayGroupSignal("call:offer"));
  socket.on("call:answer", relayGroupSignal("call:answer"));

  // ── cleanup ─────────────────────────────────────────────────────────────────

  socket.on("disconnect", async () => {
    try {
      // Another tab/device may still be connected — only clean up when the last one goes.
      if (await isOnline(io, userId)) return;

      const partner = endDirectCall(userId);
      if (partner) io.to(userRoom(partner)).emit("call:ended", { fromUserId: userId });

      for (const chatId of [...groupCalls.keys()]) {
        if (groupCalls.get(chatId)?.participants.has(userId)) await leaveGroupCall(chatId);
      }
    } catch (err) {
      console.error("Error cleaning up calls on disconnect:", err);
    }
  });
}
