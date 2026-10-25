"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Pause, Play } from "lucide-react";
import { formatDuration } from "@lib/format";
import { cn } from "@lib/utils";

interface CustomAudioPlayerProps {
  src: string;
  onDownload?: () => void;
}

const RATES = [1, 1.5, 2] as const;

// Only one voice note should play at a time.
let activeAudio: HTMLAudioElement | null = null;

export function CustomAudioPlayer({ src, onDownload }: CustomAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [rateIndex, setRateIndex] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = src;
    audioRef.current = audio;

    const onMeta = () => {
      // Browser-recorded WebM voice notes report an infinite duration until the end is
      // reached. Seeking far past the end forces the real length to be calculated.
      if (audio.duration === Infinity) {
        const fixDuration = () => {
          audio.removeEventListener("timeupdate", fixDuration);
          audio.currentTime = 0;
          setDuration(audio.duration);
        };
        audio.addEventListener("timeupdate", fixDuration);
        audio.currentTime = 1e101;
      } else {
        setDuration(audio.duration);
      }
      setLoading(false);
    };
    const onTime = () => { if (audio.duration !== Infinity) setCurrent(audio.currentTime); };
    const onEnd = () => { setPlaying(false); setCurrent(0); audio.currentTime = 0; };

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("canplay", () => setLoading(false));
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", () => { setFailed(true); setLoading(false); });

    return () => {
      audio.pause();
      if (activeAudio === audio) activeAudio = null;
      audio.removeAttribute("src");
      audio.load();
    };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) return audio.pause();
    if (activeAudio && activeAudio !== audio) activeAudio.pause();
    activeAudio = audio;
    audio.playbackRate = RATES[rateIndex];
    audio.play().catch(() => setFailed(true));
  };

  const cycleRate = () => {
    const next = (rateIndex + 1) % RATES.length;
    setRateIndex(next);
    if (audioRef.current) audioRef.current.playbackRate = RATES[next];
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrent(t);
  };

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div className="flex w-64 max-w-full items-center gap-2.5">
      <button
        type="button"
        onClick={toggle}
        disabled={loading || failed}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-50"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={current}
          onChange={seek}
          disabled={loading || failed || duration === 0}
          aria-label="Seek"
          className="block h-1.5 w-full cursor-pointer appearance-none rounded-full disabled:cursor-default [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink"
          style={{ background: `linear-gradient(to right, var(--ink) ${pct}%, color-mix(in srgb, var(--ink) 20%, transparent) ${pct}%)` }}
        />
        <div className="mt-1 flex items-center justify-between text-xs tabular-nums text-muted">
          <span>{failed ? "Can't play" : formatDuration(playing || current > 0 ? current : duration)}</span>
          <button
            type="button"
            onClick={cycleRate}
            aria-label={`Playback speed ${RATES[rateIndex]}x`}
            className={cn("rounded px-1 font-medium hover:bg-ink/10", rateIndex > 0 && "text-ink")}
          >
            {RATES[rateIndex]}x
          </button>
        </div>
      </div>

      {onDownload && (
        <button type="button" onClick={onDownload} aria-label="Download voice message" className="shrink-0 rounded p-1.5 text-muted hover:text-ink">
          <Download size={15} />
        </button>
      )}
    </div>
  );
}
