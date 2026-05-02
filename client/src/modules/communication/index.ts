/**
 * Communication — Public contract.
 *
 * Other modules import from `@/modules/communication` only. Anything
 * imported via `@/modules/communication/<subdir>/*` is a boundary
 * violation enforced by `check:module-api-boundaries`.
 *
 * Allowed exports:
 *   - public types (Communication-shaped data referenced elsewhere)
 *   - route builders (canonical URL accessors so callers don't
 *     hardcode "/communication/...")
 *
 * Forbidden exports:
 *   - communicationRouter (backend), service functions
 *   - private hooks, pages, or components
 *   - the manifest itself (the platform registry consumes it via
 *     `client.ts`; no consumer should reach for it directly)
 */

export type {
  CommunicationMessage,
  ConversationSummary,
  CommunicationSubdomain,
} from "./types";

/**
 * Canonical URL builders for Communication. Use these instead of
 * hardcoding "/communication/chat" etc. in another module's UI —
 * `check:cross-module-links` flags hardcoded links when a public
 * builder exists.
 */
export const CommunicationRoutes = {
  dashboard: () => "/communication",
  chat: () => "/communication/chat",
  conversations: () => "/communication/conversations",
  videoMeeting: () => "/communication/video-meeting",
  notifications: () => "/communication/notifications",
} as const;
