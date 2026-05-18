/**
 * Vault → Knowledge Graph projection — update + delete symmetry.
 *
 * Closes the asymmetry surfaced after #1477 (`note.created` enqueue
 * shipped, sync-worker had cases only for `note.created`). Both
 * `note.updated` and `note.deleted` jobs would silently produce zero
 * writes — declared in the ProjectionEvent union, but no case in
 * the sync-worker switch.
 *
 *   1. sync-worker handles `note.updated` (upsert NoteVersion + edge)
 *   2. sync-worker handles `note.deleted` (delete_node — Neo4j DETACH
 *      cascades NoteVersion + LINKS_TO + VERSION_OF)
 *   3. router.deleteNote fires `enqueueVaultNoteDeletion`
 *   4. note.updated payload shape aligned with note.created (so the
 *      producer's emit and the consumer's switch agree)
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { ProjectionSyncWorker } from "../../server/agent-studio/services/graph/projection/sync-worker.js";
import type {
  ProjectionEvent,
  ProjectionJobResult,
} from "../../server/agent-studio/services/graph/projection/sync-worker.js";
import {
  enqueueVaultNoteDeletion,
} from "../../server/agent-studio/services/vault/graph-projection.js";
import type {
  GraphRepository,
  ProjectionSyncJobInput,
  ProjectionWrite,
} from "../../server/agent-studio/services/graph/repository/types.js";

// ---------------------------------------------------------------------------
// Sync-worker — note.updated + note.deleted case coverage
// ---------------------------------------------------------------------------

function buildStubGraphRepoForApply(): {
  graphRepo: GraphRepository;
  applied: ProjectionWrite[][];
} {
  const applied: ProjectionWrite[][] = [];
  const applyProjectionJob = async (writes: ProjectionWrite[]) => {
    applied.push(writes);
    return {
      nodesCreated: 0,
      nodesUpdated: 0,
      nodesDeleted: 0,
      edgesCreated: 0,
      edgesUpdated: 0,
      edgesDeleted: 0,
      durationMs: 0,
      errors: [],
    };
  };
  const graphRepo = new Proxy(
    { applyProjectionJob },
    {
      get(target, prop) {
        if (prop === "applyProjectionJob") return applyProjectionJob;
        throw new Error(
          `[stub-graph-repo] unexpected method access: ${String(prop)}`,
        );
      },
    },
  ) as unknown as GraphRepository;
  return { graphRepo, applied };
}

describe("ProjectionSyncWorker — note.updated case", () => {
  it("emits upsert_node Note + upsert_node NoteVersion + upsert_edge VERSION_OF", async () => {
    const { graphRepo, applied } = buildStubGraphRepoForApply();
    const worker = new ProjectionSyncWorker({ repository: graphRepo });
    const event: ProjectionEvent = {
      kind: "note.updated",
      payload: {
        noteId: 7,
        vaultId: 1,
        slug: "alpha",
        title: "Alpha v2",
        versionId: 99,
      },
    };

    const result: ProjectionJobResult = await worker.handle(event);
    expect(result.status).toBe("completed");

    const writes = applied[0]!;
    expect(writes).toHaveLength(3);
    expect(writes[0]!.kind).toBe("upsert_node");
    expect(writes[0]!.node!.typeKey).toBe("Note");
    expect(writes[0]!.node!.id).toBe("note:7");
    expect(writes[0]!.node!.properties).toEqual({ slug: "alpha", title: "Alpha v2" });

    expect(writes[1]!.kind).toBe("upsert_node");
    expect(writes[1]!.node!.typeKey).toBe("NoteVersion");
    expect(writes[1]!.node!.id).toBe("note_version:99");

    expect(writes[2]!.kind).toBe("upsert_edge");
    expect(writes[2]!.edge!.typeKey).toBe("VERSION_OF");
    expect(writes[2]!.edge!.id).toBe("version_of:99");
    expect(writes[2]!.edge!.sourceNode.id).toBe("note_version:99");
    expect(writes[2]!.edge!.targetNode.id).toBe("note:7");
  });
});

describe("ProjectionSyncWorker — note.deleted case", () => {
  it("emits exactly one delete_node for the Note", async () => {
    const { graphRepo, applied } = buildStubGraphRepoForApply();
    const worker = new ProjectionSyncWorker({ repository: graphRepo });
    const event: ProjectionEvent = {
      kind: "note.deleted",
      payload: { noteId: 42 },
    };

    const result: ProjectionJobResult = await worker.handle(event);
    expect(result.status).toBe("completed");

    const writes = applied[0]!;
    expect(writes).toHaveLength(1);
    expect(writes[0]!.kind).toBe("delete_node");
    expect(writes[0]!.node!.typeKey).toBe("Note");
    expect(writes[0]!.node!.id).toBe("note:42");
  });
});

// ---------------------------------------------------------------------------
// enqueueVaultNoteDeletion — projection job shape
// ---------------------------------------------------------------------------

function buildStubGraphRepoForEnqueue(): {
  graphRepo: GraphRepository;
  jobs: (ProjectionSyncJobInput & { jobId: number })[];
} {
  const jobs: (ProjectionSyncJobInput & { jobId: number })[] = [];
  let nextId = 200;
  const enqueueProjectionJob = async (input: ProjectionSyncJobInput) => {
    const jobId = nextId++;
    jobs.push({ ...input, jobId });
    return { jobId };
  };
  const graphRepo = new Proxy(
    { enqueueProjectionJob },
    {
      get(target, prop) {
        if (prop === "enqueueProjectionJob") return enqueueProjectionJob;
        throw new Error(
          `[stub-graph-repo] unexpected method access: ${String(prop)}`,
        );
      },
    },
  ) as unknown as GraphRepository;
  return { graphRepo, jobs };
}

describe("enqueueVaultNoteDeletion", () => {
  it("enqueues a single note.deleted job with the noteId payload", async () => {
    const { graphRepo, jobs } = buildStubGraphRepoForEnqueue();
    const result = await enqueueVaultNoteDeletion(
      { noteId: 42 },
      { graphRepo },
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.projectionKey).toBe("vault_note:42");
    expect(jobs[0]!.triggerEvent).toBe("note.deleted");
    expect(jobs[0]!.triggerPayload).toEqual({ noteId: 42 });
    expect(result.jobId).toBe(jobs[0]!.jobId);
  });
});

// ---------------------------------------------------------------------------
// router — deleteNote fires the deletion enqueue
// ---------------------------------------------------------------------------

const ROUTER = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/router.ts",
);
const routerSrc = readFileSync(ROUTER, "utf8");

describe("router — deleteNote graph projection wiring", () => {
  it("declares a `fireGraphProjectionDeletion` helper", () => {
    expect(routerSrc).toMatch(/function fireGraphProjectionDeletion\(/);
  });

  it("the helper lazy-imports enqueueVaultNoteDeletion", () => {
    expect(routerSrc).toContain("enqueueVaultNoteDeletion");
  });

  it("deleteNote fires the deletion enqueue only on result.deleted", () => {
    expect(routerSrc).toMatch(
      /deleteNote[\s\S]*?if \(result\.deleted\)[\s\S]*?fireGraphProjectionDeletion\(input\.noteId\)/,
    );
  });

  it("deletion enqueue is fire-and-forget (void prefix)", () => {
    expect(routerSrc).toMatch(/void fireGraphProjectionDeletion\(/);
  });
});

// ---------------------------------------------------------------------------
// ProjectionEvent type — note.updated payload alignment
// ---------------------------------------------------------------------------

const SYNC_WORKER = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/projection/sync-worker.ts",
);
const syncSrc = readFileSync(SYNC_WORKER, "utf8");

describe("sync-worker — note.updated payload shape", () => {
  it("note.updated payload now matches note.created (vaultId+slug+title+versionId)", () => {
    expect(syncSrc).toMatch(
      /kind: "note\.updated"; payload: \{[^}]*vaultId: number[^}]*slug: string[^}]*title: string[^}]*versionId: number/,
    );
  });

  it("switch statement has a case for note.updated", () => {
    expect(syncSrc).toMatch(/case "note\.updated":/);
  });

  it("switch statement has a case for note.deleted", () => {
    expect(syncSrc).toMatch(/case "note\.deleted":/);
  });
});
