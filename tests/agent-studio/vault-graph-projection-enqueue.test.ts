/**
 * Vault → Knowledge Graph projection enqueue.
 *
 * Closes step 8 of the Phase 5b note-version pipeline (public-api.ts:194):
 *   1. note.created / note.updated → 1 sync-job per note version
 *   2. wikilink.changed → 1 sync-job per resolved [[wikilink]]
 *   3. unresolved wikilinks drop (no row in queue), surfaced separately
 *      via the result's `unresolvedSlugs[]`
 *   4. self-links (note's own slug appearing in its own contentMd) drop
 *
 * Structural tests on top of behavioral lock the router wiring so the
 * fire-and-forget hook on createNote / updateNote can't silently regress.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  enqueueVaultNoteProjection,
} from "../../server/agent-studio/services/vault/graph-projection.js";
import type {
  GraphRepository,
  ProjectionSyncJobInput,
} from "../../server/agent-studio/services/graph/repository/types.js";
import type { VaultRepository } from "../../server/agent-studio/services/vault/repository.js";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface RecordedJob extends ProjectionSyncJobInput {
  readonly jobId: number;
}

function buildStubGraphRepo(): {
  graphRepo: GraphRepository;
  jobs: RecordedJob[];
} {
  const jobs: RecordedJob[] = [];
  let nextId = 100;
  const enqueueProjectionJob = async (input: ProjectionSyncJobInput) => {
    const jobId = nextId++;
    jobs.push({ ...input, jobId });
    return { jobId };
  };
  // The function only touches enqueueProjectionJob; the rest of
  // GraphRepository can stay un-stubbed (Proxy throws if anything
  // else is touched, catching accidental coupling).
  const graphRepo = new Proxy(
    { enqueueProjectionJob },
    {
      get(target, prop, receiver) {
        if (prop === "enqueueProjectionJob") return enqueueProjectionJob;
        throw new Error(
          `[stub-graph-repo] unexpected method access: ${String(prop)}`,
        );
      },
    },
  ) as unknown as GraphRepository;
  return { graphRepo, jobs };
}

function buildStubVaultRepo(
  notes: Array<{ id: number; slug: string }>,
): VaultRepository {
  const listNotesInVault = async () =>
    notes.map((n) => ({
      id: n.id,
      vaultId: 1,
      slug: n.slug,
      title: n.slug,
      currentVersionId: 1,
      governanceStatus: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  return new Proxy(
    { listNotesInVault },
    {
      get(target, prop, receiver) {
        if (prop === "listNotesInVault") return listNotesInVault;
        throw new Error(
          `[stub-vault-repo] unexpected method access: ${String(prop)}`,
        );
      },
    },
  ) as unknown as VaultRepository;
}

// ---------------------------------------------------------------------------
// Behavioral tests
// ---------------------------------------------------------------------------

describe("enqueueVaultNoteProjection", () => {
  it("emits a single note-level job with the operator-supplied eventKind", async () => {
    const { graphRepo, jobs } = buildStubGraphRepo();
    const repo = buildStubVaultRepo([
      { id: 10, slug: "alpha" },
      { id: 11, slug: "beta" },
    ]);

    const result = await enqueueVaultNoteProjection(
      {
        vaultId: 1,
        noteId: 10,
        versionId: 50,
        slug: "alpha",
        title: "Alpha",
        contentMd: "no wikilinks here",
        eventKind: "note.created",
      },
      { graphRepo, repo },
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.projectionKey).toBe("vault_note:10");
    expect(jobs[0]!.triggerEvent).toBe("note.created");
    expect(jobs[0]!.triggerPayload).toEqual({
      noteId: 10,
      versionId: 50,
      slug: "alpha",
      title: "Alpha",
      vaultId: 1,
    });
    expect(result.noteJobId).toBe(jobs[0]!.jobId);
    expect(result.wikilinkJobIds).toEqual([]);
    expect(result.unresolvedSlugs).toEqual([]);
  });

  it("emits one wikilink.changed job per resolved [[wikilink]]", async () => {
    const { graphRepo, jobs } = buildStubGraphRepo();
    const repo = buildStubVaultRepo([
      { id: 10, slug: "alpha" },
      { id: 11, slug: "beta" },
      { id: 12, slug: "gamma" },
    ]);

    await enqueueVaultNoteProjection(
      {
        vaultId: 1,
        noteId: 10,
        versionId: 50,
        slug: "alpha",
        title: "Alpha",
        contentMd: "see [[beta]] and [[gamma]] for details",
        eventKind: "note.updated",
      },
      { graphRepo, repo },
    );

    expect(jobs).toHaveLength(3); // 1 note + 2 wikilinks
    const wikilinkJobs = jobs.filter(
      (j) => j.triggerEvent === "wikilink.changed",
    );
    expect(wikilinkJobs).toHaveLength(2);
    expect(wikilinkJobs[0]!.projectionKey).toBe("vault_wikilink:50:beta");
    expect(wikilinkJobs[0]!.triggerPayload).toEqual({
      sourceVersionId: 50,
      targetSlug: "beta",
      targetNoteId: 11,
    });
    expect(wikilinkJobs[1]!.projectionKey).toBe("vault_wikilink:50:gamma");
    expect(wikilinkJobs[1]!.triggerPayload).toMatchObject({
      targetNoteId: 12,
    });
  });

  it("drops unresolved wikilinks (no projection job, surfaced via result)", async () => {
    const { graphRepo, jobs } = buildStubGraphRepo();
    const repo = buildStubVaultRepo([{ id: 10, slug: "alpha" }]);

    const result = await enqueueVaultNoteProjection(
      {
        vaultId: 1,
        noteId: 10,
        versionId: 50,
        slug: "alpha",
        title: "Alpha",
        contentMd: "[[does-not-exist]] [[also-missing]]",
        eventKind: "note.created",
      },
      { graphRepo, repo },
    );

    expect(jobs).toHaveLength(1); // note only — no wikilink jobs
    expect(jobs[0]!.triggerEvent).toBe("note.created");
    expect(result.wikilinkJobIds).toEqual([]);
    expect(result.unresolvedSlugs.sort()).toEqual([
      "also-missing",
      "does-not-exist",
    ]);
  });

  it("drops self-links (note's own slug pointing back to itself)", async () => {
    const { graphRepo, jobs } = buildStubGraphRepo();
    const repo = buildStubVaultRepo([
      { id: 10, slug: "alpha" },
      { id: 11, slug: "beta" },
    ]);

    await enqueueVaultNoteProjection(
      {
        vaultId: 1,
        noteId: 10,
        versionId: 50,
        slug: "alpha",
        title: "Alpha",
        contentMd: "self [[alpha]] then real [[beta]]",
        eventKind: "note.updated",
      },
      { graphRepo, repo },
    );

    const wikilinkJobs = jobs.filter(
      (j) => j.triggerEvent === "wikilink.changed",
    );
    expect(wikilinkJobs).toHaveLength(1);
    expect(wikilinkJobs[0]!.projectionKey).toBe("vault_wikilink:50:beta");
  });

  it("dedupes repeated targetSlug occurrences in a single note", async () => {
    const { graphRepo, jobs } = buildStubGraphRepo();
    const repo = buildStubVaultRepo([
      { id: 10, slug: "alpha" },
      { id: 11, slug: "beta" },
    ]);

    await enqueueVaultNoteProjection(
      {
        vaultId: 1,
        noteId: 10,
        versionId: 50,
        slug: "alpha",
        title: "Alpha",
        contentMd: "first [[beta]] middle [[beta]] last [[beta]]",
        eventKind: "note.created",
      },
      { graphRepo, repo },
    );

    const wikilinkJobs = jobs.filter(
      (j) => j.triggerEvent === "wikilink.changed",
    );
    expect(wikilinkJobs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Structural tests on the router wiring
// ---------------------------------------------------------------------------

const ROUTER = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/router.ts",
);
const routerSrc = readFileSync(ROUTER, "utf8");

describe("router — graph projection wiring", () => {
  it("declares a `fireGraphProjection` fire-and-forget helper", () => {
    expect(routerSrc).toMatch(/function fireGraphProjection\(/);
  });

  it("lazy-imports the projection module (cold-import + circular-dep avoidance)", () => {
    expect(routerSrc).toMatch(
      /await import\(\s*["']\.\/graph-projection\.js["']\s*\)/,
    );
  });

  it("createNote calls fireGraphProjection with eventKind 'note.created'", () => {
    expect(routerSrc).toMatch(
      /createNote[\s\S]*?fireGraphProjection\([\s\S]*?"note\.created"/,
    );
  });

  it("updateNote calls fireGraphProjection with eventKind 'note.updated'", () => {
    expect(routerSrc).toMatch(
      /updateNote[\s\S]*?fireGraphProjection\([\s\S]*?"note\.updated"/,
    );
  });

  it("projection enqueue is fire-and-forget (void prefix, not awaited)", () => {
    expect(routerSrc).toMatch(/void fireGraphProjection\(/);
  });
});
