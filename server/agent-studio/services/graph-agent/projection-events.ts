/**
 * Native Graph Workspace — Postgres-side trace projection-intent service.
 *
 * Phase 14 §6/§7 infrastructure. Persists "the projection layer should
 * write graph nodes + edges for this trace" intents to `ags_runtime_graph_events`,
 * and exposes the drain surface a future Phase 7.5 Neo4j worker will use:
 *
 *   - `recordTraceProjectionIntent` — Graph Agent runtime + decision-trace
 *     writers call this when a trace lands. Postgres rows are the
 *     authoritative source; the worker projects them into Neo4j.
 *   - `listPendingProjectionEvents` — the worker drains `applied=false`
 *     rows in FIFO order.
 *   - `markEventApplied` — worker flips `applied=true` and stamps the
 *     Neo4j refs that were created (used by Phase 19 drift detection).
 *   - `markEventFailed` — worker records `lastError` without flipping
 *     `applied`, so the row is retried.
 *
 * Source-of-truth invariant: a catastrophic Neo4j loss is recovered by
 * replaying `applied=true` rows from this table (Phase 7.5 worker pulls
 * `applied=true` rows in createdAt order and re-projects). The ADR
 * `docs/architecture/agent-studio-postgres-neo4j-responsibility-split.md`
 * locks the invariant.
 *
 * Phase 7.5 wired the Neo4j worker (`ProjectionSyncWorker`) — this
 * service writes the "writer side" rows; the worker drains them via
 * the every-5-minute projection-drain cron (env-gated via
 * `AGS_PROJECTION_DRAIN_CRON_DISABLED`). End-to-end shipped 2026-05-18
 * across PRs #1476-#1488.
 *
 * Failure mode: ASDB unavailable → typed `AsdbUnavailableError`. Callers
 * upstream (Graph Agent runtime + decision-trace writer) catch this and
 * downgrade to "trace recorded; projection intent not persisted" — they
 * never block the runtime path on Neo4j-bridge availability.
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md §1.6
 */

import { and, asc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsRuntimeGraphEvents } from "../../../../drizzle/tables/agent-studio-graph-projection.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export class ProjectionEventNotFoundError extends Error {
  constructor(public readonly id: number) {
    super(`Runtime graph event ${id} not found`);
    this.name = "ProjectionEventNotFoundError";
  }
}

/**
 * Closed-taxonomy runtime graph event kind. Promoted to a tuple at
 * T-G.55 so the metadata table + lockstep tests can be authored.
 */
export const RUNTIME_GRAPH_EVENT_KINDS = [
  "runtime_trace",
  "decision_trace",
] as const;
export type RuntimeGraphEventKind = (typeof RUNTIME_GRAPH_EVENT_KINDS)[number];

// ============================================================================
// Per-event-kind operator-facing metadata (T-G.55)
// ============================================================================

export interface RuntimeGraphEventKindMetadata {
  /** Display label rendered in the projection-events admin panel. */
  readonly label: string;
  /** Short operator-facing description of what this event kind
   *  carries on its payload and when the projector emits it. */
  readonly description: string;
  /** Whether the event records an agent decision (true for
   *  `decision_trace`; false for `runtime_trace` which captures the
   *  ambient runtime context around the decision). */
  readonly isDecision: boolean;
}

export const RUNTIME_GRAPH_EVENT_KIND_METADATA: Readonly<
  Record<RuntimeGraphEventKind, RuntimeGraphEventKindMetadata>
> = {
  runtime_trace: {
    label: "Runtime Trace",
    description:
      "Captures ambient runtime context — token usage, latency budgets, retrieval planner state, dispatcher receipts. Sets the scene for the decision.",
    isDecision: false,
  },
  decision_trace: {
    label: "Decision Trace",
    description:
      "Captures the agent's chosen action — selected planner mode, tool call, refusal, or terminal answer. The decision itself, distinct from its surrounding runtime context.",
    isDecision: true,
  },
};

export function getRuntimeGraphEventKindMetadata(
  kind: RuntimeGraphEventKind,
): RuntimeGraphEventKindMetadata {
  return RUNTIME_GRAPH_EVENT_KIND_METADATA[kind];
}

export interface RuntimeGraphEvent {
  readonly id: number;
  readonly eventKind: RuntimeGraphEventKind;
  readonly runtimeRunId: number;
  readonly graphAgentRunId: number | null;
  readonly payload: Record<string, unknown>;
  readonly applied: boolean;
  readonly neo4jRefs: Record<string, unknown> | null;
  readonly appliedAt: Date | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
}

export interface RecordTraceProjectionIntentInput {
  readonly eventKind: RuntimeGraphEventKind;
  readonly runtimeRunId: number;
  readonly graphAgentRunId?: number | null;
  readonly payload: Record<string, unknown>;
}

export interface ListPendingProjectionEventsInput {
  readonly eventKind?: RuntimeGraphEventKind;
  readonly limit?: number;
}

export interface ProjectionEventsOptions {
  readonly getDb?: typeof getAsDb;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function rowToEvent(row: {
  id: number;
  eventKind: string;
  runtimeRunId: number;
  graphAgentRunId: number | null;
  payload: Record<string, unknown>;
  applied: boolean;
  neo4jRefs: Record<string, unknown> | null;
  appliedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}): RuntimeGraphEvent {
  return {
    id: row.id,
    eventKind: row.eventKind as RuntimeGraphEventKind,
    runtimeRunId: row.runtimeRunId,
    graphAgentRunId: row.graphAgentRunId,
    payload: row.payload,
    applied: row.applied,
    neo4jRefs: row.neo4jRefs,
    appliedAt: row.appliedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
  };
}

export async function recordTraceProjectionIntent(
  input: RecordTraceProjectionIntentInput,
  options: ProjectionEventsOptions = {},
): Promise<RuntimeGraphEvent> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const inserted = await db
    .insert(agsRuntimeGraphEvents)
    .values({
      eventKind: input.eventKind,
      runtimeRunId: input.runtimeRunId,
      graphAgentRunId: input.graphAgentRunId ?? null,
      payload: input.payload,
      applied: false,
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error("Failed to insert runtime graph event row");
  return rowToEvent(row as never);
}

export async function listPendingProjectionEvents(
  input: ListPendingProjectionEventsInput = {},
  options: ProjectionEventsOptions = {},
): Promise<readonly RuntimeGraphEvent[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const limit = Math.min(
    Math.max(input.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const where = input.eventKind
    ? and(
        eq(agsRuntimeGraphEvents.applied, false),
        eq(agsRuntimeGraphEvents.eventKind, input.eventKind),
      )
    : eq(agsRuntimeGraphEvents.applied, false);

  const rows = await db
    .select()
    .from(agsRuntimeGraphEvents)
    .where(where)
    .orderBy(asc(agsRuntimeGraphEvents.createdAt))
    .limit(limit);

  return rows.map((r) => rowToEvent(r as never));
}

export async function markEventApplied(
  id: number,
  neo4jRefs: Record<string, unknown> | null,
  options: ProjectionEventsOptions = {},
): Promise<RuntimeGraphEvent> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const updated = await db
    .update(agsRuntimeGraphEvents)
    .set({
      applied: true,
      neo4jRefs,
      appliedAt: new Date(),
      lastError: null,
    })
    .where(eq(agsRuntimeGraphEvents.id, id))
    .returning();

  const row = updated[0];
  if (!row) throw new ProjectionEventNotFoundError(id);
  return rowToEvent(row as never);
}

export async function markEventFailed(
  id: number,
  error: string,
  options: ProjectionEventsOptions = {},
): Promise<RuntimeGraphEvent> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const updated = await db
    .update(agsRuntimeGraphEvents)
    .set({ lastError: error })
    .where(eq(agsRuntimeGraphEvents.id, id))
    .returning();

  const row = updated[0];
  if (!row) throw new ProjectionEventNotFoundError(id);
  return rowToEvent(row as never);
}
