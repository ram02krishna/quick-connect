"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, Camera, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { useAuthStore } from "@hooks/useAuthStore";
import { Avatar } from "@components/ui/Avatar";
import { Input } from "@components/ui/Input";
import { Button, IconButton } from "@components/ui/Button";
import api, { apiErrorMessage } from "@lib/api";
import { compressImage, uploadToCloudinary } from "@lib/media";
import { cn } from "@lib/utils";

const BIO_MAX = 120;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-b border-line py-8 md:grid-cols-[14rem_1fr] md:gap-10">
      <div>
        <h2 className="font-display text-xl">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div>
        <p className="font-medium">{label}</p>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-line")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

function usePreference(key: string, fallback: boolean) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored !== null) setValue(stored !== "false");
  }, [key]);
  const update = (next: boolean) => {
    setValue(next);
    localStorage.setItem(key, String(next));
  };
  return [value, update] as const;
}

export default function ProfilePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [sound, setSound] = usePreference("settings-notifications-sound", true);
  const [desktop, setDesktop] = usePreference("settings-notifications-enabled", true);
  const [preview, setPreview] = usePreference("settings-notifications-preview", true);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    let active = true;
    api.get("/users/me").then((res) => {
      if (!active) return;
      const profile = res.data.data.user;
      updateUser(profile);
      setName(profile.name ?? "");
      setUsername(profile.username ?? "");
      setBio(profile.bio ?? "");
    }).catch(() => undefined);
    return () => { active = false; };
  }, [updateUser]);

  const dirty =
    name.trim() !== (user?.name ?? "") || username !== (user?.username ?? "") || bio.trim() !== (user?.bio ?? "");

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.patch("/users/me", { name: name.trim(), username, bio: bio.trim() || null });
      const updated = res.data.data.user;
      updateUser(updated);
      setName(updated.name);
      setUsername(updated.username);
      setBio(updated.bio ?? "");
      toast.success("Profile saved");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save your profile."));
    } finally {
      setSaving(false);
    }
  };

  const changeAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Please choose an image.");
    if (file.size > 10 * 1024 * 1024) return void toast.error("That image is over 10 MB.");

    setUploading(true);
    try {
      const small = await compressImage(file, 0.5, 1024);
      const { url } = await uploadToCloudinary(small, "chat-app/avatars");
      await api.patch("/media/avatar", { avatarUrl: url });
      updateUser({ avatarUrl: url });
      toast.success("Photo updated");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't upload that photo."));
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    setUploading(true);
    try {
      await api.patch("/users/me", { avatarUrl: null });
      updateUser({ avatarUrl: null });
      toast.success("Photo removed");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't remove your photo."));
    } finally {
      setUploading(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) return void toast.error("Use at least 8 characters for the new password.");
    if (newPassword !== confirmPassword) return void toast.error("The new passwords don't match.");
    if (newPassword === currentPassword) return void toast.error("Choose a password you haven't used here before.");

    setChangingPassword(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      toast.success("Password changed");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change your password."));
    } finally {
      setChangingPassword(false);
    }
  };

  const toggleDesktop = async (on: boolean) => {
    if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return void toast.info("Notifications are blocked in your browser settings.");
    }
    setDesktop(on);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-paper">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <IconButton label="Back to conversations" onClick={() => router.push("/chats")}><ArrowLeft size={19} /></IconButton>
        <h1 className="font-semibold">Settings</h1>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 pb-16 sm:px-8">
        <Section title="Profile" description="How you appear to people you chat with.">
          <div className="mb-6 flex items-center gap-4">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Change profile photo" className="group relative rounded-full">
              <Avatar src={user?.avatarUrl} name={user?.name} size="xl" />
              <span className={cn("absolute inset-0 flex items-center justify-center rounded-full bg-ink/55 text-paper transition-opacity", uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>
                {uploading ? <Loader2 className="animate-spin" /> : <Camera size={22} />}
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={changeAvatar} />
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 font-semibold">
                {user?.name}
                {user?.emailVerified && <BadgeCheck size={17} className="text-accent" aria-label="Email verified" />}
              </p>
              <p className="text-sm text-muted">@{user?.username}</p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>Change photo</Button>
                {user?.avatarUrl && <Button size="sm" variant="ghost" onClick={removeAvatar} disabled={uploading}>Remove</Button>}
              </div>
            </div>
          </div>

          <form onSubmit={saveProfile} className="space-y-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required disabled={saving} />
            <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} hint="Letters, numbers and underscores." required disabled={saving} autoCapitalize="none" />
            <div>
              <label htmlFor="bio" className="mb-1.5 block text-sm font-medium">Bio</label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                rows={3}
                disabled={saving}
                className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-base placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                placeholder="A line about you"
              />
              <p className="mt-1 text-right text-xs text-muted">{bio.length}/{BIO_MAX}</p>
            </div>
            <Input label="Email" value={user?.email ?? ""} readOnly disabled hint={user?.emailVerified ? "Verified" : "Not verified"} />
            <Button type="submit" variant="primary" disabled={saving || !dirty || !name.trim() || username.length < 3}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </Section>

        <Section title="Appearance">
          <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-md border border-line bg-surface p-1">
            {(["system", "light", "dark"] as const).map((option) => (
              <button
                key={option}
                role="radio"
                aria-checked={theme === option}
                onClick={() => setTheme(option)}
                className={cn("rounded px-4 py-1.5 text-sm font-medium capitalize", theme === option ? "bg-ink text-paper" : "text-muted hover:text-ink")}
              >
                {option}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Notifications" description="Applies to this browser.">
          <div className="divide-y divide-line">
            <Switch checked={sound} onChange={setSound} label="Message sounds" description="A short chime for incoming and sent messages." />
            <Switch
              checked={desktop && permission !== "denied"}
              onChange={(v) => void toggleDesktop(v)}
              label="Desktop notifications"
              description={
                permission === "unsupported" ? "Your browser doesn't support notifications."
                : permission === "denied" ? "Blocked — allow notifications for this site in your browser settings."
                : "Alerts when the app is in the background."
              }
            />
            <Switch checked={preview} onChange={setPreview} label="Show message previews" description="Include the message text in notifications." />
          </div>
        </Section>

        <Section title="Password">
          <form onSubmit={changePassword} className="space-y-4">
            {([
              ["Current password", currentPassword, setCurrentPassword, "current-password"],
              ["New password", newPassword, setNewPassword, "new-password"],
              ["Confirm new password", confirmPassword, setConfirmPassword, "new-password"],
            ] as const).map(([label, value, set, autoComplete], i) => (
              <Input
                key={label}
                label={label}
                type={showPasswords ? "text" : "password"}
                value={value}
                onChange={(e) => set(e.target.value)}
                autoComplete={autoComplete}
                disabled={changingPassword}
                required
                trailing={i === 0 ? (
                  <button type="button" onClick={() => setShowPasswords((v) => !v)} aria-label={showPasswords ? "Hide passwords" : "Show passwords"} className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-ink">
                    {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                ) : undefined}
              />
            ))}
            <Button type="submit" variant="primary" disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}>
              {changingPassword ? "Updating…" : "Update password"}
            </Button>
          </form>
        </Section>
      </div>
    </div>
  );
}
