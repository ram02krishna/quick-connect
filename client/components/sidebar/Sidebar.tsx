"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, LogOut, MessageSquarePlus, Search, UserPlus, Users, X } from "lucide-react";
import { useAuthStore } from "@hooks/useAuthStore";
import { useChatStore, type Chat } from "@hooks/useChatStore";
import { useUIStore } from "@hooks/useUIStore";
import { Avatar } from "@components/ui/Avatar";
import { IconButton } from "@components/ui/Button";
import { ConfirmDialog } from "@components/ui/Dialog";
import { ThemeToggle } from "@components/ThemeToggle";
import { NewGroupModal } from "./NewGroupModal";
import api, { apiErrorMessage } from "@lib/api";
import { clearSession } from "@lib/session";
import { getChatDisplay, previewText } from "@lib/chatHelpers";
import { prefetchMessages } from "@lib/chatLoader";
import { formatListTime, firstName } from "@lib/format";
import { cn } from "@lib/utils";
import { toast } from "sonner";

type Tab = "all" | "unread" | "groups";

const ChatRow = React.memo(function ChatRow({
  chat, myId, selected, online, typing, onOpen,
}: {
  chat: Chat;
  myId: string;
  selected: boolean;
  online: boolean;
  typing: boolean;
  onOpen: (id: string) => void;
}) {
  const display = getChatDisplay(chat, myId);
  const last = chat.lastMessage;
  const unread = chat.unreadCount ?? 0;
  const mine = last && last.sender?.id === myId && last.type !== "SYSTEM";

  // Tick state for my own last message, derived from its receipts.
  let tick: "sent" | "delivered" | "read" = "sent";
  if (mine && last?.receipts) {
    const others = Math.max(1, (chat.members?.length ?? 2) - 1);
    const read = last.receipts.filter((r) => r.userId !== myId && r.readAt).length;
    const delivered = last.receipts.filter((r) => r.userId !== myId && (r.deliveredAt || r.readAt)).length;
    tick = read >= others ? "read" : delivered >= others ? "delivered" : "sent";
  }

  const preview = last
    ? (last.deletedForEveryoneAt ? "This message was deleted" : previewText(last.type, last.content))
    : "No messages yet";
  const showSender = last && chat.type === "GROUP" && last.type !== "SYSTEM" && !mine && last.sender?.name;

  return (
    <button
      type="button"
      onClick={() => onOpen(chat.id)}
      onMouseEnter={() => prefetchMessages(chat.id)}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-3 border-b border-line/60 px-4 py-3 text-left transition-colors",
        selected ? "bg-accent-soft" : "hover:bg-sunken"
      )}
    >
      <Avatar src={display.avatarUrl} name={display.name} isGroup={display.isGroup} showStatus={!display.isGroup} isOnline={online} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-[15px]", unread > 0 ? "font-semibold" : "font-medium")}>{display.name}</span>
          {last && (
            <span className={cn("shrink-0 text-xs tabular-nums", unread > 0 ? "font-medium text-accent" : "text-faint")}>
              {formatListTime(last.createdAt)}
            </span>
          )}
        </span>

        <span className="mt-0.5 flex items-center gap-1.5">
          {typing ? (
            <span className="flex items-center gap-1.5 text-sm text-accent">
              <span className="flex gap-0.5"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></span>
              typing
            </span>
          ) : (
            <span className={cn("flex min-w-0 flex-1 items-center gap-1 text-sm", unread > 0 ? "text-ink" : "text-muted")}>
              {mine && (tick === "sent"
                ? <Check size={14} className="shrink-0 text-faint" />
                : <CheckCheck size={14} className={cn("shrink-0", tick === "read" ? "text-accent" : "text-faint")} />)}
              <span className="truncate">
                {showSender && <span className="text-muted">{firstName(last!.sender.name)}: </span>}
                {preview}
              </span>
            </span>
          )}
          {unread > 0 && (
            <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-ink">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
});

export function Sidebar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const chats = useChatStore((s) => s.chats);
  const selectedChatId = useChatStore((s) => s.selectedChatId);
  const onlineStatuses = useChatStore((s) => s.onlineStatuses);
  const typingStatuses = useChatStore((s) => s.typingStatuses);
  const loadingChats = useChatStore((s) => s.isChatsLoading);

  const newGroupOpen = useUIStore((s) => s.newGroupOpen);
  const setNewGroupOpen = useUIStore((s) => s.setNewGroupOpen);
  const searchFocusTick = useUIStore((s) => s.searchFocusTick);

  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchFocusTick > 0) searchRef.current?.focus();
  }, [searchFocusTick]);

  // Look up people (not yet in your list) once at least two characters are typed.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setPeople([]); setSearching(false); return; }

    let stale = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get("/users/search", { params: { q } });
        if (!stale) setPeople(res.data.data.users);
      } catch {
        if (!stale) setPeople([]);
      } finally {
        if (!stale) setSearching(false);
      }
    }, 300);

    return () => { stale = true; clearTimeout(timer); };
  }, [query]);

  const visibleChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats
      .filter((chat) => {
        if (tab === "groups" && chat.type !== "GROUP") return false;
        if (tab === "unread" && !(chat.unreadCount && chat.unreadCount > 0)) return false;
        if (!q) return true;
        return getChatDisplay(chat, user?.id).name.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const at = new Date(a.lastMessage?.createdAt || a.updatedAt).getTime();
        const bt = new Date(b.lastMessage?.createdAt || b.updatedAt).getTime();
        return bt - at;
      });
  }, [chats, tab, query, user?.id]);

  const unreadTotal = useMemo(() => chats.reduce((n, c) => n + (c.unreadCount ?? 0), 0), [chats]);

  const openChat = useCallback((chatId: string) => {
    prefetchMessages(chatId);
    router.push(`/chats/${chatId}`);
  }, [router]);

  const startChatWith = async (targetUserId: string) => {
    try {
      const res = await api.post("/chats/direct", { targetUserId });
      const { chat, onlineStatuses: statuses } = res.data.data;
      useChatStore.getState().upsertChat(chat);
      if (statuses) useChatStore.getState().setOnlineStatuses(statuses);
      setQuery("");
      openChat(chat.id);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't open that conversation."));
    }
  };

  const handleLogout = async () => {
    try { await api.post("/auth/logout"); } catch { /* the local session is cleared regardless */ }
    clearSession();
    router.push("/login");
  };

  const peopleToShow = people.filter(
    (p) => !chats.some((c) => c.type === "DIRECT" && c.members.some((m) => m.userId === p.id))
  );

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-3">
        <button
          type="button"
          onClick={() => router.push("/profile")}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1.5 text-left hover:bg-sunken"
          aria-label="Open your profile"
        >
          <Avatar src={user?.avatarUrl} name={user?.name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">{user?.name}</span>
            <span className="block truncate text-xs text-muted">@{user?.username}</span>
          </span>
        </button>
        <IconButton label="New group" onClick={() => setNewGroupOpen(true)}><Users size={18} /></IconButton>
        <ThemeToggle />
        <IconButton label="Sign out" tone="danger" onClick={() => setConfirmLogout(true)}><LogOut size={18} /></IconButton>
      </div>

      <div className="shrink-0 space-y-3 border-b border-line px-3 py-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats or find people"
            aria-label="Search chats or find people"
            className="h-10 w-full rounded-md border border-line bg-paper pl-9 pr-9 text-sm placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-1.5" role="tablist" aria-label="Filter conversations">
          {([["all", "All"], ["unread", `Unread${unreadTotal ? ` · ${unreadTotal}` : ""}`], ["groups", "Groups"]] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                tab === id ? "bg-ink text-paper" : "text-muted hover:bg-sunken hover:text-ink"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.trim().length >= 2 && (
          <section aria-label="People">
            <h2 className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-faint">People</h2>
            {searching ? (
              <div className="space-y-3 px-4 py-2">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton h-8 w-8 rounded-full" />
                    <div className="skeleton h-3 w-32" />
                  </div>
                ))}
              </div>
            ) : peopleToShow.length === 0 ? (
              <p className="px-4 py-2 text-sm text-muted">No one new matches “{query.trim()}”.</p>
            ) : (
              peopleToShow.map((p) => (
                <button key={p.id} type="button" onClick={() => startChatWith(p.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken">
                  <Avatar src={p.avatarUrl} name={p.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted">@{p.username}</span>
                  </span>
                  <UserPlus size={16} className="shrink-0 text-accent" />
                </button>
              ))
            )}
            <h2 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-faint">Your chats</h2>
          </section>
        )}

        {loadingChats && chats.length === 0 ? (
          <div className="space-y-1 p-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-3">
                <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-2/5" />
                  <div className="skeleton h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleChats.length === 0 ? (
          <div className="flex flex-col items-center px-8 py-16 text-center">
            <MessageSquarePlus size={28} className="text-faint" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium">
              {query.trim() ? "No chats match that search" : tab === "unread" ? "You're all caught up" : tab === "groups" ? "No groups yet" : "No conversations yet"}
            </p>
            {!query.trim() && tab === "all" && (
              <p className="mt-1 text-sm text-muted">Search for a name or username above to say hello.</p>
            )}
          </div>
        ) : (
          visibleChats.map((chat) => {
            const partnerId = chat.type === "DIRECT" ? chat.members.find((m) => m.userId !== user?.id)?.userId : undefined;
            return (
              <ChatRow
                key={chat.id}
                chat={chat}
                myId={user?.id ?? ""}
                selected={selectedChatId === chat.id}
                online={Boolean(partnerId && onlineStatuses[partnerId] === "online")}
                typing={(typingStatuses[chat.id]?.length ?? 0) > 0}
                onOpen={openChat}
              />
            );
          })
        )}
      </div>

      {newGroupOpen && (
        <NewGroupModal
          onClose={() => setNewGroupOpen(false)}
          onGroupCreated={(chat) => {
            useChatStore.getState().upsertChat(chat);
            openChat(chat.id);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Sign out?"
        description="You'll need to sign in again to see your conversations."
        confirmLabel="Sign out"
        onConfirm={handleLogout}
      />
    </div>
  );
}
