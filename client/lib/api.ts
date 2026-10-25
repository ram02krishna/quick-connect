import axios from "axios";
import { useAuthStore } from "../hooks/useAuthStore";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const PUBLIC_PATHS = ["/login", "/signup", "/verify-email", "/forgot-password"];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const isAuthCall = String(error.config?.url ?? "").startsWith("/auth/");

    // A 401 from a sign-in attempt just means wrong credentials — it is not an expired session.
    if (error.response?.status === 401 && !isAuthCall && typeof window !== "undefined") {
      const { clearSession } = await import("./session");
      clearSession();

      const path = window.location.pathname;
      if (!PUBLIC_PATHS.some((p) => path.startsWith(p))) {
        window.location.href = `/login?redirect=${encodeURIComponent(path)}`;
      }
    }
    return Promise.reject(error);
  }
);

/** Pulls the server's message out of an axios error, with a sensible fallback. */
export function apiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  const err = error as { response?: { data?: { message?: string } }; code?: string };
  if (err?.code === "ERR_NETWORK") return "Can't reach the server. Check your connection.";
  return err?.response?.data?.message || fallback;
}

export default api;
export { API_BASE_URL };
