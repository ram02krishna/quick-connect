import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface User {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  bio?: string | null;
}

export interface ChatMember {
  id: string;
  chatId: string;
  userId: string;
  joinedAt: string;
  user: User;
}

export interface Attachment {
  id: string;
  messageId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  mimeType: string;
  thumbUrl: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  type: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | "EMOJI" | "SYSTEM";
  content: string | null;
  createdAt: string;
  sender: User;
  receipts: Array<{ userId: string; deliveredAt: string | null; readAt: string | null }>;
  attachments?: Attachment[];
  isSending?: boolean;
  hasFailed?: boolean;
  deletedForEveryoneAt?: string | null;
}

export interface Chat {
  id: string;
  type: "DIRECT" | "GROUP";
  title: string | null;
  photoUrl: string | null;
  createdBy: string;
  lastMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  members: ChatMember[];
  lastMessage?: {
    id: string;
    type: string;
    content: string | null;
    createdAt: string;
    deletedForEveryoneAt?: string | null;
    sender: { id: string; name: string };
    receipts?: Array<{ userId: string; deliveredAt: string | null; readAt: string | null }>;
  } | null;
  /** Messages from other people this user hasn't read yet. */
  unreadCount?: number;
}

interface ChatState {
  chats: Chat[];
  messages: Record<string, Message[]>;
  selectedChatId: string | null;
  typingStatuses: Record<string, string[]>;
  onlineStatuses: Record<string, string>;
  hasMoreMessages: Record<string, boolean>;

  setChats: (chats: Chat[]) => void;
  upsertChat: (chat: Chat) => void;
  updateChat: (chatId: string, fields: Partial<Chat>) => void;
  deleteChat: (chatId: string) => void;
  setUnread: (chatId: string, count: number) => void;
  incrementUnread: (chatId: string) => void;

  setMessages: (chatId: string, messages: Message[]) => void;
  prependMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  resolveOptimisticMessage: (chatId: string, tempId: string, realMessage: Message) => void;
  failOptimisticMessage: (chatId: string, tempId: string) => void;
  retryOptimisticMessage: (chatId: string, tempId: string) => void;
  updateReceipt: (chatId: string, messageId: string, receipt: { userId: string; deliveredAt: string | null; readAt: string | null }) => void;
  removeMessageForMe: (chatId: string, messageId: string) => void;
  markMessageDeletedForEveryone: (chatId: string, messageId: string) => void;

  setSelectedChatId: (chatId: string | null) => void;
  setUserTyping: (chatId: string, userId: string, isTyping: boolean) => void;
  setOnlineStatus: (userId: string, status: string) => void;
  setOnlineStatuses: (statuses: Record<string, any>) => void;
  setHasMoreMessages: (chatId: string, hasMore: boolean) => void;

  isChatsLoading: boolean;
  setIsChatsLoading: (val: boolean) => void;
  clearStore: () => void;
}

const typingTimeouts: Record<string, NodeJS.Timeout> = {};

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      chats: [],
      messages: {},
      selectedChatId: null,
      typingStatuses: {},
      onlineStatuses: {},
      hasMoreMessages: {},
      isChatsLoading: true,

      setIsChatsLoading: (val) => set({ isChatsLoading: val }),
      setChats: (chats) => set({ chats, isChatsLoading: false }),
      clearStore: () =>
        set({
          chats: [],
          messages: {},
          selectedChatId: null,
          typingStatuses: {},
          onlineStatuses: {},
          hasMoreMessages: {},
          isChatsLoading: true,
        }),

      upsertChat: (chat) =>
        set((state) => {
          const exists = state.chats.some((c) => c.id === chat.id);
          if (exists) {
            return {
              chats: state.chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)),
            };
          }
          return { chats: [chat, ...state.chats] };
        }),

      updateChat: (chatId, fields) =>
        set((state) => ({
          chats: state.chats.map((c) => (c.id === chatId ? { ...c, ...fields } : c)),
        })),

      setUnread: (chatId, count) =>
        set((state) => {
          const chat = state.chats.find((c) => c.id === chatId);
          if (!chat || (chat.unreadCount ?? 0) === count) return {};
          return { chats: state.chats.map((c) => (c.id === chatId ? { ...c, unreadCount: count } : c)) };
        }),

      incrementUnread: (chatId) =>
        set((state) => ({
          chats: state.chats.map((c) => (c.id === chatId ? { ...c, unreadCount: (c.unreadCount ?? 0) + 1 } : c)),
        })),

      removeMessageForMe: (chatId, messageId) =>
        set((state) => {
          const thread = state.messages[chatId] || [];
          const updatedThread = thread.filter((message) => message.id !== messageId);
          const previous = updatedThread[updatedThread.length - 1];
          return {
            messages: { ...state.messages, [chatId]: updatedThread },
            // If the removed message was the chat-list preview, fall back to the one before it.
            chats: state.chats.map((chat) =>
              chat.id === chatId && chat.lastMessageId === messageId
                ? {
                    ...chat,
                    lastMessageId: previous?.id ?? null,
                    lastMessage: previous
                      ? {
                          id: previous.id,
                          type: previous.type,
                          content: previous.content,
                          createdAt: previous.createdAt,
                          sender: { id: previous.senderId, name: previous.sender?.name ?? "" },
                          receipts: previous.receipts,
                        }
                      : null,
                  }
                : chat
            ),
          };
        }),

      markMessageDeletedForEveryone: (chatId, messageId) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [chatId]: (state.messages[chatId] || []).map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    content: "This message was deleted",
                    type: "TEXT",
                    attachments: [],
                    deletedForEveryoneAt: new Date().toISOString(),
                  }
                : message
            ),
          },
          chats: state.chats.map((chat) =>
            chat.id === chatId && chat.lastMessageId === messageId
              ? {
                  ...chat,
                  lastMessage: chat.lastMessage
                    ? { ...chat.lastMessage, content: "This message was deleted", type: "TEXT" }
                    : chat.lastMessage,
                }
              : chat
          ),
        })),

      setMessages: (chatId, messages) =>
        set((state) => ({
          messages: { ...state.messages, [chatId]: messages },
        })),

      prependMessages: (chatId, messages) =>
        set((state) => {
          const thread = state.messages[chatId] || [];
          const uniqueNew = messages.filter((nm) => !thread.some((m) => m.id === nm.id));
          return {
            messages: { ...state.messages, [chatId]: [...uniqueNew, ...thread] },
          };
        }),

      addMessage: (chatId, message) =>
        set((state) => {
          const thread = state.messages[chatId] || [];

          // skip if already in thread
          if (thread.some((m) => m.id === message.id)) return {};

          // replace matching optimistic message if found
          const tempIndex = message.id.startsWith("temp-")
            ? -1
            : thread.findIndex(
            (m) =>
              m.id.startsWith("temp-") &&
              m.senderId === message.senderId &&
              m.content === message.content &&
              m.type === message.type
            );

          let updatedThread;
          if (tempIndex !== -1) {
            updatedThread = [...thread];
            updatedThread[tempIndex] = message;
          } else {
            updatedThread = [...thread, message];
          }

          // Move the updated chat to the front in O(n) — avoids full sort on every message
          const chatIndex = state.chats.findIndex((c) => c.id === chatId);
          let updatedChats: Chat[];
          if (chatIndex === -1) {
            updatedChats = state.chats;
          } else {
            const updatedChat = {
              ...state.chats[chatIndex],
              lastMessageId: message.id,
              updatedAt: message.createdAt,
              lastMessage: {
                id: message.id,
                type: message.type,
                content: message.content,
                createdAt: message.createdAt,
                sender: { id: message.senderId, name: message.sender?.name ?? "" },
                receipts: message.receipts ?? [],
              },
            };
            // Splice updated chat to front without sorting the whole array
            updatedChats = [updatedChat, ...state.chats.filter((c) => c.id !== chatId)];
          }

          return {
            messages: { ...state.messages, [chatId]: updatedThread },
            chats: updatedChats,
          };
        }),

      resolveOptimisticMessage: (chatId, tempId, realMessage) =>
        set((state) => {
          const thread = state.messages[chatId] || [];
          const updatedThread = thread.map((m) => (m.id === tempId ? realMessage : m));

          if (!thread.some((m) => m.id === tempId) && !thread.some((m) => m.id === realMessage.id)) {
            updatedThread.push(realMessage);
          }

          const updatedChats = state.chats.map((c) => {
            if (c.id === chatId && (c.lastMessageId === tempId || c.lastMessage?.id === tempId)) {
              return {
                ...c,
                lastMessageId: realMessage.id,
                updatedAt: realMessage.createdAt,
                lastMessage: {
                  id: realMessage.id,
                  type: realMessage.type,
                  content: realMessage.content,
                  createdAt: realMessage.createdAt,
                  sender: { id: realMessage.senderId, name: realMessage.sender.name },
                },
              };
            }
            return c;
          });

          return {
            messages: { ...state.messages, [chatId]: updatedThread },
            chats: updatedChats,
          };
        }),

      failOptimisticMessage: (chatId, tempId) =>
        set((state) => {
          const thread = state.messages[chatId] || [];
          return {
            messages: {
              ...state.messages,
              [chatId]: thread.map((m) =>
                m.id === tempId ? { ...m, isSending: false, hasFailed: true } : m
              ),
            },
          };
        }),

      retryOptimisticMessage: (chatId, tempId) =>
        set((state) => {
          const thread = state.messages[chatId] || [];
          return {
            messages: {
              ...state.messages,
              [chatId]: thread.map((m) =>
                m.id === tempId ? { ...m, isSending: true, hasFailed: false } : m
              ),
            },
          };
        }),

      deleteChat: (chatId) =>
        set((state) => {
          const isSelected = state.selectedChatId === chatId;
          return {
            chats: state.chats.filter((c) => c.id !== chatId),
            messages: Object.fromEntries(Object.entries(state.messages).filter(([id]) => id !== chatId)),
            selectedChatId: isSelected ? null : state.selectedChatId,
          };
        }),

      updateReceipt: (chatId, messageId, receipt) =>
        set((state) => {
          const thread = state.messages[chatId] || [];
          const updatedMessages = thread.map((m) => {
            if (m.id !== messageId) return m;
            const existingReceipts = m.receipts || [];
            const existingIndex = existingReceipts.findIndex((r) => r.userId === receipt.userId);

            let newReceipts = [...existingReceipts];
            if (existingIndex >= 0) {
              newReceipts[existingIndex] = {
                ...newReceipts[existingIndex],
                deliveredAt: receipt.deliveredAt || newReceipts[existingIndex].deliveredAt,
                readAt: receipt.readAt || newReceipts[existingIndex].readAt,
              };
            } else {
              newReceipts.push(receipt);
            }

            return { ...m, receipts: newReceipts };
          });

          const updatedChats = state.chats.map((c) => {
            if (c.id === chatId && c.lastMessage?.id === messageId) {
              const existingReceipts = c.lastMessage.receipts || [];
              const existingIndex = existingReceipts.findIndex((r: any) => r.userId === receipt.userId);

              let newReceipts = [...existingReceipts];
              if (existingIndex >= 0) {
                newReceipts[existingIndex] = {
                  ...newReceipts[existingIndex],
                  deliveredAt: receipt.deliveredAt || newReceipts[existingIndex].deliveredAt,
                  readAt: receipt.readAt || newReceipts[existingIndex].readAt,
                };
              } else {
                newReceipts.push(receipt);
              }

              return {
                ...c,
                lastMessage: { ...c.lastMessage, receipts: newReceipts },
              };
            }
            return c;
          });

          return {
            messages: { ...state.messages, [chatId]: updatedMessages },
            chats: updatedChats,
          };
        }),

      setSelectedChatId: (chatId) => set({ selectedChatId: chatId }),

      setUserTyping: (chatId, userId, isTyping) => {
        const timeoutKey = `${chatId}:${userId}`;
        if (typingTimeouts[timeoutKey]) {
          clearTimeout(typingTimeouts[timeoutKey]);
          delete typingTimeouts[timeoutKey];
        }

        if (isTyping) {
          typingTimeouts[timeoutKey] = setTimeout(() => {
            useChatStore.getState().setUserTyping(chatId, userId, false);
          }, 3500);
        }

        set((state) => {
          const typers = state.typingStatuses[chatId] || [];
          let newTypers = [...typers];

          if (isTyping) {
            if (!newTypers.includes(userId)) newTypers.push(userId);
          } else {
            newTypers = newTypers.filter((id) => id !== userId);
          }

          return {
            typingStatuses: { ...state.typingStatuses, [chatId]: newTypers },
          };
        });
      },

      setOnlineStatus: (userId, status) =>
        set((state) => ({
          onlineStatuses: { ...state.onlineStatuses, [userId]: status },
        })),

      setOnlineStatuses: (statuses) =>
        set((state) => {
          const mapped: Record<string, string> = {};
          for (const [userId, val] of Object.entries(statuses)) {
            if (typeof val === "object" && val !== null) {
              mapped[userId] = val.status === "online" ? "online" : (val.lastSeen || "offline");
            } else {
              mapped[userId] = val as string;
            }
          }
          return {
            onlineStatuses: { ...state.onlineStatuses, ...mapped },
          };
        }),

      setHasMoreMessages: (chatId, hasMore) =>
        set((state) => ({
          hasMoreMessages: { ...state.hasMoreMessages, [chatId]: hasMore },
        })),
    }),
    {
      name: "chat-store",
      storage: createJSONStorage(() => localStorage),
      // Only persist chat list metadata — messages are kept in memory only.
      // Persisting messages caused a blocking JSON.stringify of ALL messages on every
      // received message, which was the single biggest source of UI jank.
      partialize: (state) => ({
        chats: state.chats,
      }),
    }
  )
);
