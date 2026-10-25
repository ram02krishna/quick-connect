import Link from "next/link";
import { ArrowRight, CheckCheck, Mic, Phone, Video } from "lucide-react";
import { Wordmark } from "@components/Logo";
import { ThemeToggle } from "@components/ThemeToggle";

const capabilities = [
  ["Direct messages and groups", "One-to-one chats, or groups of up to 100 with an owner who manages members."],
  ["Voice and video calls", "Call anyone you chat with from the browser. Group calls connect everyone directly to each other."],
  ["Voice notes", "Hold to record, send, and play back with a seek bar."],
  ["Photos, video and files", "Images are compressed before upload. Open them full-screen or download with the original name."],
  ["Read receipts and typing", "See when a message was delivered and read, and who is typing in a group."],
  ["Search inside a conversation", "Jump between matches without losing your place."],
];

const stack = ["Next.js", "React", "Socket.IO", "WebRTC", "Express", "PostgreSQL", "Prisma", "Redis", "Cloudinary"];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Wordmark />
          <nav className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:text-ink">
              Sign in
            </Link>
            <Link href="/signup" className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
          <div>
            <p className="mb-5 text-sm font-medium uppercase tracking-[0.14em] text-accent">Chat · Voice · Video</p>
            <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl lg:text-[4.25rem]">
              Conversations that don&apos;t need an app store.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              QuickConnect is a messenger that runs in your browser. Message people, drop in a voice note, or start a
              call — on your laptop or your phone.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex h-12 items-center gap-2 rounded-md bg-accent px-6 font-medium text-accent-ink hover:bg-accent-strong">
                Create an account <ArrowRight size={17} />
              </Link>
              <Link href="/login" className="inline-flex h-12 items-center rounded-md border border-line bg-surface px-6 font-medium hover:bg-sunken">
                I already have one
              </Link>
            </div>
          </div>

          {/* A static specimen of the real interface. */}
          <figure aria-label="Example conversation" className="rounded-lg border border-line bg-surface">
            <figcaption className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d4ead9] text-xs font-semibold text-[#215a33]">PN</span>
                <span>
                  <span className="block text-sm font-semibold leading-tight">Priya Nair</span>
                  <span className="block text-xs text-ok">Online</span>
                </span>
              </span>
              <span className="flex gap-1 text-muted">
                <span className="flex h-8 w-8 items-center justify-center"><Phone size={16} /></span>
                <span className="flex h-8 w-8 items-center justify-center"><Video size={16} /></span>
              </span>
            </figcaption>

            <div className="chat-canvas space-y-2.5 px-4 py-5 text-[15px]">
              <p className="mx-auto w-fit rounded-full bg-sunken px-3 py-1 text-xs text-muted">Today</p>
              <div className="max-w-[78%] rounded-lg rounded-tl-sm border border-line bg-bubble-in px-3.5 py-2">
                Did the designs go out to the client?
                <span className="mt-0.5 block text-right text-[11px] text-faint">10:42</span>
              </div>
              <div className="ml-auto max-w-[78%] rounded-lg rounded-tr-sm bg-bubble-out px-3.5 py-2">
                Yes, just now. They&apos;re reading through them.
                <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted">
                  10:44 <CheckCheck size={14} className="text-accent" />
                </span>
              </div>
              <div className="flex max-w-[78%] items-center gap-3 rounded-lg rounded-tl-sm border border-line bg-bubble-in px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper"><Mic size={14} /></span>
                <span className="flex h-5 flex-1 items-center gap-[3px]" aria-hidden>
                  {[5, 11, 7, 16, 10, 14, 6, 17, 9, 12, 5, 13, 8, 15, 7].map((h, i) => (
                    <span key={i} className="w-[3px] rounded-full bg-faint" style={{ height: h }} />
                  ))}
                </span>
                <span className="text-xs tabular-nums text-muted">0:18</span>
              </div>
            </div>
          </figure>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
            <h2 className="font-display text-3xl leading-tight sm:text-4xl">What you can do with it</h2>
            <dl className="divide-y divide-line border-y border-line">
              {capabilities.map(([term, detail]) => (
                <div key={term} className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6">
                  <dt className="font-medium">{term}</dt>
                  <dd className="text-muted">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <h2 className="font-display text-3xl leading-tight sm:text-4xl">About your data</h2>
            <div className="max-w-2xl space-y-4 leading-relaxed text-muted">
              <p>
                Message text and email addresses are encrypted before they reach the database, and passwords are
                hashed with Argon2. Calls are sent directly between browsers.
              </p>
              <p>
                To be precise: this is encryption at rest, not end-to-end encryption — the server can read messages in
                order to deliver them. If you self-host QuickConnect, that server is yours.
              </p>
              <p className="pt-2 text-sm">
                Built with <span className="text-ink">{stack.join(", ")}</span>.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:px-8">
          <Wordmark size={20} className="text-ink [&>span]:text-base" />
          <p>© {new Date().getFullYear()} QuickConnect</p>
        </div>
      </footer>
    </div>
  );
}
