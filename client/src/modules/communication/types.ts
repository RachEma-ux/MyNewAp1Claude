/**
 * Communication — Public types.
 *
 * Re-exported from `./index.ts` so other modules can typecheck against
 * Communication shapes without reaching into private files. Keep this
 * file dependency-free and minimal: only the data structures other
 * modules legitimately need to refer to.
 */

export interface CommunicationMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "agent" | "bot";
  content: string;
  createdAt?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  status: "active" | "archived" | "deleted";
  updatedAt?: string;
}

export type CommunicationSubdomain =
  | "dashboard"
  | "chat"
  | "conversations"
  | "video-meeting"
  | "notifications";
