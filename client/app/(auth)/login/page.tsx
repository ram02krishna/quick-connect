"use client";

import * as React from "react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { AuthCard, FormAlert } from "@components/auth/AuthCard";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";
import api, { apiErrorMessage } from "@lib/api";
import { useAuthStore } from "@hooks/useAuthStore";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const setAuth = useAuthStore((state) => state.setAuth);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/login", { identifier: identifier.trim(), password });
      const { user, token } = res.data.data;
      setAuth(user, token); // the chat layout opens the socket once it sees the token

      // Only follow same-site relative redirects (blocks "//evil.com" style open redirects).
      const safe = redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//");
      router.push(safe ? redirectParam : "/chats");
    } catch (err: any) {
      const data = err.response?.data?.data;
      if (err.response?.status === 403 && data?.requiresVerification) {
        // Correct password but the email was never confirmed — continue to verification.
        router.push(`/verify-email?userId=${data.userId}&email=${encodeURIComponent(data.email ?? "")}`);
        return;
      }
      setError(apiErrorMessage(err, "Couldn't sign you in. Please try again."));
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to pick up your conversations."
      footer={
        <p>
          New here?{" "}
          <Link href="/signup" className="font-medium text-ink underline underline-offset-4 hover:text-accent">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <FormAlert tone="error">{error}</FormAlert>}

        <Input
          label="Username or email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          required
          disabled={loading}
        />

        <div>
          <Input
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={loading}
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
          <Link href="/forgot-password" className="mt-2 inline-block text-sm text-muted underline underline-offset-4 hover:text-accent">
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading || !identifier || !password}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
