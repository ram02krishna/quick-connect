"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Paperclip, Send, Smile, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@components/ui/Button";
import { useSocketStore } from "@hooks/useSocketStore";
import { apiErrorMessage } from "@lib/api";
import { compressImage, kindOfFile, MAX_UPLOAD_BYTES, uploadToCloudinary } from "@lib/media";
import { formatDuration } from "@lib/format";
import { cn } from "@lib/utils";

export interface OutgoingAttachment {
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  mimeType: string;
}

interface MessageInputProps {
  chatId: string;
  onSendMessage: (content: string, type: string, attachments?: OutgoingAttachment[]) => Promise<void>;
}

const EMOJIS = ["😀", "😂", "😊", "😍", "🥹", "😎", "🤔", "😮", "😢", "😡", "👍", "👎", "👏", "🙌", "🙏", "💪", "❤️", "🔥", "🎉", "✨", "💯", "✅", "👀", "🤝"];
const MAX_LENGTH = 5000;
const MIN_RECORDING_MS = 800;
const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function MessageInput({ chatId, onSendMessage }: MessageInputProps) {
  const socket = useSocketStore((s) => s.socket);

  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isTyping = useRef(false);

  const draftKey = `quickconnect:draft:${chatId}`;

  // ── drafts ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setText(localStorage.getItem(draftKey) ?? "");
  }, [draftKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim()) localStorage.setItem(draftKey, text);
      else localStorage.removeItem(draftKey);
    }, 250);
    return () => clearTimeout(t);
  }, [draftKey, text]);

  // Grow with content, up to about six lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 140);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > 140 ? "auto" : "hidden";
  }, [text]);

  // ── typing indicator ────────────────────────────────────────────────────────
  const stopTyping = useCallback(() => {
    clearTimeout(typingTimer.current);
    if (isTyping.current) {
      isTyping.current = false;
      socket?.emit("typing:stop", { chatId });
    }
  }, [socket, chatId]);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (!socket) return;
    if (!isTyping.current) {
      isTyping.current = true;
      socket.emit("typing:start", { chatId });
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 2000);
  };

  // ── emoji popover ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!emojiRef.current?.contains(e.target as Node)) setEmojiOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setEmojiOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen]);

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText((t) => t.slice(0, start) + emoji + t.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  // ── sending text ────────────────────────────────────────────────────────────
  const send = async () => {
    const content = text.trim();
    if (!content || uploading) return;
    stopTyping();
    setText("");
    localStorage.removeItem(draftKey);
    await onSendMessage(content, "TEXT");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter adds a line. Don't send while an IME is composing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  // ── attachments ─────────────────────────────────────────────────────────────
  const uploadAndSend = async (original: File, caption?: string) => {
    const kind = kindOfFile(original);
    if (original.size > MAX_UPLOAD_BYTES[kind]) {
      toast.error(`${original.name} is too large (max ${MAX_UPLOAD_BYTES[kind] / 1024 / 1024} MB).`);
      return;
    }

    const file = kind === "IMAGE" ? await compressImage(original) : original;
    const { url } = await uploadToCloudinary(file, `chat-app/${chatId}`);

    await onSendMessage(caption ?? original.name, kind, [
      {
        fileName: original.name,
        fileType: kind,
        fileSize: file.size,
        fileUrl: url,
        mimeType: file.type || original.type || "application/octet-stream",
      },
    ]);
  };

  const onFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files.slice(0, 10)) await uploadAndSend(file);
    } catch (err) {
      toast.error(apiErrorMessage(err, "The upload failed. Please try again."));
    } finally {
      setUploading(false);
    }
  };

  // ── voice notes ─────────────────────────────────────────────────────────────
  const releaseRecorder = () => {
    clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    setRecording(false);
    setSeconds(0);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice messages aren't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      discardRef.current = false;
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const tooShort = Date.now() - startedAtRef.current < MIN_RECORDING_MS;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        releaseRecorder(); // the microphone is freed before the upload starts

        if (discardRef.current) return;
        if (tooShort || blob.size < 500) return void toast.info("Hold a little longer to record a message.");

        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-message-${Date.now()}.${ext}`, { type: type.split(";")[0] });

        setUploading(true);
        try {
          await uploadAndSend(file, "Voice message");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Couldn't send the voice message."));
        } finally {
          setUploading(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err: any) {
      toast.error(err?.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in your browser settings." : "Couldn't access the microphone.");
    }
  };

  const finishRecording = (discard: boolean) => {
    discardRef.current = discard;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else releaseRecorder();
  };

  // Leaving the chat mid-recording must not leave the microphone on.
  useEffect(() => {
    return () => {
      stopTyping();
      discardRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      else releaseRecorder();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const hasText = text.trim().length > 0;

  return (
    <div className="shrink-0 border-t border-line bg-surface px-3 py-3 sm:px-4">
      {recording ? (
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <IconButton label="Discard recording" tone="danger" onClick={() => finishRecording(true)}>
            <Trash2 size={18} />
          </IconButton>
          <span className="flex flex-1 items-center gap-2.5 rounded-md bg-sunken px-3 py-2.5 text-sm">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
            Recording
            <span className="tabular-nums text-muted">{formatDuration(seconds)}</span>
          </span>
          <button
            type="button"
            onClick={() => finishRecording(false)}
            aria-label="Send voice message"
            className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-ink hover:bg-accent-strong"
          >
            <Send size={17} />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          <div ref={emojiRef} className="relative">
            <IconButton label="Emoji" active={emojiOpen} onClick={() => setEmojiOpen((o) => !o)} disabled={uploading} className="h-10 w-10">
              <Smile size={20} />
            </IconButton>
            {emojiOpen && (
              <div role="dialog" aria-label="Choose an emoji" className="absolute bottom-12 left-0 z-20 grid w-64 max-w-[calc(100vw-2rem)] animate-fade grid-cols-8 gap-0.5 rounded-lg border border-line bg-surface p-2">
                {EMOJIS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="rounded p-1 text-xl hover:bg-sunken">
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <IconButton label="Attach files" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-10 w-10">
            {uploading ? <Loader2 size={19} className="animate-spin text-accent" /> : <Paperclip size={19} />}
          </IconButton>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={onFilesPicked} />

          <textarea
            ref={textareaRef}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onBlur={stopTyping}
            rows={1}
            maxLength={MAX_LENGTH}
            placeholder={uploading ? "Uploading…" : "Write a message"}
            aria-label="Message"
            disabled={uploading}
            className="max-h-36 min-h-10 flex-1 resize-none overflow-hidden rounded-md border border-line bg-paper px-3 py-2 text-[15px] leading-6 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
          />

          {hasText ? (
            <button
              type="button"
              onClick={() => void send()}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-ink hover:bg-accent-strong"
            >
              <Send size={17} />
            </button>
          ) : (
            <IconButton label="Record voice message" onClick={() => void startRecording()} disabled={uploading} className={cn("h-10 w-10")}>
              <Mic size={20} />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}
