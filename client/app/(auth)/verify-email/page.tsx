"use client";

import * as React from "react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthCard, FormAlert } from "@components/auth/AuthCard";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";
import api, { apiErrorMessage } from "@lib/api";

const RESEND_SECONDS = 60;

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const userId = params.get("userId");
  const email = params.get("email") || "your email address";

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const redirectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => () => clearTimeout(redirectTimer.current), []);

  const verify = async (code: string) => {
    if (!userId || loading) return;
    setError("");
    setNotice("");
    setLoading(true);
    try {
      await api.post("/auth/verify-email", { userId, otp: code });
      setVerified(true);
      redirectTimer.current = setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(apiErrorMessage(err, "That code didn't work. Please try again."));
      setOtp("");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!userId) return;
    setError("");
    setNotice("");
    setResending(true);
    try {
      await api.post("/auth/resend-verification", { userId });
      setNotice("A new code is on its way.");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't send a new code."));
    } finally {
      setResending(false);
    }
  };

  if (!userId) {
    return (
      <AuthCard title="Link incomplete" subtitle="This verification link is missing information.">
        <Link href="/signup" className="text-sm font-medium underline underline-offset-4">Back to sign up</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Check your email"
      subtitle={`We sent a 6-digit code to ${email}. It's valid for 15 minutes.`}
      footer={<Link href="/login" className="underline underline-offset-4 hover:text-accent">Back to sign in</Link>}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); void verify(otp); }}
        className="space-y-5"
      >
        {error && <FormAlert tone="error">{error}</FormAlert>}
        {notice && <FormAlert tone="info">{notice}</FormAlert>}
        {verified && <FormAlert tone="success">Email confirmed. Taking you to sign in…</FormAlert>}

        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otp}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
            setOtp(digits);
            if (digits.length === 6) void verify(digits); // submit as soon as the last digit lands
          }}
          placeholder="000000"
          className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
          autoFocus
          disabled={loading || verified}
        />

        <Button type="submit" size="lg" className="w-full" disabled={loading || verified || otp.length !== 6}>
          {loading ? "Checking…" : "Confirm email"}
        </Button>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending || cooldown > 0 || verified}
          className="text-sm text-muted underline underline-offset-4 hover:text-accent disabled:no-underline disabled:opacity-60"
        >
          {resending ? "Sending…" : cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
