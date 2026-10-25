"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { AuthCard, FormAlert } from "@components/auth/AuthCard";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";
import api, { apiErrorMessage } from "@lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<"request" | "reset">("request");
  const [identifier, setIdentifier] = useState("");
  const [userId, setUserId] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(redirectTimer.current), []);

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await api.post("/auth/forgot-password", { identifier: identifier.trim() });
      setUserId(res.data.data.userId);
      setStep("reset");
      setNotice("If that account exists, we've emailed a 6-digit code to its address.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't send a reset code. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { userId, otp, newPassword });
      setDone(true);
      redirectTimer.current = setTimeout(() => router.push("/login"), 1800);
    } catch (err) {
      setError(apiErrorMessage(err, "That code didn't work. Please try again."));
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title={step === "request" ? "Reset your password" : "Choose a new password"}
      subtitle={
        step === "request"
          ? "Enter your username or email and we'll send you a code."
          : "Enter the code from your email and a new password."
      }
      footer={<Link href="/login" className="underline underline-offset-4 hover:text-accent">Back to sign in</Link>}
    >
      {error && <FormAlert tone="error">{error}</FormAlert>}
      {notice && <FormAlert tone="info">{notice}</FormAlert>}
      {done && <FormAlert tone="success">Password updated. Taking you to sign in…</FormAlert>}

      {step === "request" ? (
        <form onSubmit={requestCode} className="space-y-5">
          <Input
            label="Username or email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoCapitalize="none"
            autoFocus
            required
            disabled={loading}
          />
          <Button type="submit" size="lg" className="w-full" disabled={loading || !identifier.trim()}>
            {loading ? "Sending…" : "Send code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={resetPassword} className="space-y-5">
          <Input
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
            autoFocus
            disabled={loading || done}
          />
          <Input
            label="New password"
            type={showPassword ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="At least 8 characters."
            autoComplete="new-password"
            disabled={loading || done}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-ink"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
          <Button type="submit" size="lg" className="w-full" disabled={loading || done || otp.length !== 6 || newPassword.length < 8}>
            {loading ? "Updating…" : "Update password"}
          </Button>
          <button
            type="button"
            onClick={() => { setStep("request"); setOtp(""); setNewPassword(""); setError(""); setNotice(""); }}
            className="text-sm text-muted underline underline-offset-4 hover:text-accent"
          >
            Start over
          </button>
        </form>
      )}
    </AuthCard>
  );
}
