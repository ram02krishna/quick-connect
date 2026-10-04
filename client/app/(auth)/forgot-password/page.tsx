"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@components/auth/AuthCard";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";
import { Eye, EyeOff } from "lucide-react";
import api from "@lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState("");
  const [userId, setUserId] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");

  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await api.post("/auth/forgot-password", {
        identifier: identifier.trim(),
        username: identifier.trim(),
      });
      const { userId: uid, email } = res.data.data;
      
      setUserId(uid);
      setMaskedEmail(email);
      setSuccess(`A 6-digit reset code has been sent to your registered email: ${email}`);
      
      setTimeout(() => {
        setSuccess("");
        setStep(2);
      }, 2500);
    } catch (err: any) {
      console.warn("Forgot password lookup failed:", err.message || err);
      setError(err.response?.data?.message || "Failed to locate account. Check the username or email.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      await api.post("/auth/reset-password", {
        userId,
        otp: otp.trim(),
        newPassword,
      });

      setSuccess("Password updated successfully! Redirecting you to login...");
      setTimeout(() => {
        router.push("/login");
      }, 2500);
    } catch (err: any) {
      console.warn("Password reset failed:", err.message || err);
      setError(err.response?.data?.message || "Invalid or expired reset code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title={step === 1 ? "Reset Password" : "New Password"}
      subtitle={
        step === 1
          ? "Recover your QuickConnect account credentials"
          : `Set a new secure password`
      }
    >
      {error && (
        <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/10 text-sm text-red-400 font-medium mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl border border-green-500/20 bg-green-500/10 text-sm text-green-400 font-medium mb-4">
          {success}
        </div>
      )}

      {step === 1 ? (
        <form onSubmit={handleRequestCode} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider pl-1">
              Username or Email
            </label>
            <Input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Enter your username or email"
              required
              disabled={loading}
            />
          </div>

          <Button type="submit" variant="shimmer" className="w-full mt-2 py-3" disabled={loading || !!success}>
            {loading ? "Sending OTP..." : "Send Reset Code"}
          </Button>

          <div className="text-center text-sm text-zinc-500 mt-6">
            <Link href="/login" className="hover:text-zinc-300 transition-colors">
              Back to Login
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-2 text-center mb-2">
            <p className="text-sm text-zinc-400">
              Enter the 6-digit confirmation code sent to
              <br />
              <strong className="text-zinc-200">{maskedEmail}</strong>
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider pl-1">
              Verification Code
            </label>
            <Input
              type="text"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="text-center text-2xl tracking-[0.5em] font-bold"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider pl-1">
              New Password
            </label>
            <div className="relative flex items-center">
              <Input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                disabled={loading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-zinc-500 hover:text-zinc-300 transition-colors p-1 cursor-pointer"
                disabled={loading}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Button type="submit" variant="shimmer" className="w-full mt-2 py-3" disabled={loading || !!success}>
            {loading ? "Resetting password..." : "Update Password"}
          </Button>

          <div className="flex flex-col items-center gap-4 mt-6 text-sm text-zinc-500">
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setOtp("");
                setNewPassword("");
                setError("");
                setSuccess("");
              }}
              disabled={loading}
              className="text-brand-primary hover:text-brand-hover font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              Request a new code
            </button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
