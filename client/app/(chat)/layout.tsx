"use client";

import * as React from "react";
import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@hooks/useAuthStore";
import { useSocketStore } from "@hooks/useSocketStore";
import { useChatStore } from "@hooks/useChatStore";
import { useUIStore } from "@hooks/useUIStore";
import { Sidebar } from "@components/sidebar/Sidebar";
import { CallOverlay } from "@components/chat/CallOverlay";
import { LogoMark } from "@components/Logo";
import api from "@lib/api";
import { cn } from "@lib/utils";

function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center bg-paper">
      <LogoMark size={40} className="animate-pulse text-accent" />
    </div>
  );
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const token = useAuthStore((s) => s.token);
  const connectSocket = useSocketStore((s) => s.connectSocket);
  const reconnectCount = useSocketStore((s) => s.reconnectCount);
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);

  // The persisted auth store only exists in the browser, so hydration is checked after mount.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persist = useAuthStore.persist;
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return persist.onFinishHydration(() => setHydrated(true));
  }, []);

  // Not signed in → go to login, remembering where the user was headed.
  useEffect(() => {
    if (hydrated && !token) {
      const returnTo = pathname && pathname !== "/" ? `?redirect=${encodeURIComponent(pathname)}` : "";
      window.location.replace(`/login${returnTo}`);
    }
  }, [hydrated, token, pathname]);

  // Open the socket once we have a token.
  useEffect(() => {
    if (token) connectSocket(token);
  }, [token, connectSocket]);

  // Load the chat list at sign-in and again after a reconnect (messages may have arrived meanwhile).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await api.get("/chats");
        if (cancelled) return;
        useChatStore.getState().setChats(res.data.data.chats);
        useChatStore.getState().setOnlineStatuses(res.data.data.onlineStatuses || {});
      } catch (err) {
        console.error("Failed to load chats:", err);
        if (!cancelled) useChatStore.getState().setIsChatsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, reconnectCount]);

  if (!hydrated || !token) return <Splash />;

  const isRoot = pathname === "/chats";

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-paper text-ink">
      <div
        className={cn(
          "h-full shrink-0 border-r border-line bg-surface transition-[width] duration-200",
          isRoot ? "w-full" : "hidden",
          "md:block",
          isSidebarOpen ? "md:w-[340px]" : "md:w-0 md:overflow-hidden md:border-r-0"
        )}
      >
        <div className="h-full w-full md:w-[340px]">
          <Suspense fallback={null}>
            <Sidebar />
          </Suspense>
        </div>
      </div>

      <div className={cn("relative min-w-0 flex-1 flex-col", isRoot ? "hidden md:flex" : "flex")}>
        {children}
      </div>

      <CallOverlay />
    </div>
  );
}
