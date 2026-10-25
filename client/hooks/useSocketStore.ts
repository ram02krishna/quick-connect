import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useChatStore } from "./useChatStore";
import { useCallStore } from "./useCallStore";
import { useAuthStore } from "./useAuthStore";
import { refreshChat } from "@lib/chatLoader";
import { playChime } from "@lib/sound";

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:5000";

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  /** Increments each time the socket reconnects after a drop, so screens can re-sync missed data. */
  reconnectCount: number;
  connectSocket: (token: string) => void;
  disconnectSocket: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  reconnectCount: 0,

  connectSocket: (token) => {
    const existing = get().socket;
    if (existing) {
      if (existing.connected || existing.active) return; // already connected or retrying
      existing.removeAllListeners();
      existing.disconnect();
    }

    const socket = io(WS_BASE_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 300,
      reconnectionDelayMax: 4000,
      timeout: 10000,
    });

    let hasConnectedBefore = false;

    socket.on("connect", () => {
      set((s) => ({
        isConnected: true,
        reconnectCount: hasConnectedBefore && !socket.recovered ? s.reconnectCount + 1 : s.reconnectCount,
      }));
      hasConnectedBefore = true;
    });

    socket.on("disconnect", () => set({ isConnected: false }));

    socket.on("connect_error", (err) => {
      // An expired/invalid token will never succeed — send the user back to sign in.
      if (/token/i.test(err.message)) {
        socket.disconnect();
        void import("@lib/session").then(({ clearSession }) => {
          clearSession();
          if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
        });
      }
    });

    // ── messages ────────────────────────────────────────────────────────────

    socket.on("message:new", async (message) => {
      const chats = useChatStore.getState();
      const myId = useAuthStore.getState().user?.id;
      const fromOther = message.senderId !== myId;
      const isSystem = message.type === "SYSTEM";

      let fetchedUnread: number | null = null;
      if (!chats.chats.some((c) => c.id === message.chatId)) {
        try {
          const chat = await refreshChat(message.chatId);
          // The server's unread count already includes this message.
          fetchedUnread = chat.unreadCount ?? 0;
        } catch (err) {
          console.error("Failed to fetch new chat details:", err);
        }
      }

      useChatStore.getState().addMessage(message.chatId, message);

      if (fromOther && !isSystem) {
        const viewing =
          useChatStore.getState().selectedChatId === message.chatId && document.visibilityState === "visible";
        if (!viewing && fetchedUnread === null) useChatStore.getState().incrementUnread(message.chatId);

        socket.emit("message:delivered", { messageId: message.id, chatId: message.chatId });
      }

      notify(message, fromOther && !isSystem);
    });

    socket.on("message:delivered", (p) => useChatStore.getState().updateReceipt(p.chatId, p.messageId, p.receipt));
    socket.on("message:read", (p) => useChatStore.getState().updateReceipt(p.chatId, p.messageId, p.receipt));

    socket.on("message:deleted-for-everyone", (p: { chatId: string; messageId: string }) => {
      useChatStore.getState().markMessageDeletedForEveryone(p.chatId, p.messageId);
    });

    socket.on("chat:deleted", (p: { chatId: string }) => useChatStore.getState().deleteChat(p.chatId));

    socket.on("chat:updated", (p: { chatId: string }) => {
      refreshChat(p.chatId).catch(() => undefined);
    });

    // ── presence / typing ───────────────────────────────────────────────────

    socket.on("presence:change", (p: { userId: string; status: "online" | "offline"; lastSeen?: string }) => {
      useChatStore.getState().setOnlineStatus(p.userId, p.status === "online" ? "online" : p.lastSeen || "offline");
    });

    socket.on("typing:start", (p: { chatId: string; userId: string }) =>
      useChatStore.getState().setUserTyping(p.chatId, p.userId, true));
    socket.on("typing:stop", (p: { chatId: string; userId: string }) =>
      useChatStore.getState().setUserTyping(p.chatId, p.userId, false));

    // ── 1:1 calls ───────────────────────────────────────────────────────────

    const calls = () => useCallStore.getState();
    socket.on("call:incoming", (p) => calls().receiveCall(p));
    socket.on("call:answered", (p) => calls().handleAnswer(p.fromUserId, p.sdp));
    socket.on("call:declined", (p) => calls().handlePeerDeclined(p.fromUserId, p.reason));
    socket.on("call:ended", (p) => calls().handlePeerEnded(p.fromUserId));
    socket.on("call:unavailable", (p) => calls().handlePeerUnavailable(p.targetUserId));
    socket.on("call:ice-candidate", (p) => calls().handleIceCandidate(p.candidate, p.fromUserId));

    // ── group calls ─────────────────────────────────────────────────────────

    socket.on("call:incoming-group", (p) => calls().receiveGroupCall(p));
    socket.on("call:participant-joined", (p) => void calls().handleParticipantJoined(p.chatId, p.userId));
    socket.on("call:participant-left", (p) => calls().handleParticipantLeft(p.chatId, p.userId));
    socket.on("call:group-ended", (p) => calls().handleGroupEnded(p.chatId));
    socket.on("call:group-busy", () => {
      calls().resetCallStore();
      toast.info("There's already a call in progress in this group.");
    });
    socket.on("call:group-response", (p) => {
      const name = p.userName || "Someone";
      if (p.status === "accepted") toast.success(`${name} joined the call`);
      else toast.info(`${name} declined the call`);
    });
    socket.on("call:offer", (p) => void calls().handleGroupOffer(p.fromUserId, p.sdp, p.callType));
    socket.on("call:answer", (p) => void calls().handleGroupAnswer(p.fromUserId, p.sdp));

    set({ socket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    set({ socket: null, isConnected: false, reconnectCount: 0 });
  },
}));

function notify(message: any, isIncoming: boolean) {
  if (typeof window === "undefined" || message.type === "SYSTEM") return;

  if (!isIncoming) {
    playChime("outgoing");
    return;
  }
  playChime("incoming");

  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (localStorage.getItem("settings-notifications-enabled") === "false") return;

  const chatId = useChatStore.getState().selectedChatId;
  const isBackground = document.visibilityState === "hidden" || !document.hasFocus();
  if (!isBackground && chatId === message.chatId) return;

  const showPreviews = localStorage.getItem("settings-notifications-preview") !== "false";
  const body = showPreviews ? message.content || "Sent an attachment" : "New message";
  const n = new Notification(message.sender?.name || "New message", { body, tag: message.chatId });
  n.onclick = () => {
    window.focus();
    window.location.href = `/chats/${message.chatId}`;
  };
}
