"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Search, X } from "lucide-react";
import { Avatar } from "@components/ui/Avatar";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Dialog";
import api, { apiErrorMessage } from "@lib/api";
import { compressImage, uploadToCloudinary } from "@lib/media";
import { toast } from "sonner";

interface NewGroupModalProps {
  onClose: () => void;
  onGroupCreated: (chat: any) => void;
}

export function NewGroupModal({ onClose, onGroupCreated }: NewGroupModalProps) {
  const [title, setTitle] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!image) { setPreview(""); return; }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }

    let stale = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get("/users/search", { params: { q } });
        if (!stale) setResults(res.data.data.users || []);
      } catch {
        if (!stale) setResults([]);
      } finally {
        if (!stale) setSearching(false);
      }
    }, 300);
    return () => { stale = true; clearTimeout(timer); };
  }, [query]);

  const toggle = (user: any) =>
    setSelected((list) => (list.some((u) => u.id === user.id) ? list.filter((u) => u.id !== user.id) : [...list, user]));

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Please choose an image file.");
    if (file.size > 10 * 1024 * 1024) return void toast.error("That image is over 10 MB.");
    setImage(file);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || selected.length === 0) return;
    setCreating(true);
    try {
      let photoUrl: string | undefined;
      if (image) {
        const small = await compressImage(image, 0.5, 1024);
        photoUrl = (await uploadToCloudinary(small, "chat-app/avatars")).url;
      }
      const res = await api.post("/chats/group", {
        title: title.trim(),
        photoUrl,
        memberIds: selected.map((u) => u.id),
      });
      onGroupCreated(res.data.data.chat);
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't create the group."));
      setCreating(false);
    }
  };

  return (
    <Modal open onOpenChange={(open) => !open && !creating && onClose()} title="New group" description="Name it, then pick who's in.">
      <form onSubmit={create} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-4 px-5 pt-5">
          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Choose group picture"
              className="group relative shrink-0 rounded-full"
            >
              <Avatar src={preview} name={title || "Group"} size="lg" isGroup />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/55 text-paper opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera size={18} />
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
            <div className="flex-1">
              <label htmlFor="group-name" className="mb-1.5 block text-sm font-medium">Group name</label>
              <input
                id="group-name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                required
                autoFocus
                className="h-10 w-full rounded-md border border-line bg-surface px-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </div>
          </div>

          {selected.length > 0 && (
            <ul className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto" aria-label="Selected members">
              {selected.map((u) => (
                <li key={u.id} className="flex items-center gap-1.5 rounded-full bg-accent-soft py-0.5 pl-1 pr-2 text-sm">
                  <Avatar src={u.avatarUrl} name={u.name} size="xs" />
                  {u.name.split(" ")[0]}
                  <button type="button" onClick={() => toggle(u)} aria-label={`Remove ${u.name}`} className="rounded-full text-muted hover:text-ink">
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people to add"
              aria-label="Search people to add"
              className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </div>
        </div>

        <div className="mt-2 min-h-[10rem] flex-1 overflow-y-auto px-2">
          {searching ? (
            <div className="flex justify-center py-8 text-faint"><Loader2 size={18} className="animate-spin" /></div>
          ) : query.trim().length < 2 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">Type at least two letters of a name or username.</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">No one found.</p>
          ) : (
            results.map((u) => {
              const on = selected.some((s) => s.id === u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(u)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-sunken"
                >
                  <Avatar src={u.avatarUrl} name={u.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-muted">@{u.username}</span>
                  </span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded border ${on ? "border-accent bg-accent text-accent-ink" : "border-line"}`}>
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-4">
          <span className="text-sm text-muted">{selected.length} selected</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={creating}>Cancel</Button>
            <Button type="submit" variant="accent" disabled={creating || !title.trim() || selected.length === 0}>
              {creating ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : "Create group"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
