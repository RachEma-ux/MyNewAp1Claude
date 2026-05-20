/**
 * Behavior test for the rebuild-projection worker-side replay.
 *
 * Closes the partial-implementation gap from PR #1397 item 14
 * (rebuildProjection): the worker-side replay is wired and exercises
 * every supported scope via injected loaders + a stub sync worker.
 *
 * Asserts that:
 *   - `replayProjectionScope` translates source rows into the correct
 *     ProjectionEvent kinds and counts.
 *   - The scope taxonomy is closed (unknown scope returns an error,
 *     not a throw).
 *   - The aggregate ProjectionResult carries real counts (not zeros
 *     like the pre-closure placeholder), and per-event errors
 *     surface in the `errors` array without poisoning the replay.
 *   - Bases scope replays BOTH base rows AND their `base.row_changed`
 *     events.
 *   - `all` scope replays every source table.
 */

import { describe, expect, it } from "vitest";
import {
  replayProjectionScope,
  isSupportedScope,
  SUPPORTED_REBUILD_SCOPES,
  type NoteSourceRow,
  type WikilinkSourceRow,
  type BaseSourceRow,
  type BaseRowSourceRow,
} from "../../server/agent-studio/services/graph/projection/rebuild-replay";
import type {
  ProjectionEvent,
  ProjectionJobResult,
} from "../../server/agent-studio/services/graph/projection/sync-worker";

class RecordingWorker {
  public readonly seen: ProjectionEvent[] = [];
  public failOn = new Set<ProjectionEvent["kind"]>();
  async handle(event: ProjectionEvent): Promise<ProjectionJobResult> {
    this.seen.push(event);
    if (this.failOn.has(event.kind)) {
      return {
        eventKind: event.kind,
        status: "failed",
        writes: 0,
        errors: [`forced failure for ${event.kind}`],
        durationMs: 1,
      };
    }
    return {
      eventKind: event.kind,
      status: "completed",
      writes: 1,
      errors: [],
      durationMs: 1,
    };
  }
}

const SAMPLE_NOTES: NoteSourceRow[] = [
  { noteId: 1, vaultId: 1, slug: "alpha", title: "Alpha", currentVersionId: 11 },
  { noteId: 2, vaultId: 1, slug: "beta", title: "Beta", currentVersionId: 12 },
  // Notes without currentVersionId should NOT emit events.
  { noteId: 3, vaultId: 1, slug: "draft", title: "Draft", currentVersionId: null },
];
const SAMPLE_WIKILINKS: WikilinkSourceRow[] = [
  { sourceNoteId: 1, sourceVersionId: 11, targetSlug: "beta", targetNoteId: 2 },
  { sourceNoteId: 2, sourceVersionId: 12, targetSlug: "alpha", targetNoteId: 1 },
];
const SAMPLE_BASES: BaseSourceRow[] = [
  { baseId: 100, workspaceId: 1, vaultId: 1, slug: "tasks", name: "Tasks" },
];
const SAMPLE_BASE_ROWS: BaseRowSourceRow[] = [
  { rowId: 500, baseId: 100, noteId: 1 },
  { rowId: 501, baseId: 100, noteId: null },
];

function fixtureDeps(workerOverride?: RecordingWorker) {
  const worker = workerOverride ?? new RecordingWorker();
  return {
    worker: worker as unknown as RecordingWorker & {
      handle: (e: ProjectionEvent) => Promise<ProjectionJobResult>;
    },
    loadNotes: async () => SAMPLE_NOTES,
    loadWikilinks: async () => SAMPLE_WIKILINKS,
    loadBases: async () => SAMPLE_BASES,
    loadBaseRows: async () => SAMPLE_BASE_ROWS,
  };
}

describe("rebuild-projection replay", () => {
  describe("scope taxonomy", () => {
    it("exposes a closed list of supported scopes", () => {
      expect(SUPPORTED_REBUILD_SCOPES).toEqual([
        "vault_notes",
        "wikilinks",
        "bases",
        "all",
      ]);
    });

    it("isSupportedScope is a type-narrowing guard", () => {
      expect(isSupportedScope("vault_notes")).toBe(true);
      expect(isSupportedScope("bases")).toBe(true);
      expect(isSupportedScope("all")).toBe(true);
      expect(isSupportedScope("nope")).toBe(false);
    });
  });

  describe("vault_notes scope", () => {
    it("emits one note.created per note that has a currentVersionId", async () => {
      const worker = new RecordingWorker();
      const deps = fixtureDeps(worker);
      const result = await replayProjectionScope("vault_notes", deps);

      const kinds = worker.seen.map((e) => e.kind);
      expect(kinds).toEqual(["note.created", "note.created"]);
      expect(result.counts.notes).toBe(3); // loaded 3 rows
      expect(worker.seen.length).toBe(2); // but only 2 emitted (third has no version)
    });

    it("skips wikilinks and bases when scope is vault_notes only", async () => {
      const worker = new RecordingWorker();
      await replayProjectionScope("vault_notes", fixtureDeps(worker));
      const kinds = new Set(worker.seen.map((e) => e.kind));
      expect(kinds.has("wikilink.changed")).toBe(false);
      expect(kinds.has("base.created")).toBe(false);
      expect(kinds.has("base.row_changed")).toBe(false);
    });

    it("populates aggregate counts on the ProjectionResult", async () => {
      const result = await replayProjectionScope(
        "vault_notes",
        fixtureDeps(),
      );
      // 2 note events × 1 write each → nodesUpdated = 2
      expect(result.nodesUpdated).toBe(2);
      expect(result.edgesUpdated).toBe(0);
      expect(result.errors).toEqual([]);
    });
  });

  describe("wikilinks scope", () => {
    it("emits one wikilink.changed per resolved wikilink", async () => {
      const worker = new RecordingWorker();
      await replayProjectionScope("wikilinks", fixtureDeps(worker));
      expect(worker.seen.length).toBe(2);
      for (const e of worker.seen) {
        expect(e.kind).toBe("wikilink.changed");
      }
    });

    it("attributes wikilink writes to edgesUpdated", async () => {
      const result = await replayProjectionScope("wikilinks", fixtureDeps());
      expect(result.edgesUpdated).toBe(2);
      expect(result.nodesUpdated).toBe(0);
    });
  });

  describe("bases scope", () => {
    it("replays bases and their rows in order", async () => {
      const worker = new RecordingWorker();
      await replayProjectionScope("bases", fixtureDeps(worker));
      const kinds = worker.seen.map((e) => e.kind);
      // Bases first, then rows. Order matters for the projection
      // (base must exist before its rows attach).
      expect(kinds).toEqual([
        "base.created",
        "base.row_changed",
        "base.row_changed",
      ]);
    });

    it("populates both bases + baseRows counters", async () => {
      const result = await replayProjectionScope("bases", fixtureDeps());
      expect(result.counts.bases).toBe(1);
      expect(result.counts.baseRows).toBe(2);
    });
  });

  describe("all scope", () => {
    it("replays vault_notes + wikilinks + bases in that order", async () => {
      const worker = new RecordingWorker();
      await replayProjectionScope("all", fixtureDeps(worker));
      const kinds = worker.seen.map((e) => e.kind);
      // First note.created x 2, then wikilink.changed x 2, then
      // base.created x 1, then base.row_changed x 2.
      expect(kinds).toEqual([
        "note.created",
        "note.created",
        "wikilink.changed",
        "wikilink.changed",
        "base.created",
        "base.row_changed",
        "base.row_changed",
      ]);
    });

    it("populates every per-source counter", async () => {
      const result = await replayProjectionScope("all", fixtureDeps());
      expect(result.counts).toEqual({
        notes: 3,
        wikilinks: 2,
        bases: 1,
        baseRows: 2,
      });
    });
  });

  describe("unknown scope", () => {
    it("returns an error envelope instead of throwing", async () => {
      const result = await replayProjectionScope("nope", fixtureDeps());
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toContain("unknown_scope");
      // No events should have been dispatched.
      expect(result.nodesUpdated).toBe(0);
      expect(result.edgesUpdated).toBe(0);
    });
  });

  describe("failure tolerance", () => {
    it("a single failed event does not poison the replay", async () => {
      const worker = new RecordingWorker();
      worker.failOn = new Set(["wikilink.changed"]);
      const result = await replayProjectionScope("all", fixtureDeps(worker));
      expect(worker.seen.length).toBe(7); // every event still dispatched
      // 2 wikilink failures should surface in errors but the loop
      // continued and produced bases counts too.
      expect(result.errors.length).toBe(2);
      expect(result.counts.bases).toBe(1);
      expect(result.counts.baseRows).toBe(2);
    });
  });
});
