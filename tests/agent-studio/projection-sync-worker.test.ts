/**
 * Phase 1.7 / 7.5 — projection sync worker tests.
 *
 * Pure unit tests via TestGraphRepository. No DB / Neo4j.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TestGraphRepository } from "../../server/agent-studio/services/graph/repository/index.js";
import {
  ProjectionSyncWorker,
  type ProjectionEvent,
} from "../../server/agent-studio/services/graph/projection/public-api.js";

describe("ProjectionSyncWorker — event → ProjectionWrite mapping", () => {
  let repo: TestGraphRepository;
  let worker: ProjectionSyncWorker;

  beforeEach(() => {
    repo = new TestGraphRepository();
    worker = new ProjectionSyncWorker({ repository: repo });
  });

  it("note.created projects Note + NoteVersion + VERSION_OF edge", async () => {
    const event: ProjectionEvent = {
      kind: "note.created",
      payload: { noteId: 1, vaultId: 10, slug: "hello", title: "Hello", versionId: 100 },
    };
    const result = await worker.handle(event);
    expect(result.status).toBe("completed");
    expect(result.errors).toEqual([]);
    expect(repo._nodeCount()).toBe(2); // Note + NoteVersion
    expect(repo._edgeCount()).toBe(1); // VERSION_OF
  });

  it("wikilink.changed projects LINKS_TO edge when target exists", async () => {
    // Seed source + target
    await worker.handle({
      kind: "note.created",
      payload: { noteId: 1, vaultId: 10, slug: "a", title: "A", versionId: 100 },
    });
    await worker.handle({
      kind: "note.created",
      payload: { noteId: 2, vaultId: 10, slug: "b", title: "B", versionId: 200 },
    });
    const event: ProjectionEvent = {
      kind: "wikilink.changed",
      payload: { sourceNoteId: 1, sourceVersionId: 100, targetSlug: "b", targetNoteId: 2 },
    };
    const result = await worker.handle(event);
    expect(result.status).toBe("completed");
    // 1 new LINKS_TO edge on top of 2 VERSION_OF
    expect(repo._edgeCount()).toBe(3);
  });

  it("wikilink.changed skips projection when target unresolved", async () => {
    const event: ProjectionEvent = {
      kind: "wikilink.changed",
      payload: { sourceNoteId: 1, sourceVersionId: 100, targetSlug: "missing", targetNoteId: null },
    };
    const result = await worker.handle(event);
    expect(result.status).toBe("completed");
    expect(result.writes).toBe(0);
  });

  it("runtime_trace.created projects RuntimeTrace node", async () => {
    const event: ProjectionEvent = {
      kind: "runtime_trace.created",
      payload: { runtimeRunId: 999 },
    };
    const result = await worker.handle(event);
    expect(result.status).toBe("completed");
    expect(repo._nodeCount()).toBe(1);
  });

  it("promotion.approved projects PROMOTED_TO edge", async () => {
    const event: ProjectionEvent = {
      kind: "promotion.approved",
      payload: {
        promotionId: 5,
        promotionKind: "cag_block",
        noteId: 1,
        noteVersionId: 100,
        targetAssetId: 42,
      },
    };
    const result = await worker.handle(event);
    expect(result.status).toBe("completed");
    expect(repo._edgeCount()).toBe(1);
  });
});
