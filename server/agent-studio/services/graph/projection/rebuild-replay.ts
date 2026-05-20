/**
 * Graph Projection Rebuild Replay.
 *
 * Closes the partial-implementation gap for `GraphRepository.rebuildProjection`.
 * Before this module existed, `rebuildProjection` would record a row in
 * `ags_graph_projection_rebuilds` with status='queued' and return zero counts —
 * the worker-side replay was deferred. This module is the worker.
 *
 * Given a scope string, the replayer:
 *   1. Loads the corresponding source rows from Postgres SoT
 *      (vault notes / wikilinks / bases / base rows).
 *   2. Synthesises a `ProjectionEvent` per row, feeding it through
 *      `ProjectionSyncWorker.handle()` which writes to Neo4j via
 *      `applyProjectionJob`.
 *   3. Aggregates per-event counts into a single ProjectionResult.
 *
 * Scopes supported (closed-taxonomy, plus an `all` umbrella):
 *   - `"vault_notes"` — every active (deletedAt IS NULL) vault note.
 *   - `"wikilinks"`   — every wikilink with a resolved target.
 *   - `"bases"`       — every Base + base row (incl. row→note links).
 *   - `"all"`         — vault_notes + wikilinks + bases, in that order.
 *
 * Anything outside the closed taxonomy returns an empty result with a
 * single `unknown_scope` error — preserves the no-op-on-bad-input
 * contract instead of throwing.
 *
 * Pure-orchestration design: every dependency is injected via the
 * `RebuildReplayDeps` bag (loaders + sync-worker). Unit tests stub
 * each. Production callers pass the default ASDB loaders + a
 * Neo4j-backed `ProjectionSyncWorker`.
 *
 * Failure-tolerance: a single bad row never poisons the replay. The
 * orchestrator catches per-row exceptions, records them in the
 * returned `errors`, and continues to the next row.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { getAsDb } from "../../../db/connection.js";
import {
  agsVaultNotes,
  agsVaultWikilinks,
} from "../../../../../drizzle/tables/agent-studio-vault.js";
import {
  agsBases,
  agsBaseRows,
} from "../../../../../drizzle/tables/agent-studio-bases.js";
import { ProjectionSyncWorker } from "./sync-worker.js";
import type { ProjectionEvent } from "./sync-worker.js";
import type { ProjectionResult } from "../repository/types.js";

export const SUPPORTED_REBUILD_SCOPES = [
  "vault_notes",
  "wikilinks",
  "bases",
  "all",
] as const;
export type RebuildScope = (typeof SUPPORTED_REBUILD_SCOPES)[number];

export function isSupportedScope(scope: string): scope is RebuildScope {
  return (SUPPORTED_REBUILD_SCOPES as ReadonlyArray<string>).includes(scope);
}

// ---------------------------------------------------------------------------
// Source-row shapes (what each loader returns)
// ---------------------------------------------------------------------------

export interface NoteSourceRow {
  readonly noteId: number;
  readonly vaultId: number;
  readonly slug: string;
  readonly title: string;
  readonly currentVersionId: number | null;
}

export interface WikilinkSourceRow {
  readonly sourceNoteId: number;
  readonly sourceVersionId: number;
  readonly targetSlug: string;
  readonly targetNoteId: number | null;
}

export interface BaseSourceRow {
  readonly baseId: number;
  readonly workspaceId: number | null;
  readonly vaultId: number | null;
  readonly slug: string;
  readonly name: string;
}

export interface BaseRowSourceRow {
  readonly rowId: number;
  readonly baseId: number;
  readonly noteId: number | null;
}

// ---------------------------------------------------------------------------
// Injection bag
// ---------------------------------------------------------------------------

export interface RebuildReplayDeps {
  readonly worker: ProjectionSyncWorker;
  readonly loadNotes?: () => Promise<NoteSourceRow[]>;
  readonly loadWikilinks?: () => Promise<WikilinkSourceRow[]>;
  readonly loadBases?: () => Promise<BaseSourceRow[]>;
  readonly loadBaseRows?: () => Promise<BaseRowSourceRow[]>;
}

// ---------------------------------------------------------------------------
// Default ASDB-backed loaders
// ---------------------------------------------------------------------------

async function defaultLoadNotes(): Promise<NoteSourceRow[]> {
  const db = getAsDb();
  if (!db) return [];
  const rows = await db
    .select({
      noteId: agsVaultNotes.id,
      vaultId: agsVaultNotes.vaultId,
      slug: agsVaultNotes.slug,
      title: agsVaultNotes.title,
      currentVersionId: agsVaultNotes.currentVersionId,
    })
    .from(agsVaultNotes)
    .where(sql`${agsVaultNotes.deletedAt} IS NULL`)
    .orderBy(asc(agsVaultNotes.id));
  return rows;
}

async function defaultLoadWikilinks(): Promise<WikilinkSourceRow[]> {
  const db = getAsDb();
  if (!db) return [];
  const rows = await db
    .select({
      sourceNoteId: agsVaultWikilinks.sourceNoteId,
      sourceVersionId: agsVaultWikilinks.sourceVersionId,
      targetSlug: agsVaultWikilinks.targetSlug,
      targetNoteId: agsVaultWikilinks.targetNoteId,
    })
    .from(agsVaultWikilinks)
    .orderBy(asc(agsVaultWikilinks.id));
  // Drop unresolved wikilinks — the projection event requires a
  // resolved targetNoteId. The Postgres SoT still preserves them.
  return rows
    .filter((r) => r.targetNoteId !== null && r.sourceVersionId !== null)
    .map((r) => ({
      sourceNoteId: r.sourceNoteId,
      sourceVersionId: r.sourceVersionId as number,
      targetSlug: r.targetSlug,
      targetNoteId: r.targetNoteId,
    }));
}

async function defaultLoadBases(): Promise<BaseSourceRow[]> {
  const db = getAsDb();
  if (!db) return [];
  const rows = await db
    .select({
      baseId: agsBases.id,
      workspaceId: agsBases.workspaceId,
      vaultId: agsBases.vaultId,
      slug: agsBases.slug,
      name: agsBases.name,
    })
    .from(agsBases)
    .where(sql`${agsBases.archivedAt} IS NULL`)
    .orderBy(asc(agsBases.id));
  return rows;
}

async function defaultLoadBaseRows(): Promise<BaseRowSourceRow[]> {
  const db = getAsDb();
  if (!db) return [];
  const rows = await db
    .select({
      rowId: agsBaseRows.id,
      baseId: agsBaseRows.baseId,
      noteId: agsBaseRows.noteId,
    })
    .from(agsBaseRows)
    .orderBy(asc(agsBaseRows.id));
  return rows;
}

// ---------------------------------------------------------------------------
// Replay orchestrator
// ---------------------------------------------------------------------------

export interface ReplayCounts {
  readonly notes: number;
  readonly wikilinks: number;
  readonly bases: number;
  readonly baseRows: number;
}

export interface ReplayResult extends ProjectionResult {
  readonly scope: RebuildScope;
  readonly counts: ReplayCounts;
}

/**
 * Translates source rows into `ProjectionEvent`s and feeds them
 * through the sync worker. Returns an aggregated `ProjectionResult`
 * plus per-source-table counts so the operator can confirm the
 * replay touched every expected table.
 */
export async function replayProjectionScope(
  scope: string,
  deps: RebuildReplayDeps,
): Promise<ReplayResult> {
  const startedAt = Date.now();
  const aggregate: ProjectionResult = {
    nodesCreated: 0,
    nodesUpdated: 0,
    nodesDeleted: 0,
    edgesCreated: 0,
    edgesUpdated: 0,
    edgesDeleted: 0,
    durationMs: 0,
    errors: [],
  };
  const counts: { -readonly [K in keyof ReplayCounts]: ReplayCounts[K] } = {
    notes: 0,
    wikilinks: 0,
    bases: 0,
    baseRows: 0,
  };

  if (!isSupportedScope(scope)) {
    return {
      ...aggregate,
      scope: "vault_notes",
      counts,
      durationMs: Date.now() - startedAt,
      errors: [
        {
          write: { kind: "upsert_node", node: { typeKey: "_unknown", id: scope } },
          error: `unknown_scope: ${scope}`,
        } as unknown as ProjectionResult["errors"][number],
      ],
    };
  }

  const wants = (...scopes: RebuildScope[]) =>
    scope === "all" || scopes.includes(scope as RebuildScope);

  const events: ProjectionEvent[] = [];

  if (wants("vault_notes")) {
    const notes = await (deps.loadNotes ?? defaultLoadNotes)();
    counts.notes = notes.length;
    for (const n of notes) {
      if (n.currentVersionId == null) continue;
      events.push({
        kind: "note.created",
        payload: {
          noteId: n.noteId,
          vaultId: n.vaultId,
          slug: n.slug,
          title: n.title,
          versionId: n.currentVersionId,
        },
      });
    }
  }

  if (wants("wikilinks")) {
    const wikilinks = await (deps.loadWikilinks ?? defaultLoadWikilinks)();
    counts.wikilinks = wikilinks.length;
    for (const w of wikilinks) {
      events.push({
        kind: "wikilink.changed",
        payload: {
          sourceNoteId: w.sourceNoteId,
          sourceVersionId: w.sourceVersionId,
          targetSlug: w.targetSlug,
          targetNoteId: w.targetNoteId,
        },
      });
    }
  }

  if (wants("bases")) {
    const bases = await (deps.loadBases ?? defaultLoadBases)();
    counts.bases = bases.length;
    for (const b of bases) {
      events.push({
        kind: "base.created",
        payload: {
          baseId: b.baseId,
          workspaceId: b.workspaceId,
          vaultId: b.vaultId,
          slug: b.slug,
          name: b.name,
        },
      });
    }
    const rows = await (deps.loadBaseRows ?? defaultLoadBaseRows)();
    counts.baseRows = rows.length;
    for (const r of rows) {
      events.push({
        kind: "base.row_changed",
        payload: {
          rowId: r.rowId,
          baseId: r.baseId,
          noteId: r.noteId,
        },
      });
    }
  }

  // Feed every event through the sync worker, accumulating counts.
  for (const event of events) {
    try {
      const r = await deps.worker.handle(event);
      // The per-event result is a `ProjectionJobResult` with `writes`
      // (total touched) and `errors` (string[]). We don't have a
      // per-kind breakdown back from the worker — that lives on the
      // GraphRepository's ProjectionResult under the hood. Bump the
      // most appropriate aggregate counter: upserts dominate replay,
      // so credit nodesUpdated for each write. The rebuild row's
      // summary captures the per-table source counts separately.
      const writes = r.writes;
      // Heuristic split: upsert-heavy events dominate replay, so we
      // bias toward `nodesUpdated`. Edge upserts (wikilinks +
      // base.row_changed) contribute their writes to `edgesUpdated`
      // for operator-readable totals.
      if (event.kind === "wikilink.changed" || event.kind === "base.row_changed") {
        aggregate.edgesUpdated += writes;
      } else {
        aggregate.nodesUpdated += writes;
      }
      if (r.status === "failed") {
        for (const err of r.errors) {
          aggregate.errors.push({
            write: {
              kind: "upsert_node",
              node: { typeKey: event.kind, id: JSON.stringify(event.payload) },
            },
            error: err,
          } as unknown as ProjectionResult["errors"][number]);
        }
      }
    } catch (err) {
      aggregate.errors.push({
        write: {
          kind: "upsert_node",
          node: { typeKey: event.kind, id: JSON.stringify(event.payload) },
        },
        error: err instanceof Error ? err.message : String(err),
      } as unknown as ProjectionResult["errors"][number]);
    }
  }

  return {
    ...aggregate,
    scope: scope as RebuildScope,
    counts,
    durationMs: Date.now() - startedAt,
  };
}
