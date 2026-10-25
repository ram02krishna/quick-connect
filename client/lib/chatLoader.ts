import api from "./api";
import { useChatStore } from "@hooks/useChatStore";

export const PAGE_SIZE = 30;

/** Fetches the newest page of messages for a chat and stores it. */
export async function loadLatestMessages(chatId: string) {
  const res = await api.get(`/messages/${chatId}`, { params: { limit: PAGE_SIZE } });
  const messages = res.data.data.messages;
  const store = useChatStore.getState();
  // Keep messages that are still being sent (or failed) — the server doesn't know about them yet.
  const pending = (store.messages[chatId] ?? []).filter((m) => m.id.startsWith("temp-"));
  store.setMessages(chatId, [...messages, ...pending]);
  store.setHasMoreMessages(chatId, messages.length >= PAGE_SIZE);
  return messages;
}

/** Warm the cache when the user hovers/clicks a chat so it opens instantly. */
export function prefetchMessages(chatId: string) {
  const cached = useChatStore.getState().messages[chatId];
  if (cached && cached.length > 0) return;
  loadLatestMessages(chatId).catch(() => undefined);
}

/** Re-reads a chat's details (members, title, unread count) after it changed elsewhere. */
export async function refreshChat(chatId: string) {
  const res = await api.get(`/chats/${chatId}`);
  const chat = res.data.data.chat;
  useChatStore.getState().upsertChat(chat);
  return chat;
}
