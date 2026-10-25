"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@components/ui/Avatar";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Dialog";
import { useAuthStore } from "@hooks/useAuthStore";
import { useChatStore } from "@hooks/useChatStore";
import api, { apiErrorMessage } from "@lib/api";
import { getChatDisplay } from "@lib/chatHelpers";

interface ForwardMessageModalProps {
  message: any;
  onClose: () => void;
}

/** Forward one message to any number of your other conversations. */
export function ForwardMessageModal({ message, onClose }: ForwardMessageModalProps) {
  const myId = useAuthStore((s) => s.user?.id);
  const chats = useChatStore((s) => s.chats);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chats
      .filter((c) => c.id !== message.chatId)
      .map((chat) => ({ chat, display: getChatDisplay(chat, myId) }))
      .filter(({ display }) => !q || display.name.toLowerCase().includes(q));
  }, [chats, search, message.chatId, myId]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const forward = async () => {
    setSending(true);
    const attachments = (message.attachments ?? []).map((a: any) => ({
      fileName: a.fileName, fileType: a.fileType, fileSize: a.fileSize, fileUrl: a.fileUrl, mimeType: a.mimeType,
    }));

    const results = await Promise.allSettled(
      picked.map((chatId) =>
        api.post(`/messages/${chatId}`, { content: message.content, type: message.type, attachments })
      )
    );

    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (failed.length === 0) toast.success(picked.length === 1 ? "Message forwarded" : `Forwarded to ${picked.length} chats`);
    else toast.error(apiErrorMessage(failed[0].reason, `Couldn't forward to ${failed.length} chat${failed.length === 1 ? "" : "s"}.`));

    setSending(false);
    if (failed.length < picked.length) onClose();
  };

  return (
    <Modal open onOpenChange={(open) => !open && !sending && onClose()} title="Forward message">
      <div className="px-5 pt-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-10 w-full rounded-md border border-line bg-paper pl-9 pr-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
      </div>

      <div className="mt-2 min-h-[10rem] flex-1 overflow-y-auto px-2">
        {options.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted">No other chats to forward to.</p>
        ) : (
          options.map(({ chat, display }) => {
            const on = picked.includes(chat.id);
            return (
              <button key={chat.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(chat.id)} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-sunken">
                <Avatar src={display.avatarUrl} name={display.name} isGroup={display.isGroup} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{display.name}</span>
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${on ? "border-accent bg-accent text-accent-ink" : "border-line"}`}>
                  {on && <Check size={13} strokeWidth={3} />}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-4">
        <span className="text-sm text-muted">{picked.length} selected</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button variant="accent" onClick={() => void forward()} disabled={sending || picked.length === 0}>
            {sending ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : "Forward"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
