export const SOCKET_EVENTS = {
  CONNECTION: "connection",
  DISCONNECT: "disconnect",
  ERROR: "error",

  // online/offline presence
  PRESENCE_CHANGE: "presence:change",

  // joining/leaving chat rooms
  JOIN_CHAT: "chat:join",
  LEAVE_CHAT: "chat:leave",
  CHAT_DELETED: "chat:deleted",
  CHAT_UPDATED: "chat:updated",

  // messages
  MESSAGE_NEW: "message:new",
  MESSAGE_DELETED_FOR_EVERYONE: "message:deleted-for-everyone",
  MESSAGE_DELIVERED: "message:delivered",
  MESSAGE_READ: "message:read",
  REACTION_CHANGED: "reaction:change",

  // typing indicators
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
} as const;

export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
