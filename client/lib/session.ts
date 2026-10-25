import { useAuthStore } from "@hooks/useAuthStore";
import { useChatStore } from "@hooks/useChatStore";
import { useSocketStore } from "@hooks/useSocketStore";
import { useCallStore } from "@hooks/useCallStore";

/** Clears everything tied to the signed-in user so the next account starts clean. */
export function clearSession() {
  useCallStore.getState().resetCallStore();
  useSocketStore.getState().disconnectSocket();
  useChatStore.getState().clearStore();
  useAuthStore.getState().logout();
}
