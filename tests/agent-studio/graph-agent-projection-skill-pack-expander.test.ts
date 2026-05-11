/**
 * Phase 14 §6/§7 — runtime skill-pack edge expander tests.
 *
 * Pure unit coverage for `expandRuntimeSkillPackEdges()` + ASDB-null
 * coverage for `loadRuntimeSkillPackUsagesForRun()`.
 */

import { describe, it, expect, vi } from "vitest";
import {
  expandRuntimeSkillPackEdges,
  loadRuntimeSkillPackUsagesForRun,
  type RuntimeSkillPackUsageRow,
} from "../../server/agent-studio/services/graph-agent/projection-skill-pack-expander";

function row(
  overrides: Partial<RuntimeSkillPackUsageRow> & { packId: number },
): RuntimeSkillPackUsageRow {
  return {
    packId: overrides.packId,
    skillKey: overrides.skillKey ?? `skill_${overrides.packId}`,
    packVersionId: overrides.packVersionId ?? overrides.packId * 10,
    version: overrides.version ?? "1.0.0",
  };
}

describe("expandRuntimeSkillPackEdges — Phase 14 §6/§7", () => {
  it("emits one (:GraphSkillPack) node + one USED_GRAPH_SKILL edge per usage", () => {
    const writes = expandRuntimeSkillPackEdges(42, [
      row({ packId: 1, skillKey: "a" }),
      row({ packId: 2, skillKey: "b" }),
    ]);
    expect(writes).toHaveLength(4);
    expect(writes.filter((w) => w.kind === "upsert_node")).toHaveLength(2);
    expect(writes.filter((w) => w.kind === "upsert_edge")).toHaveLength(2);
  });

  it("dedups repeated usages of the same pack within one run", () => {
    const writes = expandRuntimeSkillPackEdges(42, [
      row({ packId: 1, packVersionId: 10 }),
      row({ packId: 1, packVersionId: 11 }),
      row({ packId: 1, packVersionId: 12 }),
    ]);
    expect(writes.filter((w) => w.kind === "upsert_node")).toHaveLength(1);
    expect(writes.filter((w) => w.kind === "upsert_edge")).toHaveLength(1);
  });

  it("(:GraphSkillPack) node id is stable on packId", () => {
    const writes = expandRuntimeSkillPackEdges(42, [
      row({ packId: 7 }),
    ]);
    const node = writes.find((w) => w.kind === "upsert_node")!.node;
    expect(node?.id).toBe("graph_skill_pack:7");
    expect(node?.sourceId).toBe("7");
  });

  it("node properties carry skillKey + version observations", () => {
    const writes = expandRuntimeSkillPackEdges(42, [
      row({ packId: 7, skillKey: "graph_local", packVersionId: 70, version: "2.3.1" }),
    ]);
    const node = writes.find((w) => w.kind === "upsert_node")!.node;
    expect(node?.properties).toMatchObject({
      skillKey: "graph_local",
      latestObservedVersion: "2.3.1",
      latestObservedVersionId: 70,
    });
  });

  it("USED_GRAPH_SKILL edge connects RuntimeTrace → GraphSkillPack", () => {
    const writes = expandRuntimeSkillPackEdges(42, [
      row({ packId: 1, packVersionId: 10, version: "1.0.0" }),
    ]);
    const edge = writes.find((w) => w.kind === "upsert_edge")!.edge;
    expect(edge?.typeKey).toBe("USED_GRAPH_SKILL");
    expect(edge?.id).toBe("used_graph_skill:42:1");
    expect(edge?.sourceNode).toEqual({
      typeKey: "RuntimeTrace",
      id: "runtime_trace:42",
    });
    expect(edge?.targetNode).toEqual({
      typeKey: "GraphSkillPack",
      id: "graph_skill_pack:1",
    });
    expect(edge?.properties).toMatchObject({
      packVersionId: 10,
      version: "1.0.0",
    });
  });

  it("empty input → empty output", () => {
    expect(expandRuntimeSkillPackEdges(1, [])).toEqual([]);
  });

  it("provenance is lineageStatus=derived + governanceStatus=active for both writes", () => {
    const writes = expandRuntimeSkillPackEdges(42, [row({ packId: 1 })]);
    for (const w of writes) {
      const prov = w.node?.provenance ?? w.edge?.provenance;
      expect(prov?.lineageStatus).toBe("derived");
      expect(prov?.governanceStatus).toBe("active");
    }
  });
});

describe("loadRuntimeSkillPackUsagesForRun — ASDB reader", () => {
  it("returns empty array when ASDB is unavailable", async () => {
    const rows = await loadRuntimeSkillPackUsagesForRun(42, {
      getDb: () => null as never,
    });
    expect(rows).toEqual([]);
  });

  it("returns the JOIN result rows", async () => {
    const select = vi.fn(() => ({
      from: () => ({
        innerJoin: function () {
          return this;
        },
        where: async () => [
          { packId: 1, skillKey: "a", packVersionId: 10, version: "1.0.0" },
          { packId: 2, skillKey: "b", packVersionId: 20, version: "0.9.0" },
        ],
      }),
    }));
    const rows = await loadRuntimeSkillPackUsagesForRun(42, {
      getDb: () => ({ select } as never),
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ packId: 1, skillKey: "a", version: "1.0.0" });
    expect(rows[1]).toMatchObject({ packId: 2, skillKey: "b", version: "0.9.0" });
  });
});
