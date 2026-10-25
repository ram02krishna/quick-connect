"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { AuthCard, FormAlert } from "@components/auth/AuthCard";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";
import api, { apiErrorMessage } from "@lib/api";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ username: false, password: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const usernameError =
    touched.username && username && !USERNAME_RE.test(username)
      ? "3–30 characters: letters, numbers and underscores only."
      : undefined;
  const passwordError =
    touched.password && password && password.length < 8 ? "Use at least 8 characters." : undefined;

  const canSubmit =
    name.trim().length >= 2 && USERNAME_RE.test(username) && /\S+@\S+\.\S+/.test(email) && password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/register", { name: name.trim(), username, email: email.trim(), password });
      const { user } = res.data.data;
      router.push(`/verify-email?userId=${user.id}&email=${encodeURIComponent(user.email)}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't create your account. Please check the details and try again."));
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="It takes a minute. We'll email you a code to confirm your address."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-ink underline underline-offset-4 hover:text-accent">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <FormAlert tone="error">{error}</FormAlert>}

        <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus required disabled={loading} />

        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, username: true }))}
          error={usernameError}
          hint={usernameError ? undefined : "This is how people find you."}
          autoComplete="username"
          autoCapitalize="none"
          required
          disabled={loading}
        />

        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required disabled={loading} />

        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={passwordError}
          autoComplete="new-password"
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

        <Button type="submit" size="lg" className="w-full" disabled={loading || !canSubmit}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}
