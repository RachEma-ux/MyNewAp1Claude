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

import { and, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
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

/**
 * Singleton getter — sister of `getJobById` (#511-era). The
 * notifications surface previously only exposed list/count/markRead/
 * dismiss; clients deeplinking to a specific notification had to
 * list-all-and-filter. This is the direct lookup.
 *
 * Returns `null` on ASDB-null (fail-soft, matches getJobById) and on
 * not-found. The optional `userId` arg scopes the lookup so a
 * user-facing surface can prevent ID-enumeration escalation — passing
 * userId returns `null` if the row exists but belongs to someone
 * else, indistinguishable from "not found".
 */
export async function getNotificationById(
  notificationId: number,
  options: ServiceOptions & { readonly userId?: number } = {},
): Promise<NotificationRow | null> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return null;

  const filters = [eq(agsWorkspaceUserNotifications.id, notificationId)];
  if (options.userId !== undefined) {
    filters.push(eq(agsWorkspaceUserNotifications.userId, options.userId));
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
    .limit(1);
  if (rows.length === 0) return null;
  return rowToNotification(rows[0]);
}

/**
 * Bulk reader sibling of getNotificationById (#557). Sister of
 * getJobsByIds (#559) on the notifications surface. Lets a UI fetch
 * row payloads for a multi-select in one round-trip.
 *
 * Empty input short-circuits to [] with no DB call. The optional
 * userId scope applies the same id-enumeration guard as the singleton:
 * peer rows are silently excluded from the result (indistinguishable
 * from "not found").
 */
export async function getNotificationsByIds(
  notificationIds: readonly number[],
  options: ServiceOptions & { readonly userId?: number } = {},
): Promise<NotificationRow[]> {
  if (notificationIds.length === 0) return [];
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const filters = [
    inArray(agsWorkspaceUserNotifications.id, notificationIds as number[]),
  ];
  if (options.userId !== undefined) {
    filters.push(eq(agsWorkspaceUserNotifications.userId, options.userId));
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
    .where(filters.length === 1 ? filters[0] : and(...filters));
  return rows.map(rowToNotification);
}

export interface PushNotificationToUsersInput {
  /**
   * Recipient user ids. Empty array short-circuits to a no-op (no
   * insert). Duplicate ids produce duplicate rows by design — caller
   * dedupes if it cares.
   */
  readonly userIds: readonly number[];
  readonly notificationKind: string;
  readonly payload?: Record<string, unknown> | null;
}

export interface PushNotificationToUsersResult {
  readonly insertedCount: number;
  readonly notifications: readonly NotificationRow[];
}

/**
 * Bulk-insert the same notification body to many users in one INSERT.
 * Operators use this for broadcasts: "graph projection rebuild
 * complete — please review", "scheduled maintenance window starts
 * 18:00 UTC", etc. Sister of `pushNotification` for one-to-one writes;
 * shares the same row shape and fail-soft contract.
 *
 * Empty `userIds` is a no-op (returns {insertedCount: 0,
 * notifications: []}) — saves operators from a defensive guard at the
 * call-site when the recipient query happens to return zero rows.
 */
export async function pushNotificationToUsers(
  input: PushNotificationToUsersInput,
  options: ServiceOptions = {},
): Promise<PushNotificationToUsersResult> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();
  if (input.userIds.length === 0) {
    return { insertedCount: 0, notifications: [] };
  }

  const values = input.userIds.map((userId) => ({
    userId,
    notificationKind: input.notificationKind,
    payload: input.payload ?? null,
    read: false,
  }));

  const inserted = await db
    .insert(agsWorkspaceUserNotifications)
    .values(values)
    .returning({
      id: agsWorkspaceUserNotifications.id,
      userId: agsWorkspaceUserNotifications.userId,
      notificationKind: agsWorkspaceUserNotifications.notificationKind,
      payload: agsWorkspaceUserNotifications.payload,
      read: agsWorkspaceUserNotifications.read,
      createdAt: agsWorkspaceUserNotifications.createdAt,
    });

  const notifications = inserted.map(rowToNotification);
  return { insertedCount: notifications.length, notifications };
}

export interface ListNotificationsInput {
  readonly userId: number;
  readonly unreadOnly?: boolean;
  /**
   * Single notificationKind to filter by, or an array (OR semantics
   * via SQL IN). Symmetric with listJobs.status (#539) and
   * listErrorEvents.errorClass (#540). Empty array short-circuits
   * to [] (vacuous IN).
   */
  readonly notificationKind?: string | readonly string[];
  readonly limit?: number;
  /**
   * Restrict to notifications whose `createdAt` is at-or-after this
   * timestamp. Symmetric with `listJobs.createdSince` and
   * `listErrorEvents.createdSince` — same date-window discipline
   * across the three Phase 22 list surfaces.
   */
  readonly createdSince?: Date;
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
  const kindInput = input.notificationKind;
  if (kindInput !== undefined) {
    if (Array.isArray(kindInput)) {
      if (kindInput.length === 0) return [];
      filters.push(
        inArray(
          agsWorkspaceUserNotifications.notificationKind,
          kindInput as string[],
        ),
      );
    } else {
      filters.push(
        eq(
          agsWorkspaceUserNotifications.notificationKind,
          kindInput as string,
        ),
      );
    }
  }
  if (input.createdSince !== undefined) {
    filters.push(
      gte(agsWorkspaceUserNotifications.createdAt, input.createdSince),
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

export interface MarkNotificationsReadInput {
  readonly userId: number;
  /**
   * Notification ids to mark as read. Empty short-circuits to no-op.
   * The userId predicate is enforced server-side so callers can't
   * mark another user's notifications by id-guessing.
   */
  readonly notificationIds: readonly number[];
}

export interface MarkNotificationsReadResult {
  readonly markedCount: number;
}

/**
 * Bulk-mark notifications as read for a single user. Sister of
 * markNotificationRead (singular) and markAllNotificationsRead
 * (whole inbox). Use this when the operator selects a subset of
 * rows in the inbox UI and clicks "mark selected read".
 *
 * Always scoped to userId so a malicious caller can't escalate
 * by id-enumeration. Empty `notificationIds` short-circuits.
 */
export async function markNotificationsRead(
  input: MarkNotificationsReadInput,
  options: ServiceOptions = {},
): Promise<MarkNotificationsReadResult> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();
  if (input.notificationIds.length === 0) return { markedCount: 0 };

  const updated = await db
    .update(agsWorkspaceUserNotifications)
    .set({ read: true })
    .where(
      and(
        eq(agsWorkspaceUserNotifications.userId, input.userId),
        inArray(
          agsWorkspaceUserNotifications.id,
          input.notificationIds as number[],
        ),
      ),
    )
    .returning({ id: agsWorkspaceUserNotifications.id });

  return { markedCount: updated.length };
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

export interface MarkAllNotificationsReadByKindInput {
  readonly userId: number;
  /**
   * Restrict the mark-read to notifications of this kind (single
   * `eq`) or kinds (array `IN`). Empty array short-circuits to
   * `{markedCount: 0}` with no DB call — matches the canonical
   * Phase 22 contract.
   */
  readonly notificationKind: string | readonly string[];
}

export interface MarkAllNotificationsReadByKindResult {
  readonly markedCount: number;
}

/**
 * Kind-scoped "mark all as read" — sister of
 * `markAllNotificationsRead` but only flips rows whose
 * `notificationKind` matches the filter. Gmail-style "mark all
 * marketing as read" gesture; lets users clear noisy notification
 * classes without nuking the whole inbox.
 *
 * userId is enforced in the WHERE clause (matches the
 * id-enumeration-prevention pattern used by markNotificationsRead +
 * dismissNotifications).
 *
 * Returns `markedCount` (the number of rows actually flipped) so
 * the UI can show "marked 47 notifications as read" toasts. The
 * caller can pass `unreadOnly` filtering via... actually no: this
 * is implicitly unread-only because already-read rows would be a
 * no-op flip. We mirror markAllNotificationsRead's
 * `read=false` predicate so the row count is accurate.
 */
export async function markAllNotificationsReadByKind(
  input: MarkAllNotificationsReadByKindInput,
  options: ServiceOptions = {},
): Promise<MarkAllNotificationsReadByKindResult> {
  // Empty notificationKind array → vacuous IN; short-circuit BEFORE
  // the ASDB probe.
  if (
    Array.isArray(input.notificationKind) &&
    input.notificationKind.length === 0
  ) {
    return { markedCount: 0 };
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const kindFilter = Array.isArray(input.notificationKind)
    ? inArray(
        agsWorkspaceUserNotifications.notificationKind,
        input.notificationKind as string[],
      )
    : eq(
        agsWorkspaceUserNotifications.notificationKind,
        input.notificationKind as string,
      );

  const marked = await db
    .update(agsWorkspaceUserNotifications)
    .set({ read: true })
    .where(
      and(
        eq(agsWorkspaceUserNotifications.userId, input.userId),
        eq(agsWorkspaceUserNotifications.read, false),
        kindFilter,
      ),
    )
    .returning({ id: agsWorkspaceUserNotifications.id });

  return { markedCount: marked.length };
}

export interface DismissNotificationsInput {
  readonly userId: number;
  /**
   * Notification ids to physically delete. Same userId-scoping as
   * markNotificationsRead — callers can't delete another user's
   * rows by id-guessing. Empty short-circuits to no-op.
   */
  readonly notificationIds: readonly number[];
}

export interface DismissNotificationsResult {
  readonly deletedCount: number;
}

/**
 * User-initiated bulk delete of inbox notifications. Different from
 * markNotificationsRead (which preserves the row + flips read=true)
 * and from pruneOldNotifications (which deletes by age cutoff
 * regardless of user). This is the "delete selected" inbox action.
 *
 * userId is enforced in the WHERE clause so a malicious caller
 * can't escalate by id-enumeration.
 */
export async function dismissNotifications(
  input: DismissNotificationsInput,
  options: ServiceOptions = {},
): Promise<DismissNotificationsResult> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();
  if (input.notificationIds.length === 0) return { deletedCount: 0 };

  const deleted = await db
    .delete(agsWorkspaceUserNotifications)
    .where(
      and(
        eq(agsWorkspaceUserNotifications.userId, input.userId),
        inArray(
          agsWorkspaceUserNotifications.id,
          input.notificationIds as number[],
        ),
      ),
    )
    .returning({ id: agsWorkspaceUserNotifications.id });

  return { deletedCount: deleted.length };
}

export interface DismissAllNotificationsInput {
  readonly userId: number;
  /**
   * If true, only deletes notifications that have already been read.
   * Default true — the safer default for a "clear my inbox" gesture:
   * preserves unread rows the user hasn't triaged yet. Pass `false`
   * to nuke the whole inbox including unread.
   *
   * Mirrors the same flag on `pruneOldNotifications.readOnly` (where
   * the default is `false` because that's a retention sweep, not a
   * user gesture).
   */
  readonly readOnly?: boolean;
}

export interface DismissAllNotificationsResult {
  readonly deletedCount: number;
}

/**
 * User-initiated "clear my inbox" — symmetric to
 * `markAllNotificationsRead`. Bulk-delete every notification for
 * the user (default: only the already-read ones) in a single
 * DELETE round trip.
 *
 * Different from `dismissNotifications` (which takes an explicit id
 * list — the "delete selected" gesture) and from
 * `pruneOldNotifications` (which is the operator-controlled
 * retention sweep, age-based and per-kind).
 *
 * userId is enforced in the WHERE clause; cross-user dismissal is
 * impossible.
 */
export async function dismissAllNotifications(
  input: DismissAllNotificationsInput,
  options: ServiceOptions = {},
): Promise<DismissAllNotificationsResult> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const readOnly = input.readOnly ?? true;
  const whereClause = readOnly
    ? and(
        eq(agsWorkspaceUserNotifications.userId, input.userId),
        eq(agsWorkspaceUserNotifications.read, true),
      )
    : eq(agsWorkspaceUserNotifications.userId, input.userId);

  const deleted = await db
    .delete(agsWorkspaceUserNotifications)
    .where(whereClause)
    .returning({ id: agsWorkspaceUserNotifications.id });

  return { deletedCount: deleted.length };
}

export interface DismissAllNotificationsByKindInput {
  readonly userId: number;
  /**
   * Restrict the delete to notifications of this kind (single `eq`)
   * or kinds (array `IN`). Empty array short-circuits to
   * `{deletedCount: 0}` with no DB call — canonical Phase 22
   * contract.
   */
  readonly notificationKind: string | readonly string[];
  /**
   * If true, only deletes notifications that have already been
   * read. Default true — matches `dismissAllNotifications` default
   * (safer "clear" gesture that preserves unread rows). Pass
   * `false` to nuke matching rows regardless of read state.
   */
  readonly readOnly?: boolean;
}

export interface DismissAllNotificationsByKindResult {
  readonly deletedCount: number;
}

/**
 * Kind-scoped "clear my inbox" — sister of
 * `dismissAllNotifications` (#568) with a notificationKind filter,
 * completing the kind-scoped user gesture pair alongside
 * `markAllNotificationsReadByKind` (#575). Use case: "dismiss all
 * my promotion notifications" without nuking the whole inbox or
 * multi-selecting in the UI.
 *
 * userId is enforced in the WHERE clause (cross-user dismissal
 * impossible). Different from `pruneOldNotifications` (operator
 * retention sweep, age-based) and from `dismissNotifications`
 * (explicit id list).
 */
export async function dismissAllNotificationsByKind(
  input: DismissAllNotificationsByKindInput,
  options: ServiceOptions = {},
): Promise<DismissAllNotificationsByKindResult> {
  if (
    Array.isArray(input.notificationKind) &&
    input.notificationKind.length === 0
  ) {
    return { deletedCount: 0 };
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const readOnly = input.readOnly ?? true;
  const kindFilter = Array.isArray(input.notificationKind)
    ? inArray(
        agsWorkspaceUserNotifications.notificationKind,
        input.notificationKind as string[],
      )
    : eq(
        agsWorkspaceUserNotifications.notificationKind,
        input.notificationKind as string,
      );

  const whereClause = readOnly
    ? and(
        eq(agsWorkspaceUserNotifications.userId, input.userId),
        eq(agsWorkspaceUserNotifications.read, true),
        kindFilter,
      )
    : and(
        eq(agsWorkspaceUserNotifications.userId, input.userId),
        kindFilter,
      );

  const deleted = await db
    .delete(agsWorkspaceUserNotifications)
    .where(whereClause)
    .returning({ id: agsWorkspaceUserNotifications.id });

  return { deletedCount: deleted.length };
}

// ---------- retention prune ----------

export interface PruneOldNotificationsInput {
  /**
   * Delete notifications whose createdAt is strictly older than this
   * cutoff. Caller controls the policy.
   */
  readonly olderThan: Date;
  /**
   * If true, only deletes notifications that have already been read.
   * Default false (deletes both read and unread). Setting true is the
   * safer policy — operators may not have triaged unread rows yet.
   */
  readonly readOnly?: boolean;
  /**
   * Optional notificationKind filter — single string (`eq`) or array
   * (`IN`). Lets a cron/operator prune one kind aggressively while
   * preserving rarer ones. Mirrors the same filter pattern on
   * pruneOldBackgroundJobs.jobKind (#549) and
   * pruneOldErrorEvents.errorClass (#550).
   *
   * Empty array short-circuits to `{deletedCount: 0}` with no DB call.
   */
  readonly notificationKind?: string | readonly string[];
}

export interface PruneOldNotificationsResult {
  readonly deletedCount: number;
}

/**
 * Bulk-delete user notifications older than the given cutoff. Symmetric
 * to `pruneOldErrorEvents` (PR #519) — same fail-soft contract on
 * ASDB-null, same caller-controlled retention policy.
 *
 * Default `readOnly=false` deletes both read and unread rows because
 * notifications past the cutoff are unlikely to still be useful even
 * if unread (operator missed them; a stale "graph_quality_run_completed"
 * from 60 days ago has no actionable signal). Operators who want to
 * preserve unread rows pass `readOnly: true`.
 */
export async function pruneOldNotifications(
  input: PruneOldNotificationsInput,
  options: ServiceOptions = {},
): Promise<PruneOldNotificationsResult> {
  // Empty notificationKind array → vacuous IN; short-circuit BEFORE
  // the ASDB probe (matches pruneOldErrorEvents #550 contract).
  if (
    Array.isArray(input.notificationKind) &&
    input.notificationKind.length === 0
  ) {
    return { deletedCount: 0 };
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { deletedCount: 0 };

  const filters = [lt(agsWorkspaceUserNotifications.createdAt, input.olderThan)];
  if (input.readOnly) {
    filters.push(eq(agsWorkspaceUserNotifications.read, true));
  }
  const kindInput = input.notificationKind;
  if (kindInput !== undefined) {
    if (Array.isArray(kindInput)) {
      filters.push(
        inArray(
          agsWorkspaceUserNotifications.notificationKind,
          kindInput as string[],
        ),
      );
    } else {
      filters.push(
        eq(
          agsWorkspaceUserNotifications.notificationKind,
          kindInput as string,
        ),
      );
    }
  }

  const deleted = await db
    .delete(agsWorkspaceUserNotifications)
    .where(filters.length === 1 ? filters[0] : and(...filters))
    .returning({ id: agsWorkspaceUserNotifications.id });

  return { deletedCount: deleted.length };
}
