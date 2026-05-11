/**
 * Workspace Observability — User notifications service.
 *
 * Phase 22. Wires the dormant `ags_workspace_user_notifications`
 * table. Operators see in-app notifications for events that
 * concern them — promotion approvals, background-job completions,
 * graph correction proposal reviews requested, etc.
 *
 * Notifications carry an opaque `kind` discriminator + `payload`
 * JSON. The UI layer decodes payload by kind; the service stays
 * shape-agnostic so future notification kinds ship without DB
 * churn.
 *
 * ADR: docs/architecture/agent-studio-native-graph-workspace.md
 */

import { and, count, desc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsWorkspaceUserNotifications } from "../../../../drizzle/tables/agent-studio-graph-quality.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export interface PushNotificationInput {
  readonly userId: number;
  readonly notificationKind: string;
  readonly payload?: Record<string, unknown> | null;
}

export interface NotificationRow {
  readonly id: number;
  readonly userId: number;
  readonly notificationKind: string;
  readonly payload: Record<string, unknown> | null;
  readonly read: boolean;
  readonly createdAt: Date;
}

export interface ServiceOptions {
  readonly getDb?: typeof getAsDb;
}

function rowToNotification(r: Record<string, unknown>): NotificationRow {
  return {
    id: Number(r.id),
    userId: Number(r.userId),
    notificationKind: String(r.notificationKind),
    payload:
      (r.payload as Record<string, unknown> | null | undefined) ?? null,
    read: Boolean(r.read),
    createdAt: r.createdAt as Date,
  };
}

export async function pushNotification(
  input: PushNotificationInput,
  options: ServiceOptions = {},
): Promise<NotificationRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const inserted = await db
    .insert(agsWorkspaceUserNotifications)
    .values({
      userId: input.userId,
      notificationKind: input.notificationKind,
      payload: input.payload ?? null,
      read: false,
    })
    .returning({
      id: agsWorkspaceUserNotifications.id,
      userId: agsWorkspaceUserNotifications.userId,
      notificationKind: agsWorkspaceUserNotifications.notificationKind,
      payload: agsWorkspaceUserNotifications.payload,
      read: agsWorkspaceUserNotifications.read,
      createdAt: agsWorkspaceUserNotifications.createdAt,
    });
  const row = inserted[0];
  if (!row) throw new Error("Failed to push notification");
  return rowToNotification(row);
}

export interface ListNotificationsInput {
  readonly userId: number;
  readonly unreadOnly?: boolean;
  readonly notificationKind?: string;
  readonly limit?: number;
}

export async function listNotifications(
  input: ListNotificationsInput,
  options: ServiceOptions = {},
): Promise<NotificationRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const filters = [eq(agsWorkspaceUserNotifications.userId, input.userId)];
  if (input.unreadOnly) {
    filters.push(eq(agsWorkspaceUserNotifications.read, false));
  }
  if (input.notificationKind !== undefined) {
    filters.push(
      eq(agsWorkspaceUserNotifications.notificationKind, input.notificationKind),
    );
  }

  const rows = await db
    .select({
      id: agsWorkspaceUserNotifications.id,
      userId: agsWorkspaceUserNotifications.userId,
      notificationKind: agsWorkspaceUserNotifications.notificationKind,
      payload: agsWorkspaceUserNotifications.payload,
      read: agsWorkspaceUserNotifications.read,
      createdAt: agsWorkspaceUserNotifications.createdAt,
    })
    .from(agsWorkspaceUserNotifications)
    .where(filters.length === 1 ? filters[0] : and(...filters))
    .orderBy(desc(agsWorkspaceUserNotifications.createdAt))
    .limit(input.limit ?? 100);
  return rows.map(rowToNotification);
}

export async function markNotificationRead(
  notificationId: number,
  options: ServiceOptions = {},
): Promise<void> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  await db
    .update(agsWorkspaceUserNotifications)
    .set({ read: true })
    .where(eq(agsWorkspaceUserNotifications.id, notificationId));
}

export interface UnreadNotificationCount {
  readonly total: number;
  readonly byKind: Record<string, number>;
}

/**
 * Aggregate unread notification count for a single user. Returns `total`
 * and a per-`notificationKind` breakdown — the dashboard renders the
 * total as a badge and the per-kind map as filter chips.
 *
 * Fail-soft: when ASDB is unavailable returns the zero-state instead of
 * throwing, matching the listNotifications contract. A failed read of
 * the badge count is preferable to a blocked dashboard render.
 */
export async function countUnreadNotifications(
  userId: number,
  options: ServiceOptions = {},
): Promise<UnreadNotificationCount> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { total: 0, byKind: {} };

  const rows = (await db
    .select({
      notificationKind: agsWorkspaceUserNotifications.notificationKind,
      count: count(),
    })
    .from(agsWorkspaceUserNotifications)
    .where(
      and(
        eq(agsWorkspaceUserNotifications.userId, userId),
        eq(agsWorkspaceUserNotifications.read, false),
      ),
    )
    .groupBy(agsWorkspaceUserNotifications.notificationKind)) as {
    notificationKind: string;
    count: number;
  }[];

  let total = 0;
  const byKind: Record<string, number> = {};
  for (const r of rows) {
    const c = Number(r.count);
    byKind[r.notificationKind] = c;
    total += c;
  }
  return { total, byKind };
}

export async function markAllNotificationsRead(
  userId: number,
  options: ServiceOptions = {},
): Promise<void> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  await db
    .update(agsWorkspaceUserNotifications)
    .set({ read: true })
    .where(
      and(
        eq(agsWorkspaceUserNotifications.userId, userId),
        eq(agsWorkspaceUserNotifications.read, false),
      ),
    );
}
