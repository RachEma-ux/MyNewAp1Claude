/**
 * Vault — presence service (V2 Phase CRDT-α first slice).
 *
 * Tracks who is currently in a note for the collaborative editing
 * surface. Session-scoped + 5-minute idle TTL.
 *
 * Surfaces:
 *   - `enterPresence` — record a peer entering a note (or refresh
 *     an existing session's lastActiveAt).
 *   - `heartbeat` — operator UI pings every ~30s to keep the
 *     session live; updates lastActiveAt.
 *   - `leavePresence` — operator UI signals on tab close.
 *   - `listPresence` — returns currently-active peers for a note;
 *     eagerly evicts entries whose lastActiveAt is older than the
 *     TTL.
 *
 * Hard-rule compliance (CLAUDE.md + V2 ADR
 * `agent-studio-realtime-collab-crdt.md`):
 *   - Postgres = source of truth for note content. Presence
 *     entries are EPHEMERAL — never reads / writes `agsNoteVersions`.
 *   - No `process.env.*_API_KEY` reads.
 *   - No `dispatchMcpToolCall` imports.
 *   - No `credential-resolver` imports (Plan v3 D2).
 *
 * Source-scan test pin:
 *   `tests/agent-studio/vault-presence-boundary.test.ts` asserts
 *   none of the above are imported AND that this service never
 *   writes to `agsNoteVersions` (no concurrent-write bypass).
 */

import { and, eq, lt, sql } from "drizzle-orm";

import { getAsDb } from "../../db/connection.js";
import {
  agsVaultNotePresence,
} from "../../../../drizzle/tables/agent-studio-vault.js";

/**
 * Idle TTL for a presence row. After this many ms without a
 * heartbeat, the row is considered stale and is evicted on the
 * next list call. Matches the V2 CRDT ADR §1 — 5 minutes.
 */
export const PRESENCE_IDLE_TTL_MS = 5 * 60 * 1000;

export interface PresenceRow {
  readonly id: number;
  readonly noteId: number;
  readonly userId: number;
  readonly sessionToken: string;
  readonly cursorState: Record<string, unknown> | null;
  readonly enteredAt: Date;
  readonly lastActiveAt: Date;
}

export interface EnterPresenceInput {
  readonly noteId: number;
  readonly userId: number;
  readonly sessionToken: string;
  readonly cursorState?: Record<string, unknown>;
}

function rowToPresence(r: Record<string, unknown>): PresenceRow {
  return {
    id: Number(r.id),
    noteId: Number(r.noteId),
    userId: Number(r.userId),
    sessionToken: String(r.sessionToken),
    cursorState: (r.cursorState as Record<string, unknown> | null) ?? null,
    enteredAt: r.enteredAt as Date,
    lastActiveAt: r.lastActiveAt as Date,
  };
}

/**
 * Upsert presence — record a peer entering a note, or refresh
 * lastActiveAt if the session token already exists.
 */
export async function enterPresence(
  input: EnterPresenceInput,
): Promise<PresenceRow | null> {
  const db = getAsDb();
  if (!db) return null;
  const now = new Date();
  // Check for existing session.
  const existing = await db
    .select()
    .from(agsVaultNotePresence)
    .where(
      and(
        eq(agsVaultNotePresence.noteId, input.noteId),
        eq(agsVaultNotePresence.userId, input.userId),
        eq(agsVaultNotePresence.sessionToken, input.sessionToken),
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(agsVaultNotePresence)
      .set({
        lastActiveAt: now,
        cursorState: input.cursorState ?? null,
      })
      .where(eq(agsVaultNotePresence.id, existing[0].id));
    return {
      ...rowToPresence(existing[0] as Record<string, unknown>),
      lastActiveAt: now,
      cursorState: input.cursorState ?? null,
    };
  }
  const [inserted] = await db
    .insert(agsVaultNotePresence)
    .values({
      noteId: input.noteId,
      userId: input.userId,
      sessionToken: input.sessionToken,
      cursorState: input.cursorState ?? null,
    })
    .returning();
  return inserted
    ? rowToPresence(inserted as Record<string, unknown>)
    : null;
}

/**
 * Heartbeat — refresh lastActiveAt + optional cursorState for an
 * existing presence row.
 */
export async function heartbeat(input: {
  readonly noteId: number;
  readonly userId: number;
  readonly sessionToken: string;
  readonly cursorState?: Record<string, unknown>;
}): Promise<void> {
  const db = getAsDb();
  if (!db) return;
  const patch: Record<string, unknown> = { lastActiveAt: new Date() };
  if (input.cursorState !== undefined) patch.cursorState = input.cursorState;
  await db
    .update(agsVaultNotePresence)
    .set(patch)
    .where(
      and(
        eq(agsVaultNotePresence.noteId, input.noteId),
        eq(agsVaultNotePresence.userId, input.userId),
        eq(agsVaultNotePresence.sessionToken, input.sessionToken),
      ),
    );
}

export async function leavePresence(input: {
  readonly noteId: number;
  readonly userId: number;
  readonly sessionToken: string;
}): Promise<void> {
  const db = getAsDb();
  if (!db) return;
  await db
    .delete(agsVaultNotePresence)
    .where(
      and(
        eq(agsVaultNotePresence.noteId, input.noteId),
        eq(agsVaultNotePresence.userId, input.userId),
        eq(agsVaultNotePresence.sessionToken, input.sessionToken),
      ),
    );
}

/**
 * List currently-active peers for a note. Side effect: evicts
 * rows whose `lastActiveAt` is older than the TTL. Eviction
 * happens BEFORE the select so the returned set is fresh.
 */
export async function listPresence(noteId: number): Promise<
  ReadonlyArray<PresenceRow>
> {
  const db = getAsDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - PRESENCE_IDLE_TTL_MS);
  await db
    .delete(agsVaultNotePresence)
    .where(
      and(
        eq(agsVaultNotePresence.noteId, noteId),
        lt(agsVaultNotePresence.lastActiveAt, cutoff),
      ),
    );
  const rows = await db
    .select()
    .from(agsVaultNotePresence)
    .where(eq(agsVaultNotePresence.noteId, noteId))
    .orderBy(sql`${agsVaultNotePresence.lastActiveAt} desc`);
  return rows.map((r) => rowToPresence(r as Record<string, unknown>));
}

/**
 * Pure helper — exposed for the source-scan boundary test and for
 * UI callers that compute TTL deltas client-side.
 */
export function isPresenceStale(
  lastActiveAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() - lastActiveAt.getTime() > PRESENCE_IDLE_TTL_MS;
}
