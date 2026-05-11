/**
 * Phase 14 §6/§7 — runtime CAG block edge expander tests.
 *
 * Pure unit coverage. Mirrors the skill-pack expander tests (PR #468)
 * since both shapes are usage-style edges with dedup.
 */

import { describe, it, expect, vi } from "vitest";
import {
  expandRuntimeCagBlockEdges,
  loadRuntimeCagBlockUsagesForRun,
  type RuntimeCagBlockUsageRow,
} from "../../server/agent-studio/services/graph-agent/projection-cag-block-expander";

function row(
  overrides: Partial<RuntimeCagBlockUsageRow> & { cagPackId: number },
): RuntimeCagBlockUsageRow {
  return {
    cagPackId: overrides.cagPackId,
    packVersion: overrides.packVersion ?? 1,
  };
}

describe("expandRuntimeCagBlockEdges — Phase 14 §6/§7", () => {
  it("emits one (:CAGBlock) node + one USED_CAG_BLOCK edge per usage", () => {
    const writes = expandRuntimeCagBlockEdges(42, [
      row({ cagPackId: 1, packVersion: 1 }),
      row({ cagPackId: 2, packVersion: 1 }),
    ]);
    expect(writes.filter((w) => w.kind === "upsert_node")).toHaveLength(2);
    expect(writes.filter((w) => w.kind === "upsert_edge")).toHaveLength(2);
  });

  it("dedups repeated usages of the same cagPackId in one run", () => {
    const writes = expandRuntimeCagBlockEdges(42, [
      row({ cagPackId: 1, packVersion: 1 }),
      row({ cagPackId: 1, packVersion: 2 }),
      row({ cagPackId: 1, packVersion: 3 }),
    ]);
    expect(writes.filter((w) => w.kind === "upsert_node")).toHaveLength(1);
    expect(writes.filter((w) => w.kind === "upsert_edge")).toHaveLength(1);
  });

  it("(:CAGBlock) node id is stable on cagPackId", () => {
    const writes = expandRuntimeCagBlockEdges(42, [row({ cagPackId: 7 })]);
    const node = writes.find((w) => w.kind === "upsert_node")!.node;
    expect(node?.id).toBe("cag_block:7");
    expect(node?.sourceId).toBe("7");
  });

  it("node properties carry latestObservedPackVersion", () => {
    const writes = expandRuntimeCagBlockEdges(42, [
      row({ cagPackId: 7, packVersion: 9 }),
    ]);
    const node = writes.find((w) => w.kind === "upsert_node")!.node;
    expect(node?.properties).toMatchObject({ latestObservedPackVersion: 9 });
  });

  it("USED_CAG_BLOCK edge connects RuntimeTrace → CAGBlock + carries packVersion", () => {
    const writes = expandRuntimeCagBlockEdges(42, [
      row({ cagPackId: 1, packVersion: 5 }),
    ]);
    const edge = writes.find((w) => w.kind === "upsert_edge")!.edge;
    expect(edge?.typeKey).toBe("USED_CAG_BLOCK");
    expect(edge?.id).toBe("used_cag_block:42:1");
    expect(edge?.sourceNode).toEqual({
      typeKey: "RuntimeTrace",
      id: "runtime_trace:42",
    });
    expect(edge?.targetNode).toEqual({
      typeKey: "CAGBlock",
      id: "cag_block:1",
    });
    expect(edge?.properties).toMatchObject({ packVersion: 5 });
  });

  it("empty input → empty output", () => {
    expect(expandRuntimeCagBlockEdges(1, [])).toEqual([]);
  });

  it("provenance is lineageStatus=derived + governanceStatus=active on every write", () => {
    const writes = expandRuntimeCagBlockEdges(42, [row({ cagPackId: 1 })]);
    for (const w of writes) {
      const prov = w.node?.provenance ?? w.edge?.provenance;
      expect(prov?.lineageStatus).toBe("derived");
      expect(prov?.governanceStatus).toBe("active");
    }
  });
});

describe("loadRuntimeCagBlockUsagesForRun — ASDB reader", () => {
  it("returns empty array when ASDB is unavailable", async () => {
    const rows = await loadRuntimeCagBlockUsagesForRun(42, {
      getDb: () => null as never,
    });
    expect(rows).toEqual([]);
  });

  it("returns SELECT result rows", async () => {
    const select = vi.fn(() => ({
      from: () => ({
        where: async () => [
          { cagPackId: 1, packVersion: 3 },
          { cagPackId: 2, packVersion: 1 },
        ],
      }),
    }));
    const rows = await loadRuntimeCagBlockUsagesForRun(42, {
      getDb: () => ({ select } as never),
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ cagPackId: 1, packVersion: 3 });
  });
});
