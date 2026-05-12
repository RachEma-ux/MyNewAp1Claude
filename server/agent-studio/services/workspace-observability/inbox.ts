/**
 * Workspace Observability — per-user inbox composite.
 *
 * Sister of `dashboard.ts` (operator surface), but scoped to a
 * single user's inbox. Bundles `listNotifications` +
 * `countUnreadNotifications` into one call so the inbox UI's
 * cold-render is one round-trip instead of two.
 *
 * Pagination / filter changes still call `listNotifications`
 * directly — this is just the cold-render bundle.
 */

import {
  listNotifications,
  countUnreadNotifications,
  type ListNotificationsInput,
  type NotificationRow,
  type UnreadNotificationCount,
  type ServiceOptions,
} from "./user-notifications.js";

export interface InboxCompositePayload {
  readonly notifications: readonly NotificationRow[];
  readonly unreadCount: UnreadNotificationCount;
}

export interface InboxCompositeInput {
  readonly userId: number;
  readonly unreadOnly?: boolean;
  readonly notificationKind?: string | readonly string[];
  readonly limit?: number;
  /**
   * Restrict to notifications whose `createdAt` is at-or-after this
   * timestamp. Forwarded to `listNotifications` (#537-era support).
   * Lets the client say "give me my inbox since I last polled" in
   * one round-trip instead of fetching all and filtering client-side.
   * The unread-count leg ignores this filter intentionally — the
   * inbox badge should reflect TOTAL unread, not "unread since X".
   */
  readonly createdSince?: Date;
}

const DEFAULT_INBOX_LIMIT = 50;

export async function getInboxComposite(
  input: InboxCompositeInput,
  options: ServiceOptions = {},
): Promise<InboxCompositePayload> {
  const listInput: ListNotificationsInput = {
    userId: input.userId,
    unreadOnly: input.unreadOnly,
    notificationKind: input.notificationKind,
    limit: input.limit ?? DEFAULT_INBOX_LIMIT,
    createdSince: input.createdSince,
  };

  const [notifications, unreadCount] = await Promise.all([
    listNotifications(listInput, options),
    countUnreadNotifications(input.userId, options),
  ]);

  return { notifications, unreadCount };
}
