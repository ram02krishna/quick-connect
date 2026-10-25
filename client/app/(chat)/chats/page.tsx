"use client";

import * as React from "react";
import { PanelLeft, Search, Users } from "lucide-react";
import { useUIStore } from "@hooks/useUIStore";
import { IconButton } from "@components/ui/Button";
import { LogoMark } from "@components/Logo";

export default function ChatsPage() {
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const focusSearch = useUIStore((s) => s.focusSearch);
  const setNewGroupOpen = useUIStore((s) => s.setNewGroupOpen);

  return (
    <div className="chat-canvas relative flex flex-1 flex-col items-center justify-center p-6 text-center">
      <IconButton
        label={isSidebarOpen ? "Hide conversation list" : "Show conversation list"}
        onClick={toggleSidebar}
        className="absolute left-3 top-3 hidden md:inline-flex"
      >
        <PanelLeft size={18} />
      </IconButton>

      <LogoMark size={44} className="text-accent" />
      <h1 className="mt-5 font-display text-3xl">Pick a conversation</h1>
      <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted">
        Choose a chat from the list, or start something new.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2.5">
        <button
          type="button"
          onClick={focusSearch}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-sunken"
        >
          <Search size={16} /> Find someone
        </button>
        <button
          type="button"
          onClick={() => setNewGroupOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-sunken"
        >
          <Users size={16} /> New group
        </button>
      </div>
    </div>
  );
}
