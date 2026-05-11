/**
 * Phase 12.5 §10 — Graph Skill Pack pack-mutations service tests.
 *
 * Covers `createPack`, `publishVersion`, and `listPackVersions` from
 * `services/graph-skill/pack-mutations.ts`. Tests use the injectable
 * `getDb` option to swap a fake drizzle-shaped DB; same "active-key"
 * side-channel pattern as the §5 + §7 recorder/usage tests.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createPack,
  publishVersion,
  listPackVersions,
  AsdbUnavailableError,
  DuplicateVersionError,
  PackNotFoundError,
  SourceNoteVersionNotFoundError,
} from "../../server/agent-studio/services/graph-skill/pack-mutations";

type SelectChain = {
  from: () => SelectChain;
  where: () => SelectChain;
  orderBy: () => SelectChain;
  limit: (n: number) => Promise<Array<Record<string, unknown>>>;
};

interface FakeDbState {
  packsByKey: Record<string, { id: number; name: string }>;
  versionsByPackId: Record<number, Array<{ id: number; version: string; createdAt: Date; sourceNoteVersionId: number | null }>>;
  sourceNoteVersionIds: Set<number>;
  selectQueue: Array<"pack" | "versionDup" | "versionsForPack" | "sourceNoteVersion">;
  inserted: Array<{ table: string; values: Record<string, unknown> }>;
  nextInsertedId: number;
  activeSkillKey?: string;
  activePackId?: number;
  activeVersion?: string;
  activeSourceNoteVersionId?: number;
}

function makeFakeDb(initial: Partial<FakeDbState> = {}) {
  const state: FakeDbState = {
    packsByKey: initial.packsByKey ?? {},
    versionsByPackId: initial.versionsByPackId ?? {},
    sourceNoteVersionIds: initial.sourceNoteVersionIds ?? new Set(),
    selectQueue: [],
    inserted: [],
    nextInsertedId: 1000,
  };

  const select = vi.fn(() => {
    const chain: SelectChain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => {
        const op = state.selectQueue.shift();
        if (op === "pack") {
          const key = state.activeSkillKey ?? "";
          const p = state.packsByKey[key];
          return p ? [{ id: p.id, skillKey: key, name: p.name }] : [];
        }
        if (op === "versionDup") {
          const packId = state.activePackId ?? -1;
          const v = state.activeVersion ?? "";
          const found = (state.versionsByPackId[packId] ?? []).find(
            (r) => r.version === v,
          );
          return found ? [{ id: found.id }] : [];
        }
        if (op === "versionsForPack") {
          const packId = state.activePackId ?? -1;
          return (state.versionsByPackId[packId] ?? []).map((r) => ({
            id: r.id,
            version: r.version,
            createdAt: r.createdAt,
            sourceNoteVersionId: r.sourceNoteVersionId,
          }));
        }
        if (op === "sourceNoteVersion") {
          const id = state.activeSourceNoteVersionId ?? -1;
          return state.sourceNoteVersionIds.has(id) ? [{ id }] : [];
        }
        return [];
      },
    };
    return chain;
  });

  const insert = vi.fn((table: unknown) => ({
    values: (vals: Record<string, unknown>) => {
      const id = state.nextInsertedId++;
      state.inserted.push({ table: String((table as any)?._?.name ?? "?"), values: vals });
      return {
        returning: async () => {
          if (vals.skillKey) {
            return [
              {
                id,
                skillKey: vals.skillKey,
                name: vals.name,
              },
            ];
          }
          return [
            {
              id,
              packId: vals.packId,
              version: vals.version,
            },
          ];
        },
      };
    },
  }));

  const db = { select, insert } as unknown;
  return { db, state };
}

describe("createPack — Phase 12.5 §10", () => {
  it("throws AsdbUnavailableError when getDb returns null", async () => {
    await expect(
      createPack({ skillKey: "p", name: "P" }, { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("inserts a new pack when skillKey is unknown and returns created=true", async () => {
    const { db, state } = makeFakeDb();
    state.selectQueue.push("pack");
    state.activeSkillKey = "new-pack";
    const result = await createPack(
      {
        skillKey: "new-pack",
        name: "New Pack",
        description: "desc",
        domain: "graph",
        riskLevel: "medium",
        approvalRequired: true,
      },
      { getDb: () => db as never },
    );
    expect(result.created).toBe(true);
    expect(result.skillKey).toBe("new-pack");
    expect(result.name).toBe("New Pack");
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].values).toMatchObject({
      skillKey: "new-pack",
      name: "New Pack",
      description: "desc",
      domain: "graph",
      riskLevel: "medium",
      approvalRequired: true,
      active: true,
    });
  });

  it("returns existing pack with created=false when skillKey already present (idempotent)", async () => {
    const { db, state } = makeFakeDb({
      packsByKey: { "existing": { id: 7, name: "Existing" } },
    });
    state.selectQueue.push("pack");
    state.activeSkillKey = "existing";
    const result = await createPack(
      { skillKey: "existing", name: "ignored" },
      { getDb: () => db as never },
    );
    expect(result).toEqual({
      id: 7,
      skillKey: "existing",
      name: "Existing",
      created: false,
    });
    expect(state.inserted).toHaveLength(0);
  });

  it("applies safe defaults for optional fields (riskLevel=low, approvalRequired=false, empty type arrays)", async () => {
    const { db, state } = makeFakeDb();
    state.selectQueue.push("pack");
    state.activeSkillKey = "min";
    await createPack({ skillKey: "min", name: "Min" }, { getDb: () => db as never });
    expect(state.inserted[0].values).toMatchObject({
      riskLevel: "low",
      approvalRequired: false,
      supportedNodeTypeKeys: [],
      supportedEdgeTypeKeys: [],
      description: null,
      domain: null,
    });
  });
});

describe("publishVersion — Phase 12.5 §10", () => {
  it("throws AsdbUnavailableError when getDb returns null", async () => {
    await expect(
      publishVersion(
        { skillKey: "p", version: "1.0", manifest: {} },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("throws PackNotFoundError when the skillKey doesn't exist", async () => {
    const { db, state } = makeFakeDb();
    state.selectQueue.push("pack");
    state.activeSkillKey = "missing";
    await expect(
      publishVersion(
        { skillKey: "missing", version: "1.0", manifest: {} },
        { getDb: () => db as never },
      ),
    ).rejects.toBeInstanceOf(PackNotFoundError);
  });

  it("throws DuplicateVersionError when (packId, version) already exists", async () => {
    const { db, state } = makeFakeDb({
      packsByKey: { "p": { id: 7, name: "P" } },
      versionsByPackId: { 7: [{ id: 100, version: "1.0", createdAt: new Date(), sourceNoteVersionId: null }] },
    });
    state.selectQueue.push("pack", "versionDup");
    state.activeSkillKey = "p";
    state.activePackId = 7;
    state.activeVersion = "1.0";
    await expect(
      publishVersion(
        { skillKey: "p", version: "1.0", manifest: { foo: "bar" } },
        { getDb: () => db as never },
      ),
    ).rejects.toBeInstanceOf(DuplicateVersionError);
  });

  it("inserts a new version row when no collision and returns the inserted shape", async () => {
    const { db, state } = makeFakeDb({
      packsByKey: { "p": { id: 7, name: "P" } },
      versionsByPackId: { 7: [] },
      sourceNoteVersionIds: new Set([99]),
    });
    state.selectQueue.push("pack", "versionDup", "sourceNoteVersion");
    state.activeSkillKey = "p";
    state.activePackId = 7;
    state.activeVersion = "1.1";
    state.activeSourceNoteVersionId = 99;
    const result = await publishVersion(
      {
        skillKey: "p",
        version: "1.1",
        manifest: { foo: "bar" },
        changelog: "added foo",
        sourceNoteVersionId: 99,
      },
      { getDb: () => db as never },
    );
    expect(result.packId).toBe(7);
    expect(result.version).toBe("1.1");
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].values).toMatchObject({
      packId: 7,
      version: "1.1",
      manifest: { foo: "bar" },
      changelog: "added foo",
      sourceNoteVersionId: 99,
    });
  });

  it("Phase 12.5 §14 — throws SourceNoteVersionNotFoundError when sourceNoteVersionId doesn't resolve", async () => {
    const { db, state } = makeFakeDb({
      packsByKey: { "p": { id: 7, name: "P" } },
      versionsByPackId: { 7: [] },
      // sourceNoteVersionIds intentionally does NOT include 99
    });
    state.selectQueue.push("pack", "versionDup", "sourceNoteVersion");
    state.activeSkillKey = "p";
    state.activePackId = 7;
    state.activeVersion = "1.1";
    state.activeSourceNoteVersionId = 99;
    await expect(
      publishVersion(
        {
          skillKey: "p",
          version: "1.1",
          manifest: {},
          sourceNoteVersionId: 99,
        },
        { getDb: () => db as never },
      ),
    ).rejects.toBeInstanceOf(SourceNoteVersionNotFoundError);
    expect(state.inserted).toHaveLength(0);
  });

  it("Phase 12.5 §14 — skips the source-note FK check when sourceNoteVersionId is omitted", async () => {
    const { db, state } = makeFakeDb({
      packsByKey: { "p": { id: 7, name: "P" } },
      versionsByPackId: { 7: [] },
    });
    state.selectQueue.push("pack", "versionDup");
    state.activeSkillKey = "p";
    state.activePackId = 7;
    state.activeVersion = "1.0";
    const result = await publishVersion(
      { skillKey: "p", version: "1.0", manifest: {} },
      { getDb: () => db as never },
    );
    expect(result.packId).toBe(7);
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].values).toMatchObject({
      sourceNoteVersionId: null,
    });
  });
});

describe("listPackVersions — Phase 12.5 §10", () => {
  it("returns empty list when ASDB is unavailable", async () => {
    const rows = await listPackVersions(
      { skillKey: "p" },
      { getDb: () => null as never },
    );
    expect(rows).toEqual([]);
  });

  it("returns empty list when the pack doesn't exist", async () => {
    const { db, state } = makeFakeDb();
    state.selectQueue.push("pack");
    state.activeSkillKey = "missing";
    const rows = await listPackVersions(
      { skillKey: "missing" },
      { getDb: () => db as never },
    );
    expect(rows).toEqual([]);
  });

  it("returns version rows with hasSourceNoteRef derived from sourceNoteVersionId", async () => {
    const { db, state } = makeFakeDb({
      packsByKey: { "p": { id: 7, name: "P" } },
      versionsByPackId: {
        7: [
          { id: 100, version: "1.0", createdAt: new Date("2026-05-10"), sourceNoteVersionId: 42 },
          { id: 101, version: "1.1", createdAt: new Date("2026-05-11"), sourceNoteVersionId: null },
        ],
      },
    });
    state.selectQueue.push("pack", "versionsForPack");
    state.activeSkillKey = "p";
    state.activePackId = 7;
    const rows = await listPackVersions({ skillKey: "p" }, { getDb: () => db as never });
    expect(rows).toEqual([
      {
        id: 100,
        version: "1.0",
        createdAt: new Date("2026-05-10"),
        hasSourceNoteRef: true,
      },
      {
        id: 101,
        version: "1.1",
        createdAt: new Date("2026-05-11"),
        hasSourceNoteRef: false,
      },
    ]);
  });
});

