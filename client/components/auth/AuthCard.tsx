"use client";

import * as React from "react";
import Link from "next/link";
import { Wordmark } from "@components/Logo";
import { ThemeToggle } from "@components/ThemeToggle";

interface AuthCardProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
}

/** Two-column on desktop (brand panel + form), single column on mobile. */
export function AuthCard({ children, title, subtitle, footer }: AuthCardProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[5fr_6fr]">
      <aside className="relative hidden flex-col justify-between bg-[#0e1621] p-12 text-[#e5ebf0] lg:flex dark:border-r dark:border-line dark:bg-[#070a0d]">
        <Link href="/" className="inline-flex w-fit items-center gap-2">
          <Wordmark className="[&_svg]:text-accent" />
        </Link>

        <div className="max-w-sm">
          <p className="font-display text-4xl leading-[1.15]">
            Say it now,<br />or say it face to face.
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-[#e5ebf0]/65">
            Direct messages, group chats, voice notes and calls — in a single tab, with nothing to install.
          </p>
        </div>

        <p className="text-sm text-[#e5ebf0]/45">Messages are encrypted before they&apos;re stored.</p>
      </aside>

      <main className="relative flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Link href="/" className="lg:hidden"><Wordmark /></Link>
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-3xl leading-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function FormAlert({ tone, children }: { tone: "error" | "success" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "border-danger/30 bg-danger-soft text-danger",
    success: "border-ok/30 bg-ok/10 text-ok",
    info: "border-line bg-sunken text-ink",
  } as const;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mb-5 rounded-md border px-3.5 py-2.5 text-sm ${styles[tone]}`}>
      {children}
    </div>
  );
}
