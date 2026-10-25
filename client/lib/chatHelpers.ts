import type { Chat, User } from "@hooks/useChatStore";

export interface ChatDisplay {
  name: string;
  avatarUrl: string | null;
  isGroup: boolean;
  /** The other person in a direct chat (undefined for groups). */
  partner?: User;
}

export function getChatDisplay(chat: Chat, myId?: string | null): ChatDisplay {
  if (chat.type === "GROUP") {
    return { name: chat.title || "Group", avatarUrl: chat.photoUrl, isGroup: true };
  }
  const partner = chat.members?.find((m) => m.userId !== myId)?.user;
  return {
    name: partner?.name || "Unknown user",
    avatarUrl: partner?.avatarUrl ?? null,
    isGroup: false,
    partner,
  };
}

/** Short text shown in the chat list for a message. */
export function previewText(type: string, content: string | null) {
  switch (type) {
    case "IMAGE": return "Photo";
    case "VIDEO": return "Video";
    case "AUDIO": return "Voice message";
    case "FILE": return content && !content.startsWith("voice-message-") ? content : "File";
    default: return content ?? "";
  }
}
