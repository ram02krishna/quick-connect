import { cn } from "@lib/utils";

export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <circle cx="15" cy="15" r="7.6" stroke="currentColor" strokeWidth="3.2" />
      <path d="M20.2 20.2l5 5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} className="text-accent" />
      <span className="font-display text-xl leading-none tracking-tight">QuickConnect</span>
    </span>
  );
}
