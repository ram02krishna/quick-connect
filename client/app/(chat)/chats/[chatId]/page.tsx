"use client";

import * as React from "react";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useChatStore } from "@hooks/useChatStore";
import { useSocketStore } from "@hooks/useSocketStore";
import { useAuthStore } from "@hooks/useAuthStore";
import { ChatHeader } from "@components/chat/ChatHeader";
import { MessageList } from "@components/chat/MessageList";
import { MessageInput, type OutgoingAttachment } from "@components/chat/MessageInput";
import { ForwardMessageModal } from "@components/chat/ForwardMessageModal";
import { ProfilePanel } from "@components/profile/ProfilePanel";
import api, { apiErrorMessage } from "@lib/api";
import { loadLatestMessages, PAGE_SIZE, refreshChat } from "@lib/chatLoader";

const NO_MESSAGES: any[] = [];

export default function ChatDetailPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params);
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const socket = useSocketStore((s) => s.socket);
  const isConnected = useSocketStore((s) => s.isConnected);
  const reconnectCount = useSocketStore((s) => s.reconnectCount);

  const messages = useChatStore((s) => s.messages[chatId] ?? NO_MESSAGES);
  const chatExists = useChatStore((s) => s.chats.some((c) => c.id === chatId));

  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [forwarding, setForwarding] = useState<any | null>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);

  const hasLoaded = useRef(false);

  // ── which chat is open ──────────────────────────────────────────────────────
  useEffect(() => {
    useChatStore.getState().setSelectedChatId(chatId);
    return () => {
      if (useChatStore.getState().selectedChatId === chatId) useChatStore.getState().setSelectedChatId(null);
    };
  }, [chatId]);

  // If the chat disappears (deleted, or you were removed) leave the page.
  useEffect(() => {
    if (hasLoaded.current && !chatExists) router.replace("/chats");
  }, [chatExists, router]);

  // ── socket room ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !isConnected) return;
    socket.emit("chat:join", { chatId });
    return () => { socket.emit("chat:leave", { chatId }); };
  }, [socket, isConnected, chatId]);

  // ── load chat details + latest messages (again after a reconnect) ───────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await refreshChat(chatId);
        if (cancelled) return;
        hasLoaded.current = true;
        await loadLatestMessages(chatId);
      } catch (err: any) {
        if (cancelled) return;
        const status = err.response?.status;
        if (status === 403 || status === 404) {
          toast.error("That conversation isn't available.");
          router.replace("/chats");
        } else if (status !== 401) {
          toast.error(apiErrorMessage(err, "Couldn't load this conversation."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [chatId, reconnectCount, router]);

  // ── read receipts ───────────────────────────────────────────────────────────
  // IDs already reported, so the same messages aren't re-sent every time the list changes.
  const reportedRead = useRef(new Set<string>());

  const reportRead = useCallback(() => {
    if (!socket || !isConnected || !user?.id || document.visibilityState !== "visible") return;

    const unread = useChatStore.getState().messages[chatId]?.filter(
      (m) =>
        m.senderId !== user.id &&
        m.type !== "SYSTEM" &&
        !m.id.startsWith("temp-") &&
        !reportedRead.current.has(m.id) &&
        !m.receipts?.some((r) => r.userId === user.id && r.readAt)
    ) ?? [];

    if (unread.length > 0) {
      unread.forEach((m) => reportedRead.current.add(m.id));
      socket.emit("message:read", { chatId, messageIds: unread.map((m) => m.id) });
    }
    useChatStore.getState().setUnread(chatId, 0);
  }, [socket, isConnected, user?.id, chatId]);

  useEffect(() => { reportRead(); }, [reportRead, messages]);

  useEffect(() => {
    document.addEventListener("visibilitychange", reportRead);
    return () => document.removeEventListener("visibilitychange", reportRead);
  }, [reportRead]);

  // A reconnect may have dropped acknowledgements; allow re-reporting.
  useEffect(() => { reportedRead.current.clear(); }, [reconnectCount]);

  // ── sending ─────────────────────────────────────────────────────────────────
  const post = async (tempId: string, content: string, type: string, attachments: OutgoingAttachment[]) => {
    try {
      const res = await api.post(`/messages/${chatId}`, { content, type, attachments });
      useChatStore.getState().resolveOptimisticMessage(chatId, tempId, res.data.data.message);
    } catch (err) {
      useChatStore.getState().failOptimisticMessage(chatId, tempId);
      toast.error(apiErrorMessage(err, "Message not sent."));
    }
  };

  const sendMyMessage = useCallback(
    async (content: string, type: string, attachments: OutgoingAttachment[] = []) => {
      const tempId = `temp-${crypto.randomUUID()}`;
      useChatStore.getState().addMessage(chatId, {
        id: tempId,
        chatId,
        senderId: user?.id ?? "",
        type: type as any,
        content,
        createdAt: new Date().toISOString(),
        sender: { id: user?.id ?? "", name: user?.name ?? "Me", username: user?.username ?? "", avatarUrl: user?.avatarUrl ?? null },
        attachments: attachments.map((a, i) => ({ ...a, id: `${tempId}-${i}`, messageId: tempId, thumbUrl: null, createdAt: new Date().toISOString() })),
        isSending: true,
        receipts: [],
      });
      await post(tempId, content, type, attachments);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId, user]
  );

  const retryMessage = useCallback(async (msg: any) => {
    useChatStore.getState().retryOptimisticMessage(chatId, msg.id);
    await post(msg.id, msg.content, msg.type, (msg.attachments ?? []).map(({ fileName, fileType, fileSize, fileUrl, mimeType }: any) => ({ fileName, fileType, fileSize, fileUrl, mimeType })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const loadOlder = useCallback(async () => {
    if (loadingMore) return;
    const state = useChatStore.getState();
    if (state.hasMoreMessages[chatId] === false) return;

    const thread = state.messages[chatId] ?? [];
    const oldest = thread.find((m) => !m.id.startsWith("temp-"));
    if (!oldest) return;

    setLoadingMore(true);
    try {
      const res = await api.get(`/messages/${chatId}`, { params: { cursor: oldest.id, limit: PAGE_SIZE } });
      const older = res.data.data.messages;
      useChatStore.getState().setHasMoreMessages(chatId, older.length >= PAGE_SIZE);
      useChatStore.getState().prependMessages(chatId, older);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load earlier messages."));
    } finally {
      setLoadingMore(false);
    }
  }, [chatId, loadingMore]);

  // ── in-chat search ──────────────────────────────────────────────────────────
  const matches = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    if (!q) return [];
    return messages.filter((m) => {
      if (m.type === "SYSTEM" || m.deletedForEveryoneAt) return false;
      const names = (m.attachments ?? []).map((a: any) => a.fileName ?? "").join(" ");
      return `${m.content ?? ""} ${names}`.toLocaleLowerCase().includes(q);
    });
  }, [messages, searchQuery]);

  useEffect(() => setActiveMatch(Math.max(0, matches.length - 1)), [searchQuery, matches.length]);

  const navigateSearch = (direction: "up" | "down") => {
    if (matches.length === 0) return;
    setActiveMatch((i) => (direction === "down" ? (i + 1) % matches.length : (i - 1 + matches.length) % matches.length));
  };

  return (
    <div className="chat-canvas relative flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          chatId={chatId}
          onToggleProfile={() => setShowInfo((v) => !v)}
          isProfileOpen={showInfo}
          isSearchOpen={isSearchOpen}
          setIsSearchOpen={setIsSearchOpen}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchMatchCount={matches.length}
          activeSearchMatch={activeMatch}
          onSearchNavigate={navigateSearch}
        />

        <MessageList
          chatId={chatId}
          messages={messages}
          searchQuery={isSearchOpen ? searchQuery : ""}
          searchTargetId={isSearchOpen ? matches[activeMatch]?.id : undefined}
          onLoadMore={loadOlder}
          loadingMore={loadingMore}
          isLoading={loading}
          onRetry={retryMessage}
          onForward={setForwarding}
        />

        <MessageInput chatId={chatId} onSendMessage={sendMyMessage} />
      </div>

      {showInfo && (
        <div className="absolute inset-0 z-30 border-l border-line bg-surface lg:static lg:inset-auto lg:w-[22rem] lg:shrink-0">
          <ProfilePanel chatId={chatId} onClose={() => setShowInfo(false)} />
        </div>
      )}

      {forwarding && <ForwardMessageModal message={forwarding} onClose={() => setForwarding(null)} />}
    </div>
  );
}
