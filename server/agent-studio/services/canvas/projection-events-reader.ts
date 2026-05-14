/**
 * Canvas projection events reader — V1+ 17-γ follow-up (PR-V1-56).
 *
 * Pure read helper for the future drain consumer that forwards
 * `ags_canvas_projection_events` rows into `ProjectionSyncWorker`.
 * Bounded to the read shape so the consumer (cron / queue / etc.)
 * lands as a separate sub-arc once its operational shape is
 * decided.
 *
 * Pattern: keyset pagination on `id` ASC. Callers track a
 * `lastSeenId` cursor and ask for the next `limit` rows. The
 * `(workspaceId, createdAt)` index from #804 also serves
 * `createdAt` range queries; this reader uses the simpler keyset
 * because the drain consumer wants strict ordering — `createdAt`
 * ties would otherwise need a tiebreak column.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - Read-only: SELECT only. No write paths.
 *   - DI seam (`getDb`) lets tests bypass ASDB entirely.
 */

import { and, asc, eq, gt } from "drizzle-orm";

import type { AgsCanvasProjectionEvent } from "../../../../drizzle/tables/agent-studio-canvas.js";

export interface ReadCanvasProjectionEventsAfterInput {
  /** Required workspace scope — the reader is workspace-bounded. */
  readonly workspaceId: number;
  /** Cursor — return rows with `id > lastSeenId`. Use `0` for the
   *  first call (no prior cursor). */
  readonly lastSeenId: number;
  /** Maximum rows to return. Caller picks the batch size. Caller
   *  is responsible for capping the upper bound (default consumer
   *  uses ~100; this helper enforces a defensive ceiling at 1000
   *  to prevent runaway reads). */
  readonly limit: number;
}

export interface ReadCanvasProjectionEventsAfterOptions {
  /** Test seam — override the DB accessor. Production defaults to
   *  `getAsDb()`. */
  readonly getDb?: () =>
    | {
        select: (
          shape: Record<string, unknown>,
        ) => {
          from: (t: unknown) => {
            where: (cond: unknown) => {
              orderBy: (...args: unknown[]) => {
                limit: (n: number) => Promise<AgsCanvasProjectionEvent[]>;
              };
            };
          };
        };
      }
    | null;
}

export const READ_CANVAS_PROJECTION_EVENTS_HARD_LIMIT = 1000;

/**
 * Returns up to `limit` rows from `ags_canvas_projection_events`
 * with `id > lastSeenId`, scoped to `workspaceId`, ordered by
 * `id` ASC.
 *
 * ASDB-unavailable → returns `[]` (consumer should treat that as
 * "no progress; retry next tick" — never raises so a transient
 * connection blip doesn't crash the drain loop).
 */
export async function readCanvasProjectionEventsAfter(
  input: ReadCanvasProjectionEventsAfterInput,
  options: ReadCanvasProjectionEventsAfterOptions = {},
): Promise<AgsCanvasProjectionEvent[]> {
  const effectiveLimit = Math.min(
    Math.max(1, Math.trunc(input.limit)),
    READ_CANVAS_PROJECTION_EVENTS_HARD_LIMIT,
  );

  const { agsCanvasProjectionEvents } = await import(
    "../../../../drizzle/tables/agent-studio-canvas.js"
  );

  const db =
    options.getDb != null
      ? options.getDb()
      : (await loadDefaultGetDb())();
  if (!db) return [];

  const rows = await (db as {
    select: (shape: Record<string, unknown>) => {
      from: (t: typeof agsCanvasProjectionEvents) => {
        where: (cond: unknown) => {
          orderBy: (...args: unknown[]) => {
            limit: (n: number) => Promise<AgsCanvasProjectionEvent[]>;
          };
        };
      };
    };
  })
    .select({
      id: agsCanvasProjectionEvents.id,
      kind: agsCanvasProjectionEvents.kind,
      workspaceId: agsCanvasProjectionEvents.workspaceId,
      canvasId: agsCanvasProjectionEvents.canvasId,
      canvasNodeId: agsCanvasProjectionEvents.canvasNodeId,
      referencedNoteId: agsCanvasProjectionEvents.referencedNoteId,
      metadata: agsCanvasProjectionEvents.metadata,
      createdAt: agsCanvasProjectionEvents.createdAt,
    })
    .from(agsCanvasProjectionEvents)
    .where(
      and(
        eq(agsCanvasProjectionEvents.workspaceId, input.workspaceId),
        gt(agsCanvasProjectionEvents.id, input.lastSeenId),
      ),
    )
    .orderBy(asc(agsCanvasProjectionEvents.id))
    .limit(effectiveLimit);

  return rows;
}

async function loadDefaultGetDb() {
  const mod = await import("../../db/connection.js");
  return mod.getAsDb as unknown as () => unknown;
}
