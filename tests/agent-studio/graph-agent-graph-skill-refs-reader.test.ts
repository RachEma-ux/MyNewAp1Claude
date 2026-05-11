/**
 * Phase 14 §6 — Graph Skill source-note refs reader tests.
 *
 * Covers `getGraphSkillSourceNoteRefsForRun()` from
 * `services/graph-agent/graph-skill-source-note-refs-reader.ts`.
 * The reader joins `ags_graph_skill_runtime_usages` →
 * `ags_graph_skill_pack_versions` → `ags_graph_skill_packs` and
 * left-joins back to `ags_vault_note_versions` + `ags_vault_notes`.
 * Tests use a hand-rolled drizzle-shaped fake DB that ignores the
 * join structure and just returns the pre-canned rows the query is
 * expected to produce.
 */

import { describe, it, expect, vi } from "vitest";
import { getGraphSkillSourceNoteRefsForRun } from "../../server/agent-studio/services/graph-agent/graph-skill-source-note-refs-reader";

type SelectChain = {
  from: (..._: unknown[]) => SelectChain;
  innerJoin: (..._: unknown[]) => SelectChain;
  leftJoin: (..._: unknown[]) => SelectChain;
  where: (..._: unknown[]) => Promise<Array<Record<string, unknown>>>;
};

function makeFakeDb(rows: Array<Record<string, unknown>>) {
  const select = vi.fn(() => {
    const chain: SelectChain = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: async () => rows,
    };
    return chain;
  });
  return { select };
}

describe("getGraphSkillSourceNoteRefsForRun — Phase 14 §6", () => {
  it("returns [] when ASDB is unavailable", async () => {
    const result = await getGraphSkillSourceNoteRefsForRun(7, {
      getDb: () => null as never,
    });
    expect(result).toEqual([]);
  });

  it("returns [] when no usage rows match the run", async () => {
    const db = makeFakeDb([]);
    const result = await getGraphSkillSourceNoteRefsForRun(7, {
      getDb: () => db as never,
    });
    expect(result).toEqual([]);
  });

  it("returns one ref per unique packVersionId with full source-note join", async () => {
    const db = makeFakeDb([
      {
        packKey: "seed_link_analysis",
        packName: "Seed Link Analysis",
        packVersionId: 10,
        packVersion: "1.0.0",
        sourceNoteVersionId: 500,
        sourceNoteId: 200,
        sourceNoteVersion: 1,
        sourceNoteSlug: "seed-skill-pack-note",
        sourceNoteTitle: "Seed Skill Pack: Documentation",
      },
    ]);
    const result = await getGraphSkillSourceNoteRefsForRun(7, {
      getDb: () => db as never,
    });
    expect(result).toEqual([
      {
        packKey: "seed_link_analysis",
        packName: "Seed Link Analysis",
        packVersionId: 10,
        packVersion: "1.0.0",
        sourceNoteVersionId: 500,
        sourceNoteId: 200,
        sourceNoteVersion: 1,
        sourceNoteSlug: "seed-skill-pack-note",
        sourceNoteTitle: "Seed Skill Pack: Documentation",
      },
    ]);
  });

  it("dedups multiple usage rows for the same packVersionId", async () => {
    const db = makeFakeDb([
      {
        packKey: "p1",
        packName: "Pack 1",
        packVersionId: 10,
        packVersion: "1.0.0",
        sourceNoteVersionId: null,
        sourceNoteId: null,
        sourceNoteVersion: null,
        sourceNoteSlug: null,
        sourceNoteTitle: null,
      },
      {
        packKey: "p1",
        packName: "Pack 1",
        packVersionId: 10,
        packVersion: "1.0.0",
        sourceNoteVersionId: null,
        sourceNoteId: null,
        sourceNoteVersion: null,
        sourceNoteSlug: null,
        sourceNoteTitle: null,
      },
    ]);
    const result = await getGraphSkillSourceNoteRefsForRun(7, {
      getDb: () => db as never,
    });
    expect(result.length).toBe(1);
    expect(result[0].packVersionId).toBe(10);
  });

  it("returns multiple refs for distinct packVersionIds", async () => {
    const db = makeFakeDb([
      {
        packKey: "p1",
        packName: "Pack 1",
        packVersionId: 10,
        packVersion: "1.0.0",
        sourceNoteVersionId: null,
        sourceNoteId: null,
        sourceNoteVersion: null,
        sourceNoteSlug: null,
        sourceNoteTitle: null,
      },
      {
        packKey: "p2",
        packName: "Pack 2",
        packVersionId: 11,
        packVersion: "0.3.0",
        sourceNoteVersionId: 600,
        sourceNoteId: 300,
        sourceNoteVersion: 2,
        sourceNoteSlug: "p2-note",
        sourceNoteTitle: "Pack 2 Note",
      },
    ]);
    const result = await getGraphSkillSourceNoteRefsForRun(7, {
      getDb: () => db as never,
    });
    expect(result.length).toBe(2);
    expect(result.map((r) => r.packKey).sort()).toEqual(["p1", "p2"]);
    const p2 = result.find((r) => r.packKey === "p2")!;
    expect(p2.sourceNoteTitle).toBe("Pack 2 Note");
    expect(p2.sourceNoteVersionId).toBe(600);
  });

  it("preserves the null-source-note shape when the pack version has no source note", async () => {
    const db = makeFakeDb([
      {
        packKey: "p1",
        packName: "Pack 1",
        packVersionId: 10,
        packVersion: "1.0.0",
        sourceNoteVersionId: null,
        sourceNoteId: null,
        sourceNoteVersion: null,
        sourceNoteSlug: null,
        sourceNoteTitle: null,
      },
    ]);
    const result = await getGraphSkillSourceNoteRefsForRun(7, {
      getDb: () => db as never,
    });
    expect(result[0].sourceNoteVersionId).toBeNull();
    expect(result[0].sourceNoteId).toBeNull();
    expect(result[0].sourceNoteSlug).toBeNull();
    expect(result[0].sourceNoteTitle).toBeNull();
    expect(result[0].sourceNoteVersion).toBeNull();
  });
});
