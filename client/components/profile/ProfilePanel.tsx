"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, FileText, Loader2, LogOut, Pencil, Play, Plus, Trash2, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@components/ui/Avatar";
import { Button, IconButton } from "@components/ui/Button";
import { ConfirmDialog } from "@components/ui/Dialog";
import { MediaLightbox } from "@components/chat/MediaLightbox";
import { useChatStore } from "@hooks/useChatStore";
import { useAuthStore } from "@hooks/useAuthStore";
import api, { apiErrorMessage } from "@lib/api";
import { downloadFile } from "@lib/download";
import { getChatDisplay } from "@lib/chatHelpers";
import { formatBytes } from "@lib/format";
import { cn } from "@lib/utils";

const NO_MESSAGES: any[] = [];

type Tab = "members" | "media" | "files";
type Confirm = null | { kind: "leave" | "delete" } | { kind: "remove"; userId: string; name: string };

export function ProfilePanel({ onClose, chatId }: { onClose: () => void; chatId: string }) {
  const router = useRouter();
  const myId = useAuthStore((s) => s.user?.id);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const messages = useChatStore((s) => s.messages[chatId] ?? NO_MESSAGES);
  const onlineStatuses = useChatStore((s) => s.onlineStatuses);

  const isGroup = chat?.type === "GROUP";
  const isOwner = chat?.createdBy === myId;

  const [tab, setTab] = useState<Tab>(isGroup ? "members" : "media");
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [adding, setAdding] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirming, setConfirming] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; type: "IMAGE" | "VIDEO" | "PDF"; name: string } | null>(null);

  const attachments = useMemo(() => messages.flatMap((m: any) => (m.deletedForEveryoneAt ? [] : m.attachments ?? [])), [messages]);
  const media = attachments.filter((a: any) => ["IMAGE", "VIDEO"].includes(a.fileType) || /^(image|video)\//.test(a.mimeType ?? ""));
  const files = attachments.filter((a: any) => !media.includes(a) && a.fileType !== "AUDIO" && !(a.mimeType ?? "").startsWith("audio/"));

  const memberIds = chat?.members.map((m) => m.userId).join(",") ?? "";
  useEffect(() => {
    const q = memberQuery.trim();
    if (!adding || q.length < 2) { setMemberResults([]); return; }
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get("/users/search", { params: { q } });
        const existing = new Set(memberIds.split(","));
        if (!stale) setMemberResults((res.data.data.users as any[]).filter((u) => !existing.has(u.id)));
      } catch {
        if (!stale) setMemberResults([]);
      }
    }, 300);
    return () => { stale = true; clearTimeout(timer); };
  }, [memberQuery, adding, memberIds]);

  if (!chat) return null;

  const display = getChatDisplay(chat, myId);
  const partner = display.partner;
  const online = !isGroup && partner && onlineStatuses[partner.id] === "online";

  const saveTitle = async () => {
    const title = draftTitle.trim();
    if (!title || title === chat.title) return setEditing(false);
    setSavingTitle(true);
    try {
      await api.patch(`/chats/${chat.id}`, { title });
      useChatStore.getState().updateChat(chat.id, { title });
      setEditing(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't rename the group."));
    } finally {
      setSavingTitle(false);
    }
  };

  const addMember = async (user: any) => {
    setBusyId(user.id);
    try {
      await api.post(`/chats/${chat.id}/members`, { userId: user.id });
      setMemberQuery("");
      setMemberResults([]);
      // The server announces the change and the chat refreshes itself via chat:updated.
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't add that person."));
    } finally {
      setBusyId(null);
    }
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    setConfirming(true);
    try {
      if (confirm.kind === "remove") {
        await api.delete(`/chats/${chat.id}/members/${confirm.userId}`);
      } else if (confirm.kind === "leave") {
        await api.delete(`/chats/${chat.id}/members/${myId}`);
        useChatStore.getState().deleteChat(chat.id);
        onClose();
        router.push("/chats");
      } else {
        await api.delete(`/chats/${chat.id}`);
        useChatStore.getState().deleteChat(chat.id);
        onClose();
        router.push("/chats");
      }
      setConfirm(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "That didn't work. Please try again."));
    } finally {
      setConfirming(false);
    }
  };

  const confirmCopy = {
    leave: { title: "Leave this group?", description: "You'll stop receiving its messages. Someone else can add you back.", label: "Leave group" },
    delete: {
      title: isGroup ? "Delete this group?" : "Delete this conversation?",
      description: isGroup
        ? "The group and all its messages are removed for every member. This can't be undone."
        : `The conversation and all its messages are removed for both you and ${display.name}. This can't be undone.`,
      label: "Delete",
    },
    remove: { title: `Remove ${confirm?.kind === "remove" ? confirm.name : ""}?`, description: "They'll no longer see new messages in this group.", label: "Remove" },
  } as const;

  const tabs: [Tab, string][] = [
    ...(isGroup ? ([["members", `Members · ${chat.members.length}`]] as [Tab, string][]) : []),
    ["media", `Media · ${media.length}`],
    ["files", `Files · ${files.length}`],
  ];

  return (
    <aside className="flex h-full w-full flex-col bg-surface" aria-label="Conversation details">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
        <h2 className="font-semibold">{isGroup ? "Group info" : "Contact info"}</h2>
        <IconButton label="Close details" onClick={onClose}><X size={18} /></IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center border-b border-line px-5 pb-6 pt-7 text-center">
          <Avatar src={display.avatarUrl} name={display.name} size="xl" isGroup={isGroup} showStatus={!isGroup} isOnline={Boolean(online)} />

          {editing ? (
            <div className="mt-4 flex w-full max-w-xs items-center gap-1.5">
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void saveTitle(); if (e.key === "Escape") setEditing(false); }}
                maxLength={80}
                autoFocus
                aria-label="Group name"
                className="h-9 min-w-0 flex-1 rounded-md border border-accent bg-paper px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
              <IconButton label="Save name" onClick={() => void saveTitle()} disabled={savingTitle}>
                {savingTitle ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} />}
              </IconButton>
            </div>
          ) : (
            <div className="mt-4 flex max-w-full items-center gap-1">
              <h3 className="truncate font-display text-2xl">{display.name}</h3>
              {isGroup && isOwner && (
                <IconButton label="Rename group" onClick={() => { setDraftTitle(chat.title ?? ""); setEditing(true); }} className="h-8 w-8">
                  <Pencil size={14} />
                </IconButton>
              )}
            </div>
          )}

          <p className="mt-1 text-sm text-muted">{isGroup ? `${chat.members.length} members` : `@${partner?.username ?? "unknown"}`}</p>
          {!isGroup && partner?.bio && <p className="mt-3 max-w-xs text-[15px] italic text-muted">“{partner.bio}”</p>}
        </div>

        <div className="flex border-b border-line px-2" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("-mb-px border-b-2 px-3 py-3 text-sm font-medium", tab === id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "members" && isGroup && (
            <div className="space-y-3">
              {isOwner && (
                adding ? (
                  <div className="space-y-2 rounded-md border border-line bg-paper p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={memberQuery}
                        onChange={(e) => setMemberQuery(e.target.value)}
                        placeholder="Search by name or username"
                        aria-label="Search people to add"
                        autoFocus
                        className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none"
                      />
                      <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setMemberQuery(""); }}>Done</Button>
                    </div>
                    {memberResults.map((u) => (
                      <button key={u.id} type="button" onClick={() => void addMember(u)} disabled={busyId === u.id} className="flex w-full items-center gap-2.5 rounded p-1.5 text-left hover:bg-sunken disabled:opacity-60">
                        <Avatar src={u.avatarUrl} name={u.name} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                        {busyId === u.id ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} className="text-accent" />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus size={15} /> Add member</Button>
                )
              )}

              <ul className="divide-y divide-line/70">
                {chat.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5">
                    <Avatar src={m.user.avatarUrl} name={m.user.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.userId === myId ? "You" : m.user.name}</span>
                      <span className="block truncate text-xs text-muted">@{m.user.username}</span>
                    </span>
                    {m.userId === chat.createdBy && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent-strong">Owner</span>}
                    {isOwner && m.userId !== myId && (
                      <IconButton label={`Remove ${m.user.name}`} tone="danger" className="h-8 w-8" onClick={() => setConfirm({ kind: "remove", userId: m.userId, name: m.user.name })}>
                        <UserMinus size={15} />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "media" && (
            media.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No photos or videos shared yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {media.map((a: any, i: number) => {
                  const video = a.fileType === "VIDEO" || (a.mimeType ?? "").startsWith("video/");
                  return (
                    <button
                      key={a.id ?? i}
                      type="button"
                      onClick={() => setViewer({ url: a.fileUrl, type: video ? "VIDEO" : "IMAGE", name: a.fileName })}
                      aria-label={`Open ${a.fileName}`}
                      className="relative aspect-square overflow-hidden rounded bg-sunken"
                    >
                      {video ? (
                        <video src={a.fileUrl} preload="metadata" muted playsInline className="pointer-events-none h-full w-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.fileUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                      {video && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white"><Play size={18} fill="currentColor" /></span>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          )}

          {tab === "files" && (
            files.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No files shared yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {files.map((a: any, i: number) => (
                  <li key={a.id ?? i}>
                    <button type="button" onClick={() => void downloadFile(a.fileUrl, a.fileName)} className="flex w-full items-center gap-3 rounded-md border border-line p-2.5 text-left hover:bg-sunken">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-ink text-paper"><FileText size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.fileName}</span>
                        <span className="text-xs text-muted">{formatBytes(a.fileSize)}</span>
                      </span>
                      <Download size={15} className="shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
          <p className="mt-4 text-xs text-faint">Shared items come from messages loaded in this chat.</p>
        </div>

        <div className="space-y-2 border-t border-line p-4">
          {isGroup && (
            <Button variant="secondary" className="w-full justify-start text-danger" onClick={() => setConfirm({ kind: "leave" })}>
              <LogOut size={16} /> Leave group
            </Button>
          )}
          {(!isGroup || isOwner) && (
            <Button variant="secondary" className="w-full justify-start text-danger" onClick={() => setConfirm({ kind: "delete" })}>
              <Trash2 size={16} /> {isGroup ? "Delete group" : "Delete conversation"}
            </Button>
          )}
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && !confirming && setConfirm(null)}
          title={confirmCopy[confirm.kind].title}
          description={confirmCopy[confirm.kind].description}
          confirmLabel={confirmCopy[confirm.kind].label}
          destructive
          loading={confirming}
          onConfirm={runConfirmed}
        />
      )}

      {viewer && <MediaLightbox isOpen onClose={() => setViewer(null)} mediaUrl={viewer.url} mediaType={viewer.type} fileName={viewer.name} />}
    </aside>
  );
}
