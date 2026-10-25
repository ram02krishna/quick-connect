"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { cn } from "../../lib/utils";
import { initialsOf } from "../../lib/format";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Shows a presence dot. */
  showStatus?: boolean;
  isOnline?: boolean;
  /** Group chats get a generic icon instead of initials when they have no picture. */
  isGroup?: boolean;
}

const sizeClasses = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-24 w-24 text-3xl",
} as const;

const iconSize = { xs: 12, sm: 15, md: 18, lg: 24, xl: 40 } as const;

// Muted, warm tones that sit well on the paper background in both themes.
const tints = [
  ["#e7d3c4", "#6b3a1f"], ["#d3dfc7", "#34522a"], ["#d0dbe3", "#2c4a63"],
  ["#e6d6e0", "#5e2f4d"], ["#ecdfb8", "#6b5413"], ["#d6d3e6", "#403a73"],
];

function tintFor(name?: string | null) {
  let hash = 0;
  for (const ch of name ?? "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return tints[hash % tints.length];
}

export function Avatar({ src, name, size = "md", className, showStatus, isOnline, isGroup }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);

  const [bg, fg] = tintFor(name);
  const showImage = Boolean(src) && !failed;

  return (
    <div className="relative inline-block shrink-0">
      <div
        className={cn("flex items-center justify-center overflow-hidden rounded-full font-semibold select-none", sizeClasses[size], className)}
        style={showImage ? undefined : { backgroundColor: bg, color: fg }}
        aria-hidden={!showImage}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src!} alt={name ?? ""} className="h-full w-full object-cover" onError={() => setFailed(true)} />
        ) : isGroup ? (
          <Users size={iconSize[size]} strokeWidth={1.75} />
        ) : (
          <span>{initialsOf(name)}</span>
        )}
      </div>
      {showStatus && (
        <span
          className={cn(
            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface",
            isOnline ? "bg-ok" : "bg-faint"
          )}
          role="img"
          aria-label={isOnline ? "Online" : "Offline"}
        />
      )}
    </div>
  );
}
