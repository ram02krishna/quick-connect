"use client";

import * as React from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { ArrowDown, Loader2 } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { useAuthStore } from "@hooks/useAuthStore";
import { useChatStore } from "@hooks/useChatStore";
import { formatDayHeader } from "@lib/format";

interface MessageListProps {
  chatId: string;
  messages: any[];
  searchQuery?: string;
  searchTargetId?: string;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  isLoading?: boolean;
  onRetry?: (message: any) => void;
  onForward?: (message: any) => void;
}

type Item =
  | { kind: "day"; id: string; label: string }
  | { kind: "message"; id: string; message: any; grouped: boolean };

const START_INDEX = 1_000_000;
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function DayChip({ label }: { label: string }) {
  return (
    <div className="my-4 flex justify-center">
      <span className="rounded-full bg-sunken px-3 py-1 text-xs font-medium text-muted">{label}</span>
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="flex-1 space-y-4 overflow-hidden px-4 py-6" aria-hidden>
      {[["w-48", false], ["w-64", true], ["w-40", false], ["w-56", true], ["w-72", false]].map(([w, mine], i) => (
        <div key={i} className={`flex ${mine ? "justify-end" : ""}`}>
          <div className={`skeleton h-11 ${w}`} />
        </div>
      ))}
    </div>
  );
}

export const MessageList = memo(function MessageList({
  chatId, messages, searchQuery, searchTargetId, onLoadMore, loadingMore, isLoading = false, onRetry, onForward,
}: MessageListProps) {
  const virtuoso = useRef<VirtuosoHandle>(null);
  const myId = useAuthStore((s) => s.user?.id);
  const isGroup = useChatStore((s) => s.chats.find((c) => c.id === chatId)?.type === "GROUP");
  const [atBottom, setAtBottom] = useState(true);

  // Flatten into day separators + messages, marking runs from the same sender.
  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    let day = "";
    let prev: any = null;

    for (const message of messages) {
      const d = new Date(message.createdAt).toDateString();
      if (d !== day) {
        list.push({ kind: "day", id: `day-${d}`, label: formatDayHeader(message.createdAt) });
        day = d;
        prev = null;
      }
      const grouped =
        !!prev &&
        prev.type !== "SYSTEM" &&
        message.type !== "SYSTEM" &&
        prev.senderId === message.senderId &&
        new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;

      list.push({ kind: "message", id: message.id, message, grouped });
      prev = message;
    }
    return list;
  }, [messages]);

  // Loading older messages inserts rows above the viewport. Virtuoso keeps the scroll
  // position only if `firstItemIndex` shrinks by the number of rows prepended; without
  // this the list jumped to the top of the newly loaded page.
  const firstItemIndex = useRef(START_INDEX);
  const anchor = useRef<{ id: string; index: number } | null>(null);
  const firstMessageIndex = items.findIndex((i) => i.kind === "message");
  const firstMessageId = firstMessageIndex >= 0 ? items[firstMessageIndex].id : null;

  if (firstMessageId) {
    if (!anchor.current) {
      anchor.current = { id: firstMessageId, index: firstMessageIndex };
    } else {
      const nowIndex = items.findIndex((i) => i.id === anchor.current!.id);
      if (nowIndex < 0) {
        anchor.current = { id: firstMessageId, index: firstMessageIndex }; // the anchor itself was deleted
      } else {
        if (nowIndex > anchor.current.index) firstItemIndex.current -= nowIndex - anchor.current.index;
        anchor.current = { id: anchor.current.id, index: nowIndex };
      }
    }
  }

  // Jump to the active search match.
  useEffect(() => {
    if (!searchTargetId) return;
    const index = items.findIndex((i) => i.id === searchTargetId);
    if (index >= 0) virtuoso.current?.scrollToIndex({ index, align: "center", behavior: "smooth" });
  }, [items, searchTargetId]);

  // Sending a message should always bring it into view, even if you'd scrolled up.
  const lastId = messages[messages.length - 1]?.id;
  const lastIsMine = messages[messages.length - 1]?.senderId === myId;
  useEffect(() => {
    if (lastId && lastIsMine && items.length > 0) {
      virtuoso.current?.scrollToIndex({ index: items.length - 1, align: "end", behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  const scrollToBottom = useCallback(() => {
    virtuoso.current?.scrollToIndex({ index: items.length - 1, align: "end", behavior: "smooth" });
  }, [items.length]);

  const components = useMemo(
    () => ({
      Header: () =>
        loadingMore ? (
          <div className="flex justify-center py-3 text-faint"><Loader2 size={16} className="animate-spin" /></div>
        ) : (
          <div className="h-4" />
        ),
      Footer: () => <div className="h-4" />,
    }),
    [loadingMore]
  );

  if (messages.length === 0) {
    if (isLoading) return <MessageSkeleton />;
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-2xl">Nothing here yet</p>
        <p className="mt-2 max-w-[16rem] text-[15px] text-muted">Send the first message to get the conversation going.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <Virtuoso
        key={chatId}
        ref={virtuoso}
        className="h-full"
        data={items}
        firstItemIndex={firstItemIndex.current}
        initialTopMostItemIndex={items.length - 1}
        alignToBottom
        atBottomThreshold={120}
        atBottomStateChange={setAtBottom}
        followOutput={(bottom) => (bottom ? "smooth" : false)}
        startReached={onLoadMore}
        components={components}
        computeItemKey={(_, item) => item.id}
        itemContent={(_, item) =>
          item.kind === "day" ? (
            <DayChip label={item.label} />
          ) : (
            <div className="mx-auto w-full max-w-4xl px-3 sm:px-5">
              <MessageBubble
                message={item.message}
                grouped={item.grouped}
                isGroupChat={isGroup}
                searchQuery={searchQuery}
                isActiveSearchMatch={item.id === searchTargetId}
                onRetry={onRetry}
                onForward={onForward}
              />
            </div>
          )
        }
      />

      {!atBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Jump to latest message"
          className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-sunken"
        >
          <ArrowDown size={18} />
        </button>
      )}
    </div>
  );
});
