"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Info, PanelLeft, Phone, Search, Video, X } from "lucide-react";
import { useAuthStore } from "@hooks/useAuthStore";
import { useChatStore } from "@hooks/useChatStore";
import { useUIStore } from "@hooks/useUIStore";
import { useCallStore } from "@hooks/useCallStore";
import { Avatar } from "@components/ui/Avatar";
import { IconButton } from "@components/ui/Button";
import { getChatDisplay } from "@lib/chatHelpers";
import { firstName, formatLastSeen } from "@lib/format";

const NO_TYPERS: string[] = [];

interface ChatHeaderProps {
  chatId: string;
  onToggleProfile: () => void;
  isProfileOpen: boolean;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchMatchCount: number;
  activeSearchMatch: number;
  onSearchNavigate: (direction: "up" | "down") => void;
}

export function ChatHeader({
  chatId, onToggleProfile, isProfileOpen, isSearchOpen, setIsSearchOpen,
  searchQuery, setSearchQuery, searchMatchCount, activeSearchMatch, onSearchNavigate,
}: ChatHeaderProps) {
  const router = useRouter();
  const myId = useAuthStore((s) => s.user?.id);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const typers = useChatStore((s) => s.typingStatuses[chatId] ?? NO_TYPERS);
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const callState = useCallStore((s) => s.callState);
  const initiateCall = useCallStore((s) => s.initiateCall);
  const initiateGroupCall = useCallStore((s) => s.initiateGroupCall);
  const busy = callState !== "idle";

  const partnerStatus = useChatStore((s) => {
    const partnerId = s.chats.find((c) => c.id === chatId)?.members.find((m) => m.userId !== myId)?.userId;
    return partnerId ? s.onlineStatuses[partnerId] : undefined;
  });

  if (!chat) return <header className="h-16 shrink-0 border-b border-line bg-surface" />;

  const display = getChatDisplay(chat, myId);
  const isOnline = !display.isGroup && partnerStatus === "online";

  const typingNames = typers
    .filter((id) => id !== myId)
    .map((id) => firstName(chat.members.find((m) => m.userId === id)?.user.name) || "Someone");

  let subtitle: React.ReactNode;
  if (typingNames.length > 0) {
    const text = display.isGroup
      ? typingNames.length === 1 ? `${typingNames[0]} is typing`
        : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing`
        : `${typingNames[0]} and ${typingNames.length - 1} others are typing`
      : "typing";
    subtitle = (
      <span className="flex items-center gap-1.5 text-accent">
        <span className="flex gap-0.5"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></span>
        {text}
      </span>
    );
  } else if (display.isGroup) {
    subtitle = `${chat.members.length} members`;
  } else if (isOnline) {
    subtitle = <span className="text-ok">Online</span>;
  } else {
    subtitle = formatLastSeen(partnerStatus);
  }

  const startCall = (kind: "audio" | "video") => {
    if (display.isGroup) initiateGroupCall(chat.id, display.name, kind);
    else if (display.partner) initiateCall(display.partner.id, display.partner.name, display.partner.avatarUrl, kind);
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 sm:px-3">
      <IconButton label="Back to conversations" onClick={() => router.push("/chats")} className="md:hidden">
        <ArrowLeft size={19} />
      </IconButton>
      {!isSidebarOpen && (
        <IconButton label="Show conversation list" onClick={toggleSidebar} className="hidden md:inline-flex">
          <PanelLeft size={18} />
        </IconButton>
      )}

      {isSearchOpen ? (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onSearchNavigate(e.shiftKey ? "up" : "down"); }
                if (e.key === "Escape") { setIsSearchOpen(false); setSearchQuery(""); }
              }}
              placeholder="Search this conversation"
              aria-label="Search this conversation"
              className="h-10 w-full rounded-md border border-line bg-paper pl-9 pr-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </div>
          <span className="w-12 shrink-0 text-center text-xs tabular-nums text-muted" aria-live="polite">
            {searchQuery.trim() ? (searchMatchCount === 0 ? "None" : `${activeSearchMatch + 1}/${searchMatchCount}`) : ""}
          </span>
          <IconButton label="Previous match" onClick={() => onSearchNavigate("up")} disabled={searchMatchCount === 0}><ChevronUp size={18} /></IconButton>
          <IconButton label="Next match" onClick={() => onSearchNavigate("down")} disabled={searchMatchCount === 0}><ChevronDown size={18} /></IconButton>
          <IconButton label="Close search" onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }}><X size={18} /></IconButton>
        </div>
      ) : (
        <>
          <button type="button" onClick={onToggleProfile} className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1.5 text-left hover:bg-sunken" aria-label="Show conversation details">
            <Avatar src={display.avatarUrl} name={display.name} isGroup={display.isGroup} showStatus={!display.isGroup} isOnline={isOnline} />
            <span className="min-w-0">
              <span className="block truncate font-semibold leading-tight">{display.name}</span>
              <span className="block truncate text-xs text-muted">{subtitle}</span>
            </span>
          </button>

          <IconButton label={busy ? "You're already on a call" : "Voice call"} onClick={() => startCall("audio")} disabled={busy}>
            <Phone size={18} />
          </IconButton>
          <IconButton label={busy ? "You're already on a call" : "Video call"} onClick={() => startCall("video")} disabled={busy}>
            <Video size={19} />
          </IconButton>
          <IconButton label="Search messages" onClick={() => setIsSearchOpen(true)}><Search size={18} /></IconButton>
          <IconButton label="Conversation details" active={isProfileOpen} onClick={onToggleProfile}><Info size={18} /></IconButton>
        </>
      )}
    </header>
  );
}
