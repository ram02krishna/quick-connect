"use client";

import * as React from "react";
import { memo, useState } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { AlertCircle, Check, CheckCheck, ChevronDown, Clock, Copy, Download, FileText, Forward, Play, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@components/ui/Avatar";
import { ConfirmDialog } from "@components/ui/Dialog";
import { CustomAudioPlayer } from "./CustomAudioPlayer";
import { MediaLightbox } from "./MediaLightbox";
import { useAuthStore } from "@hooks/useAuthStore";
import { useChatStore } from "@hooks/useChatStore";
import api, { apiErrorMessage } from "@lib/api";
import { downloadFile } from "@lib/download";
import { formatBytes, formatClock } from "@lib/format";
import { cn } from "@lib/utils";

export interface MessageBubbleProps {
  message: any;
  /** Message continues a run from the same sender: tighter spacing, and no repeated avatar/name. */
  grouped?: boolean;
  isGroupChat?: boolean;
  searchQuery?: string;
  isActiveSearchMatch?: boolean;
  onRetry?: (message: any) => void;
  onForward?: (message: any) => void;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, query, active }: { text: string; query?: string; active: boolean }) {
  const q = query?.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className={cn("rounded-sm px-0.5 text-ink", active ? "bg-accent text-accent-ink" : "bg-accent-soft")}>{part}</mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

function Ticks({ message, myId, others }: { message: any; myId?: string; others: number }) {
  if (message.isSending) return <Clock size={13} aria-label="Sending" />;
  if (message.hasFailed) return <AlertCircle size={13} className="text-danger" aria-label="Failed to send" />;

  const receipts = (message.receipts ?? []).filter((r: any) => r.userId !== myId);
  const read = receipts.filter((r: any) => r.readAt).length >= others;
  const delivered = receipts.filter((r: any) => r.deliveredAt || r.readAt).length >= others;

  if (read) return <CheckCheck size={15} className="text-accent" aria-label="Read" />;
  if (delivered) return <CheckCheck size={15} aria-label="Delivered" />;
  return <Check size={15} aria-label="Sent" />;
}

export const MessageBubble = memo(function MessageBubble({
  message, grouped, isGroupChat, searchQuery, isActiveSearchMatch = false, onRetry, onForward,
}: MessageBubbleProps) {
  const myId = useAuthStore((s) => s.user?.id);
  // A number (not the chat object) so the bubble doesn't re-render whenever any chat changes.
  const memberCount = useChatStore((s) => s.chats.find((c) => c.id === message.chatId)?.members.length ?? 2);

  const [lightbox, setLightbox] = useState<{ url: string; type: "IMAGE" | "VIDEO" | "PDF"; name: string } | null>(null);
  const [confirmEveryone, setConfirmEveryone] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isSelf = message.senderId === myId;
  const isTemp = String(message.id).startsWith("temp-");
  const deleted = Boolean(message.deletedForEveryoneAt);
  const attachments: any[] = message.attachments ?? [];

  // ── system announcements ───────────────────────────────────────────────────
  if (message.type === "SYSTEM") {
    return (
      <p className="mx-auto my-1 w-fit max-w-[85%] rounded-full bg-sunken px-3 py-1 text-center text-xs text-muted">
        {message.content}
      </p>
    );
  }

  const mediaOnly =
    !deleted && attachments.length > 0 &&
    attachments.every((a) => a.fileType === "IMAGE" || a.fileType === "VIDEO") &&
    (!message.content || message.content === attachments[0]?.fileName);

  // Attachment messages store the file name as their text; don't repeat it as a caption.
  const caption =
    deleted ? message.content
    : attachments.length > 0 && (!message.content || message.content === attachments[0]?.fileName || message.type === "AUDIO")
      ? ""
      : message.content;

  const deleteForMe = async () => {
    try {
      await api.delete(`/messages/${message.chatId}/${message.id}`, { data: { scope: "me" } });
      useChatStore.getState().removeMessageForMe(message.chatId, message.id);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete the message."));
    }
  };

  const deleteForEveryone = async () => {
    setDeleting(true);
    try {
      await api.delete(`/messages/${message.chatId}/${message.id}`, { data: { scope: "everyone" } });
      useChatStore.getState().markMessageDeletedForEveryone(message.chatId, message.id);
      setConfirmEveryone(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete the message."));
    } finally {
      setDeleting(false);
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(message.content ?? "");
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  const showMenu = !deleted && !message.isSending && !message.hasFailed && !isTemp;

  return (
    <div className={cn("group flex gap-2", isSelf ? "flex-row-reverse" : "flex-row", grouped ? "mt-0.5" : "mt-2.5")}>
      {isGroupChat && !isSelf && (
        <div className="mt-5 w-8 shrink-0">
          {!grouped && <Avatar src={message.sender?.avatarUrl} name={message.sender?.name} size="sm" />}
        </div>
      )}

      <div className={cn("flex min-w-0 max-w-[85%] flex-col sm:max-w-[72%]", isSelf ? "items-end" : "items-start")}>
        {isGroupChat && !isSelf && !grouped && (
          <span className="mb-0.5 px-1 text-xs font-semibold text-accent-strong">{message.sender?.name ?? "Unknown"}</span>
        )}

        <div
          className={cn(
            "relative max-w-full rounded-lg border text-[15px] leading-relaxed",
            mediaOnly ? "overflow-hidden p-1" : "px-3 py-2",
            isSelf ? "rounded-tr-sm border-transparent bg-bubble-out" : "rounded-tl-sm border-line bg-bubble-in",
            deleted && "border-dashed border-line bg-transparent text-muted italic",
            message.isSending && "opacity-70",
            message.hasFailed && "border-danger/50"
          )}
        >
          {showMenu && (
            <Menu.Root>
              <Menu.Trigger
                aria-label="Message actions"
                className={cn(
                  "absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-surface/90 text-muted shadow-sm",
                  "opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100",
                  "[@media(hover:none)]:opacity-70"
                )}
              >
                <ChevronDown size={15} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content
                  align={isSelf ? "end" : "start"}
                  sideOffset={4}
                  className="z-[65] min-w-44 animate-fade overflow-hidden rounded-md border border-line bg-surface p-1 text-sm text-ink"
                >
                  {message.content && attachments.length === 0 && (
                    <MenuItem icon={<Copy size={15} />} onSelect={copyText}>Copy text</MenuItem>
                  )}
                  <MenuItem icon={<Forward size={15} />} onSelect={() => onForward?.(message)}>Forward</MenuItem>
                  <MenuItem icon={<Trash2 size={15} />} onSelect={deleteForMe}>Delete for me</MenuItem>
                  {isSelf && (
                    <MenuItem icon={<Trash2 size={15} />} danger onSelect={() => setConfirmEveryone(true)}>Delete for everyone</MenuItem>
                  )}
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          )}

          {attachments.length > 0 && !deleted && (
            <div className={cn("space-y-2", caption && "mb-2")}>
              {attachments.map((att, i) => {
                const key = att.id || `${message.id}-${i}`;
                const name = att.fileName || "File";
                const mime: string = att.mimeType || "";
                const isImage = att.fileType === "IMAGE" || mime.startsWith("image/");
                const isVideo = att.fileType === "VIDEO" || mime.startsWith("video/");
                const isAudio = att.fileType === "AUDIO" || mime.startsWith("audio/");
                const isPdf = mime === "application/pdf" || name.toLowerCase().endsWith(".pdf");

                if (isImage) {
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLightbox({ url: att.fileUrl, type: "IMAGE", name })}
                      className="relative block overflow-hidden rounded-md bg-sunken"
                      aria-label={`Open image ${name}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={att.fileUrl} alt={name} loading="lazy" className="max-h-72 min-h-24 min-w-32 max-w-full object-contain" />
                    </button>
                  );
                }

                if (isVideo) {
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLightbox({ url: att.fileUrl, type: "VIDEO", name })}
                      className="relative block overflow-hidden rounded-md bg-black"
                      aria-label={`Play video ${name}`}
                    >
                      <video src={att.fileUrl} preload="metadata" muted playsInline className="pointer-events-none max-h-72 min-h-24 max-w-full" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-paper/90 text-ink">
                          <Play size={18} fill="currentColor" className="ml-0.5" />
                        </span>
                      </span>
                    </button>
                  );
                }

                if (isAudio) {
                  return <CustomAudioPlayer key={key} src={att.fileUrl} onDownload={() => void downloadFile(att.fileUrl, name)} />;
                }

                return (
                  <div key={key} className="flex w-64 max-w-full items-center gap-3 rounded-md border border-ink/10 bg-ink/5 p-2.5">
                    <button
                      type="button"
                      onClick={() => (isPdf ? setLightbox({ url: att.fileUrl, type: "PDF", name }) : void downloadFile(att.fileUrl, name))}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-ink text-paper"><FileText size={17} /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{name}</span>
                        <span className="block text-xs text-muted">{formatBytes(att.fileSize)}{isPdf && " · PDF"}</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => void downloadFile(att.fileUrl, name)} aria-label={`Download ${name}`} className="shrink-0 rounded p-1.5 text-muted hover:text-ink">
                      <Download size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {caption && (
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              <Highlighted text={caption} query={searchQuery} active={isActiveSearchMatch} />
            </p>
          )}

          <div
            className={cn(
              "flex items-center justify-end gap-1 text-[11px] tabular-nums text-muted",
              !mediaOnly && "mt-0.5",
              mediaOnly && "absolute bottom-2 right-2 rounded-full bg-ink/60 px-2 py-0.5 text-paper"
            )}
          >
            <span>{formatClock(message.createdAt)}</span>
            {isSelf && !deleted && <Ticks message={message} myId={myId} others={Math.max(1, memberCount - 1)} />}
          </div>

          {isActiveSearchMatch && <span className="pointer-events-none absolute -inset-0.5 rounded-lg ring-2 ring-accent" />}
        </div>

        {message.hasFailed && onRetry && (
          <button type="button" onClick={() => onRetry(message)} className="mt-1 flex items-center gap-1 text-xs font-medium text-danger hover:underline">
            <RotateCcw size={12} /> Not sent — tap to retry
          </button>
        )}
      </div>

      {lightbox && (
        <MediaLightbox isOpen onClose={() => setLightbox(null)} mediaUrl={lightbox.url} mediaType={lightbox.type} fileName={lightbox.name} />
      )}

      <ConfirmDialog
        open={confirmEveryone}
        onOpenChange={setConfirmEveryone}
        title="Delete for everyone?"
        description="This removes the message for everyone in the chat. It can't be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={deleteForEveryone}
      />
    </div>
  );
});

function MenuItem({ icon, danger, onSelect, children }: { icon: React.ReactNode; danger?: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <Menu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-2 outline-none data-[highlighted]:bg-sunken",
        danger && "text-danger data-[highlighted]:bg-danger-soft"
      )}
    >
      {icon}
      {children}
    </Menu.Item>
  );
}
