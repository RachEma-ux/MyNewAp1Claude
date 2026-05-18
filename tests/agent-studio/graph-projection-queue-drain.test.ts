/**
 * Graph Projection Queue Drain orchestrator.
 *
 * Validates the bridge between producer-side `enqueueProjectionJob`
 * writes (vault note CRUD via #1477/#1478) and consumer-side
 * `ProjectionSyncWorker.handle`. Pure orchestration — every external
 * dep is DI'd, so the suite runs without ASDB / Neo4j.
 *
 * Coverage:
 *   - happy path: pending rows translate, run through worker, flip to
 *     status='completed' with `errors=null`
 *   - failed path: worker emits errors → row flips to status='failed'
 *     with joined error message
 *   - unknown event kind: row marked 'unknown_event_kind' with
 *     descriptive lastError; drain continues to next row
 *   - malformed payload (missing required field): same path as unknown
 *   - exception in worker.handle (not just `errors[]`): caught,
 *     marked failed, drain continues
 *   - status update failure does not poison the drain
 *   - translator covers all 4 currently-wired event kinds with type
 *     guards on each required field
 */

import { describe, expect, it, vi } from "vitest";

import { readFileSync } from "fs";
import { resolve } from "path";

import {
  drainPendingProjectionJobs,
  translatePendingRowToEvent,
  MAX_DRAIN_RETRY_ATTEMPTS,
} from "../../server/agent-studio/services/graph/projection/queue-drain.js";
import type {
  PendingProjectionJobRow,
  ProjectionRowStatus,
} from "../../server/agent-studio/services/graph/projection/queue-drain.js";
import type {
  ProjectionEvent,
  ProjectionJobResult,
  ProjectionSyncWorker,
} from "../../server/agent-studio/services/graph/projection/sync-worker.js";

// ---------------------------------------------------------------------------
// Stub worker
// ---------------------------------------------------------------------------

function buildStubWorker(
  responses: Map<ProjectionEvent["kind"], ProjectionJobResult>,
): ProjectionSyncWorker {
  return {
    handle: async (event: ProjectionEvent): Promise<ProjectionJobResult> => {
      const r = responses.get(event.kind);
      if (!r) {
        return {
          eventKind: event.kind,
          status: "completed",
          writes: 0,
          errors: [],
          durationMs: 1,
        };
      }
      return r;
    },
  } as unknown as ProjectionSyncWorker;
}

function buildCompletedResult(
  event: ProjectionEvent,
  writes: number,
): ProjectionJobResult {
  return {
    eventKind: event.kind,
    status: "completed",
    writes,
    errors: [],
    durationMs: 10,
  };
}

// ---------------------------------------------------------------------------
// translatePendingRowToEvent — type-guard coverage
// ---------------------------------------------------------------------------

describe("translatePendingRowToEvent", () => {
  const baseRow = (overrides: Partial<PendingProjectionJobRow>) =>
    ({
      id: 1,
      projectionKey: "test",
      triggerEvent: "note.created",
      triggerPayload: {},
      ...overrides,
    }) satisfies PendingProjectionJobRow;

  it("translates note.created with all 5 fields present", () => {
    const event = translatePendingRowToEvent(
      baseRow({
        triggerEvent: "note.created",
        triggerPayload: {
          noteId: 10,
          vaultId: 1,
          slug: "alpha",
          title: "Alpha",
          versionId: 50,
        },
      }),
    );
    expect(event).toEqual({
      kind: "note.created",
      payload: {
        noteId: 10,
        vaultId: 1,
        slug: "alpha",
        title: "Alpha",
        versionId: 50,
      },
    });
  });

  it("translates note.updated identically to note.created (shape parity)", () => {
    const event = translatePendingRowToEvent(
      baseRow({
        triggerEvent: "note.updated",
        triggerPayload: {
          noteId: 10,
          vaultId: 1,
          slug: "alpha",
          title: "Alpha v2",
          versionId: 99,
        },
      }),
    );
    expect(event?.kind).toBe("note.updated");
  });

  it("translates note.deleted with only noteId", () => {
    const event = translatePendingRowToEvent(
      baseRow({
        triggerEvent: "note.deleted",
        triggerPayload: { noteId: 42 },
      }),
    );
    expect(event).toEqual({
      kind: "note.deleted",
      payload: { noteId: 42 },
    });
  });

  it("translates wikilink.changed with required + optional fields", () => {
    const event = translatePendingRowToEvent(
      baseRow({
        triggerEvent: "wikilink.changed",
        triggerPayload: {
          sourceVersionId: 50,
          targetSlug: "beta",
          targetNoteId: 11,
        },
      }),
    );
    expect(event?.kind).toBe("wikilink.changed");
    if (event?.kind === "wikilink.changed") {
      expect(event.payload.targetSlug).toBe("beta");
      expect(event.payload.targetNoteId).toBe(11);
    }
  });

  it("returns null for missing required fields (note.created without slug)", () => {
    const event = translatePendingRowToEvent(
      baseRow({
        triggerEvent: "note.created",
        triggerPayload: { noteId: 10, vaultId: 1, title: "x", versionId: 50 },
      }),
    );
    expect(event).toBeNull();
  });

  it("returns null for type-mismatch on required field (noteId as string)", () => {
    const event = translatePendingRowToEvent(
      baseRow({
        triggerEvent: "note.deleted",
        triggerPayload: { noteId: "42" }, // string, not number
      }),
    );
    expect(event).toBeNull();
  });

  it("returns null for unknown triggerEvent", () => {
    const event = translatePendingRowToEvent(
      baseRow({
        triggerEvent: "made.up.event.kind",
        triggerPayload: { whatever: true },
      }),
    );
    expect(event).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// drainPendingProjectionJobs — orchestration
// ---------------------------------------------------------------------------

describe("drainPendingProjectionJobs", () => {
  it("happy path: row translates, worker succeeds, status flips to completed", async () => {
    const pending: PendingProjectionJobRow[] = [
      {
        id: 1,
        projectionKey: "vault_note:10",
        triggerEvent: "note.created",
        triggerPayload: {
          noteId: 10,
          vaultId: 1,
          slug: "alpha",
          title: "Alpha",
          versionId: 50,
        },
      },
    ];
    const statusUpdates: Array<{
      rowId: number;
      status: ProjectionRowStatus;
      lastError: string | null;
    }> = [];
    const worker = buildStubWorker(
      new Map([
        ["note.created", buildCompletedResult({ kind: "note.created" } as ProjectionEvent, 3)],
      ]),
    );

    const summary = await drainPendingProjectionJobs({
      fetchPending: async () => pending,
      updateRowStatus: async (rowId, status, lastError) => {
        statusUpdates.push({ rowId, status, lastError });
      },
      worker,
    });

    expect(summary).toMatchObject({
      processed: 1,
      completed: 1,
      failed: 0,
      unknownEventKind: 0,
    });
    expect(summary.outcomes[0]!.writes).toBe(3);
    expect(statusUpdates).toEqual([
      { rowId: 1, status: "completed", lastError: null },
    ]);
  });

  it("failed path: worker emits errors → status='failed' + joined lastError", async () => {
    const pending: PendingProjectionJobRow[] = [
      {
        id: 2,
        projectionKey: "vault_note:20",
        triggerEvent: "note.updated",
        triggerPayload: {
          noteId: 20,
          vaultId: 1,
          slug: "beta",
          title: "Beta",
          versionId: 51,
        },
      },
    ];
    const statusUpdates: Array<{ status: ProjectionRowStatus; lastError: string | null }> = [];
    const worker = {
      handle: async (event: ProjectionEvent) => ({
        eventKind: event.kind,
        status: "failed" as const,
        writes: 1,
        errors: ["neo4j unreachable", "edge id collision"],
        durationMs: 5,
      }),
    } as unknown as ProjectionSyncWorker;

    const summary = await drainPendingProjectionJobs({
      fetchPending: async () => pending,
      updateRowStatus: async (rowId, status, lastError) => {
        statusUpdates.push({ status, lastError });
      },
      worker,
    });

    expect(summary.failed).toBe(1);
    expect(statusUpdates[0]).toEqual({
      status: "failed",
      lastError: "neo4j unreachable; edge id collision",
    });
  });

  it("unknown event kind: marked + drain continues to next row", async () => {
    const pending: PendingProjectionJobRow[] = [
      {
        id: 3,
        projectionKey: "x",
        triggerEvent: "made.up.event",
        triggerPayload: {},
      },
      {
        id: 4,
        projectionKey: "vault_note:30",
        triggerEvent: "note.deleted",
        triggerPayload: { noteId: 30 },
      },
    ];
    const statusUpdates: Array<{
      rowId: number;
      status: ProjectionRowStatus;
    }> = [];
    const worker = buildStubWorker(
      new Map([
        ["note.deleted", buildCompletedResult({ kind: "note.deleted" } as ProjectionEvent, 1)],
      ]),
    );

    const summary = await drainPendingProjectionJobs({
      fetchPending: async () => pending,
      updateRowStatus: async (rowId, status) => {
        statusUpdates.push({ rowId, status });
      },
      worker,
    });

    expect(summary).toMatchObject({
      processed: 2,
      completed: 1,
      failed: 0,
      unknownEventKind: 1,
    });
    expect(statusUpdates).toEqual([
      { rowId: 3, status: "unknown_event_kind" },
      { rowId: 4, status: "completed" },
    ]);
  });

  it("exception in worker.handle: caught, marked failed, drain continues", async () => {
    const pending: PendingProjectionJobRow[] = [
      {
        id: 5,
        projectionKey: "vault_note:40",
        triggerEvent: "note.deleted",
        triggerPayload: { noteId: 40 },
      },
      {
        id: 6,
        projectionKey: "vault_note:41",
        triggerEvent: "note.deleted",
        triggerPayload: { noteId: 41 },
      },
    ];
    let firstCall = true;
    const worker = {
      handle: async (event: ProjectionEvent) => {
        if (firstCall) {
          firstCall = false;
          throw new Error("boom");
        }
        return buildCompletedResult(event, 1);
      },
    } as unknown as ProjectionSyncWorker;

    const summary = await drainPendingProjectionJobs({
      fetchPending: async () => pending,
      updateRowStatus: async () => {},
      worker,
    });

    expect(summary.processed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.outcomes[0]!.errors[0]).toBe("boom");
  });

  it("status update failure is logged but does not poison the drain", async () => {
    const pending: PendingProjectionJobRow[] = [
      {
        id: 7,
        projectionKey: "vault_note:50",
        triggerEvent: "note.deleted",
        triggerPayload: { noteId: 50 },
      },
    ];
    const worker = buildStubWorker(
      new Map([
        ["note.deleted", buildCompletedResult({ kind: "note.deleted" } as ProjectionEvent, 1)],
      ]),
    );
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const summary = await drainPendingProjectionJobs({
      fetchPending: async () => pending,
      updateRowStatus: async () => {
        throw new Error("db connection lost");
      },
      worker,
    });

    expect(summary.processed).toBe(1);
    expect(summary.completed).toBe(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("status update failed"),
      expect.any(Error),
    );
    consoleWarnSpy.mockRestore();
  });

  it("limit caps the fetcher invocation argument", async () => {
    const seenLimits: number[] = [];
    await drainPendingProjectionJobs({
      limit: 17,
      fetchPending: async (limit) => {
        seenLimits.push(limit);
        return [];
      },
      updateRowStatus: async () => {},
      worker: buildStubWorker(new Map()),
    });
    expect(seenLimits).toEqual([17]);
  });
});

// ---------------------------------------------------------------------------
// Retry-with-backoff (default loaders only — source-scan)
// ---------------------------------------------------------------------------

const DRAIN_SRC_PATH = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/projection/queue-drain.ts",
);
const drainSrc = readFileSync(DRAIN_SRC_PATH, "utf8");

describe("default loaders — retry-with-backoff", () => {
  it("exports MAX_DRAIN_RETRY_ATTEMPTS = 3", () => {
    expect(MAX_DRAIN_RETRY_ATTEMPTS).toBe(3);
  });

  it("default fetcher includes failed rows under the retry cap (OR clause)", () => {
    // SQL shape: status='pending' OR (status='failed' AND retry_count < MAX)
    expect(drainSrc).toMatch(
      /or\(\s*eq\(agsGraphProjectionSyncJobs\.status,\s*["']pending["']\)/,
    );
    expect(drainSrc).toMatch(
      /eq\(agsGraphProjectionSyncJobs\.status,\s*["']failed["']\)/,
    );
    expect(drainSrc).toMatch(
      /lt\(\s*agsGraphProjectionSyncJobs\.retryCount,\s*MAX_DRAIN_RETRY_ATTEMPTS\s*,?\s*\)/,
    );
  });

  it("default updater increments retry_count on 'failed' (Postgres-side sql template)", () => {
    expect(drainSrc).toMatch(
      /status\s*===\s*["']failed["'][\s\S]*?retryCount:\s*sql`\$\{agsGraphProjectionSyncJobs\.retryCount\}\s*\+\s*1`/,
    );
  });

  it("default updater does NOT touch retry_count on 'completed' or 'unknown_event_kind'", () => {
    // The non-failed branch sets only status/lastError/completedAt/updatedAt.
    // Snapshot the shape via a literal match — when this regression-
    // proofs the implementation, the next refactor surfaces the
    // intent in code review.
    const elseBranch = drainSrc.match(
      /:\s*\{\s*status,\s*lastError,\s*completedAt:\s*new Date\(\),\s*updatedAt:\s*new Date\(\),\s*\}/,
    );
    expect(elseBranch).not.toBeNull();
  });
});
