"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Maximize2, Mic, MicOff, MonitorOff, MonitorUp, Phone, PhoneOff, Video, VideoOff, Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallStore } from "@hooks/useCallStore";
import { Avatar } from "@components/ui/Avatar";
import { formatDuration } from "@lib/format";
import { cn } from "@lib/utils";

/**
 * Plays everyone else's voice. It lives at the root of the overlay and is never unmounted
 * while a call exists, so minimising/maximising the call can't silence the audio.
 */
function RemoteAudio({ stream, volume }: { stream: MediaStream; volume: number }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    if (ref.current) ref.current.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  return <audio ref={ref} autoPlay />;
}

function VideoTile({ stream, mirrored, fit = "cover", className }: { stream: MediaStream; mirrored?: boolean; fit?: "cover" | "contain"; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);

  // Always muted: sound comes from <RemoteAudio>, and the local preview must never echo.
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn("h-full w-full", fit === "contain" ? "object-contain" : "object-cover", mirrored && "-scale-x-100", className)}
    />
  );
}

function ControlButton({ label, onClick, active, disabled, children, tone = "default" }: {
  label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode; tone?: "default" | "end";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full transition-colors disabled:opacity-40",
        tone === "end" ? "bg-[#d92d20] text-white hover:bg-[#b42318]"
          : active ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25"
      )}
    >
      {children}
    </button>
  );
}

export function CallOverlay() {
  const callState = useCallStore((s) => s.callState);
  const callType = useCallStore((s) => s.callType);
  const isGroupCall = useCallStore((s) => s.isGroupCall);
  const partner = useCallStore((s) => s.partner);
  const groupChatTitle = useCallStore((s) => s.groupChatTitle);
  const participants = useCallStore((s) => s.participants);
  const localStream = useCallStore((s) => s.localStream);
  const remoteStream = useCallStore((s) => s.remoteStream);
  const remoteStreams = useCallStore((s) => s.remoteStreams);
  const isMuted = useCallStore((s) => s.isMuted);
  const isCameraOff = useCallStore((s) => s.isCameraOff);
  const isScreenSharing = useCallStore((s) => s.isScreenSharing);
  const isMinimized = useCallStore((s) => s.isMinimized);
  const callVolume = useCallStore((s) => s.callVolume);
  const actions = useCallStore.getState;

  const [seconds, setSeconds] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (callState !== "connected") { setSeconds(0); setSwapped(false); return; }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  useEffect(() => { if (callState === "idle") { setPos(null); setShowVolume(false); } }, [callState]);

  if (callState === "idle" || (!partner && !isGroupCall)) return null;

  const title = isGroupCall ? groupChatTitle || "Group call" : partner?.name ?? "";
  const avatar = isGroupCall ? null : partner?.avatarUrl ?? null;
  const connected = callState === "connected";
  const hasVideo = callType === "video";
  const canShare = hasVideo && typeof navigator !== "undefined" && "getDisplayMedia" in (navigator.mediaDevices ?? {});

  const status =
    callState === "incoming" ? `Incoming ${isGroupCall ? "group " : ""}${hasVideo ? "video" : "voice"} call`
    : callState === "outgoing" ? "Calling…"
    : formatDuration(seconds);

  const audioStreams: [string, MediaStream][] = isGroupCall
    ? Object.entries(remoteStreams)
    : remoteStream ? [["peer", remoteStream]] : [];

  const audioLayer = (
    <div className="hidden">
      {audioStreams.map(([id, stream]) => <RemoteAudio key={id} stream={stream} volume={callVolume} />)}
    </div>
  );

  const endOrCancel = () => actions().endCall();
  const accept = () => (isGroupCall ? void actions().acceptGroupCall() : void actions().acceptCall());

  const VolumeIcon = callVolume === 0 ? VolumeX : callVolume < 0.5 ? Volume1 : Volume2;

  // ── minimised, draggable widget ─────────────────────────────────────────────
  if (isMinimized) {
    const mainStream = swapped ? localStream : remoteStream;
    const onPointerDown = (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const rect = widgetRef.current!.getBoundingClientRect();
      drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
      if (!drag.current || !widgetRef.current) return;
      const { width, height } = widgetRef.current.getBoundingClientRect();
      setPos({
        x: Math.min(Math.max(8, e.clientX - drag.current.dx), window.innerWidth - width - 8),
        y: Math.min(Math.max(8, e.clientY - drag.current.dy), window.innerHeight - height - 8),
      });
    };

    return (
      <div
        ref={widgetRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        style={pos ? { left: pos.x, top: pos.y } : undefined}
        className={cn(
          "fixed z-50 w-56 touch-none cursor-grab select-none overflow-hidden rounded-lg border border-white/15 bg-[#121a20] text-white active:cursor-grabbing",
          !pos && "bottom-4 right-4"
        )}
        role="region"
        aria-label="Call in progress"
      >
        {audioLayer}
        {hasVideo && connected && mainStream ? (
          <div className="relative h-32 bg-black">
            <VideoTile stream={mainStream} mirrored={swapped && !isScreenSharing} />
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3">
            <Avatar src={avatar} name={title} size="sm" isGroup={isGroupCall} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{title}</p>
              <p className="text-xs tabular-nums text-white/60">{status}</p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-1 border-t border-white/10 px-2 py-1.5">
          <button type="button" onClick={() => actions().setIsMinimized(false)} aria-label="Expand call" className="flex h-8 w-8 items-center justify-center rounded hover:bg-white/15"><Maximize2 size={15} /></button>
          <button type="button" onClick={() => actions().toggleMute()} disabled={!connected} aria-label={isMuted ? "Unmute" : "Mute"} className={cn("flex h-8 w-8 items-center justify-center rounded hover:bg-white/15 disabled:opacity-40", isMuted && "bg-white text-black hover:bg-white")}>
            {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
          <button type="button" onClick={endOrCancel} aria-label="End call" className="flex h-8 w-12 items-center justify-center rounded bg-[#d92d20] hover:bg-[#b42318]"><PhoneOff size={15} /></button>
        </div>
      </div>
    );
  }

  // ── full screen ─────────────────────────────────────────────────────────────
  const remoteList = Object.entries(remoteStreams);
  const main = swapped ? localStream : remoteStream;
  const pip = swapped ? remoteStream : localStream;
  const tiles = remoteList.length + (localStream && !isCameraOff ? 1 : 0);
  const gridCols = tiles <= 1 ? "grid-cols-1" : tiles === 2 ? "grid-cols-1 sm:grid-cols-2" : tiles <= 4 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1014] text-white" role="dialog" aria-label={`${title} call`} aria-modal="true">
      {audioLayer}

      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => actions().setIsMinimized(true)} aria-label="Minimise call" className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10 hover:bg-white/20">
            <ChevronDown size={19} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="text-xs tabular-nums text-white/60">{status}</p>
          </div>
        </div>

        <div className="relative">
          <button type="button" onClick={() => setShowVolume((v) => !v)} aria-label="Call volume" aria-expanded={showVolume} className="flex h-9 items-center gap-2 rounded-md bg-white/10 px-3 text-sm hover:bg-white/20">
            <VolumeIcon size={17} />
            <span className="tabular-nums">{Math.round(callVolume * 100)}%</span>
          </button>
          {showVolume && (
            <div className="absolute right-0 top-11 z-30 w-56 rounded-lg border border-white/15 bg-[#19232b] p-4">
              <label htmlFor="call-volume" className="mb-2 block text-xs text-white/60">Their volume</label>
              <input
                id="call-volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={callVolume}
                onChange={(e) => actions().setCallVolume(parseFloat(e.target.value))}
                className="w-full accent-[#4cc3d9]"
              />
            </div>
          )}
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1">
        {hasVideo && connected ? (
          isGroupCall ? (
            <div className={cn("grid h-full gap-2 p-2 sm:p-4", gridCols)}>
              {localStream && !isCameraOff && (
                <div className="relative overflow-hidden rounded-lg bg-black">
                  <VideoTile stream={localStream} mirrored={!isScreenSharing} />
                  <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs">You{isMuted && " · muted"}</span>
                </div>
              )}
              {remoteList.map(([id, stream]) => (
                <div key={id} className="relative overflow-hidden rounded-lg bg-black">
                  <VideoTile stream={stream} />
                  <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs">{participants[id]?.name ?? "Participant"}</span>
                </div>
              ))}
              {tiles === 0 && <p className="col-span-full flex items-center justify-center text-white/60">Waiting for others to join…</p>}
            </div>
          ) : (
            <div className="relative h-full">
              {main ? <VideoTile stream={main} fit="contain" mirrored={swapped && !isScreenSharing} /> : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
                  <Avatar src={avatar} name={title} size="xl" />
                  <p className="text-sm">Waiting for video…</p>
                </div>
              )}
              {pip && !isCameraOff && (
                <button type="button" onClick={() => setSwapped((v) => !v)} aria-label="Swap videos" className="absolute right-4 top-2 h-40 w-28 overflow-hidden rounded-lg border-2 border-white/30 bg-black sm:w-36">
                  <VideoTile stream={pip} mirrored={!swapped && !isScreenSharing} />
                </button>
              )}
            </div>
          )
        ) : isGroupCall && connected ? (
          <ul className="mx-auto flex h-full max-w-xl flex-wrap content-center items-start justify-center gap-6 p-6">
            {[...Object.values(participants), { id: "me", name: "You", avatarUrl: null }].map((p) => (
              <li key={p.id} className="flex w-24 flex-col items-center gap-2 text-center">
                <Avatar src={p.avatarUrl} name={p.name} size="lg" />
                <span className="w-full truncate text-sm">{p.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
            <div className="relative">
              {callState !== "connected" && <span className="absolute inset-0 animate-ring rounded-full bg-white/15" aria-hidden />}
              <Avatar src={avatar} name={title} size="xl" isGroup={isGroupCall} className="relative h-28 w-28 text-4xl" />
            </div>
            <div>
              <h2 className="font-display text-3xl">{title}</h2>
              <p className="mt-1.5 text-sm tabular-nums text-white/60">{status}</p>
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-20 flex shrink-0 justify-center px-4 pb-8 pt-4">
        {callState === "incoming" ? (
          <div className="flex items-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <ControlButton label="Decline call" tone="end" onClick={() => actions().declineCall()}><PhoneOff size={22} /></ControlButton>
              <span className="text-xs text-white/70">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button type="button" onClick={accept} aria-label="Accept call" className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1f8a4c] text-white hover:bg-[#17703d]">
                <Phone size={22} />
              </button>
              <span className="text-xs text-white/70">Accept</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-full bg-white/10 p-2">
            <ControlButton label={isMuted ? "Unmute microphone" : "Mute microphone"} active={isMuted} disabled={!connected} onClick={() => actions().toggleMute()}>
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </ControlButton>
            {hasVideo && (
              <ControlButton label={isCameraOff ? "Turn camera on" : "Turn camera off"} active={isCameraOff} disabled={!connected} onClick={() => actions().toggleCamera()}>
                {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
              </ControlButton>
            )}
            {canShare && (
              <ControlButton label={isScreenSharing ? "Stop sharing screen" : "Share screen"} active={isScreenSharing} disabled={!connected} onClick={() => void actions().toggleScreenShare()}>
                {isScreenSharing ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
              </ControlButton>
            )}
            <ControlButton label={callState === "outgoing" ? "Cancel call" : "End call"} tone="end" onClick={endOrCancel}>
              <PhoneOff size={21} />
            </ControlButton>
          </div>
        )}
      </footer>
    </div>
  );
}
