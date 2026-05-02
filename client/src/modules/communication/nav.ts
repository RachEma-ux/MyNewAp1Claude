/**
 * Communication — Module navigation.
 *
 * Pure data. The platform's nav composer reads this; modules do not
 * render their own top-level sidebar.
 *
 * All hrefs MUST be canonical Communication routes. Pointing nav at
 * legacy `/chat`, `/conversations`, or `/video-meeting` would defeat
 * the canonical-URL guarantee — those paths exist only as
 * compatibility redirects in App.tsx.
 */

export interface CommunicationNavEntry {
  label: string;
  href: string;
  /** Optional grouping for sidebar ordering. */
  group?: string;
  order?: number;
}

export const communicationNav: CommunicationNavEntry[] = [
  { label: "Communication", href: "/communication", group: "communication", order: 0 },
  { label: "Chat", href: "/communication/chat", group: "communication", order: 1 },
  { label: "Conversations", href: "/communication/conversations", group: "communication", order: 2 },
  { label: "Video Meeting", href: "/communication/video-meeting", group: "communication", order: 3 },
  { label: "Notifications", href: "/communication/notifications", group: "communication", order: 4 },
];
