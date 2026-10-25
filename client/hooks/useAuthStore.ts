import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserProfile {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  bio?: string | null;
  createdAt?: string;
}

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  setAuth: (user: UserProfile, token: string) => void;
  setToken: (token: string) => void;
  updateUser: (fields: Partial<UserProfile>) => void;
  logout: () => void;
}

function syncAuthCookie(token: string | null) {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `quickconnect_token=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  } else {
    document.cookie = "quickconnect_token=; path=/; max-age=0; SameSite=Lax";
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        syncAuthCookie(token);
        set({ user, token });
      },
      setToken: (token) => {
        syncAuthCookie(token);
        set({ token });
      },
      updateUser: (fields) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...fields } : null,
        })),
      logout: () => {
        syncAuthCookie(null);
        set({ user: null, token: null });
      },
    }),
    {
      name: "quickconnect-auth",
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          syncAuthCookie(state.token);
        }
      },
    }
  )
);
