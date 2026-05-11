/**
 * Phase 23 §1 — graph quality scan orchestrator + orphan-node scanner.
 *
 * Pure-orchestrator unit tests via fake graph repo + fake DB.
 */

import { describe, it, expect, vi } from "vitest";
import {
  runQualityScan,
  scanForOrphanNodes,
  orphanNodeScanner,
  UnknownScanKindError,
  QUALITY_SCANNER_REGISTRY,
  type QualityScanSample,
} from "../../server/agent-studio/services/graph-quality/public-api";
import type { GraphRepository } from "../../server/agent-studio/services/graph/repository/index";

function makeRepo(sample: QualityScanSample): GraphRepository {
  return {
    globalGraphSample: vi.fn(async () => ({
      nodes: [...sample.nodes],
      edges: [...sample.edges],
      truncated: sample.truncated,
    })),
  } as unknown as GraphRepository;
}

interface FakeDbState {
  scanRow: Record<string, unknown> | null;
  findings: Record<string, unknown>[];
  scanUpdates: Record<string, unknown>[];
}

function makeFakeDb(initial: FakeDbState = {
  scanRow: null,
  findings: [],
  scanUpdates: [],
}) {
  const state: FakeDbState = initial;
  const tableName = (t: unknown): string => {
    const sym = Object.getOwnPropertySymbols(t as object).find(
      (s) => s.description === "drizzle:Name",
    );
    return sym ? String((t as Record<symbol, unknown>)[sym]) : "?";
  };

  const insert = vi.fn((table: unknown) => {
    const name = tableName(table);
    return {
      values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
        if (name === "ags_graph_quality_scans") {
          state.scanRow = Array.isArray(vals) ? vals[0] : vals;
          return {
            returning: async () => [{ id: 99 }],
          };
        }
        if (name === "ags_graph_quality_findings") {
          const rows = Array.isArray(vals) ? vals : [vals];
          state.findings.push(...rows);
        }
        return undefined;
      },
    };
  });

  const update = vi.fn((_table: unknown) => ({
    set: (patch: Record<string, unknown>) => ({
      where: async () => {
        state.scanUpdates.push(patch);
      },
    }),
  }));

  return { db: { insert, update }, state };
}

describe("runQualityScan — Phase 23 §1", () => {
  it("throws UnknownScanKindError for an unregistered kind", async () => {
    const { db } = makeFakeDb();
    const repo = makeRepo({ nodes: [], edges: [], truncated: false });
    await expect(
      runQualityScan(
        { scanKind: "no_such_kind" },
        {
          registry: [],
          repository: repo,
          getDb: () => db as never,
        },
      ),
    ).rejects.toBeInstanceOf(UnknownScanKindError);
  });

  it("returns status=skipped when ASDB is unavailable", async () => {
    const repo = makeRepo({ nodes: [], edges: [], truncated: false });
    const result = await runQualityScan(
      { scanKind: "orphan_node" },
      {
        registry: [orphanNodeScanner],
        repository: repo,
        getDb: () => null as never,
      },
    );
    expect(result).toEqual({
      scanId: null,
      status: "skipped",
      findingsCount: 0,
    });
  });

  it("opens scan row, samples graph, inserts findings, flips to completed", async () => {
    const { db, state } = makeFakeDb();
    const repo = makeRepo({
      nodes: [
        { typeKey: "Note", id: "note:1" },
        { typeKey: "Note", id: "note:2" }, // orphan
      ],
      edges: [
        {
          typeKey: "LINKS_TO",
          sourceNode: { typeKey: "Note", id: "note:1" },
          targetNode: { typeKey: "Note", id: "note:3" },
        },
      ],
      truncated: false,
    });
    const result = await runQualityScan(
      { scanKind: "orphan_node" },
      {
        registry: [orphanNodeScanner],
        repository: repo,
        getDb: () => db as never,
      },
    );
    expect(result.status).toBe("completed");
    expect(result.findingsCount).toBe(1);
    expect(result.scanId).toBe(99);

    expect(state.scanRow).toMatchObject({
      scanKind: "orphan_node",
      status: "running",
    });
    expect(state.findings).toHaveLength(1);
    expect(state.findings[0]).toMatchObject({
      scanId: 99,
      findingClass: "orphan_node",
      severity: "medium",
      sourceTypeKey: "Note",
      sourceId: "note:2",
    });
    expect(state.scanUpdates).toHaveLength(1);
    expect(state.scanUpdates[0]).toMatchObject({
      status: "completed",
      findingsCount: 1,
    });
  });

  it("emits no findings when every node participates in an edge", async () => {
    const { db, state } = makeFakeDb();
    const repo = makeRepo({
      nodes: [
        { typeKey: "Note", id: "note:1" },
        { typeKey: "Note", id: "note:2" },
      ],
      edges: [
        {
          typeKey: "LINKS_TO",
          sourceNode: { typeKey: "Note", id: "note:1" },
          targetNode: { typeKey: "Note", id: "note:2" },
        },
      ],
      truncated: false,
    });
    const result = await runQualityScan(
      { scanKind: "orphan_node" },
      {
        registry: [orphanNodeScanner],
        repository: repo,
        getDb: () => db as never,
      },
    );
    expect(result.findingsCount).toBe(0);
    expect(state.findings).toHaveLength(0);
    expect(state.scanUpdates[0]).toMatchObject({
      status: "completed",
      findingsCount: 0,
    });
  });

  it("flips scan to failed + records error when the repo throws", async () => {
    const { db, state } = makeFakeDb();
    const repo = {
      globalGraphSample: async () => {
        throw new Error("graph backend down");
      },
    } as unknown as GraphRepository;
    const result = await runQualityScan(
      { scanKind: "orphan_node" },
      {
        registry: [orphanNodeScanner],
        repository: repo,
        getDb: () => db as never,
      },
    );
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/graph backend down/);
    expect(state.scanUpdates).toHaveLength(1);
    expect(state.scanUpdates[0]).toMatchObject({ status: "failed" });
  });
});

describe("scanForOrphanNodes — pure scanner", () => {
  it("flags every node that does not appear in any edge", () => {
    const findings = scanForOrphanNodes({
      nodes: [
        { typeKey: "X", id: "a" },
        { typeKey: "X", id: "b" },
        { typeKey: "X", id: "c" },
      ],
      edges: [
        {
          typeKey: "E",
          sourceNode: { typeKey: "X", id: "a" },
          targetNode: { typeKey: "X", id: "b" },
        },
      ],
      truncated: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].sourceId).toBe("c");
  });

  it("returns empty for a fully-connected sample", () => {
    const findings = scanForOrphanNodes({
      nodes: [
        { typeKey: "X", id: "a" },
        { typeKey: "X", id: "b" },
      ],
      edges: [
        {
          typeKey: "E",
          sourceNode: { typeKey: "X", id: "a" },
          targetNode: { typeKey: "X", id: "b" },
        },
      ],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("carries sampleTruncated + nodeSourceId into details for forensics", () => {
    const findings = scanForOrphanNodes({
      nodes: [{ typeKey: "Note", id: "note:7", sourceId: "7" }],
      edges: [],
      truncated: true,
    });
    expect(findings[0].details).toMatchObject({
      sampleTruncated: true,
      nodeSourceId: "7",
    });
  });
});

describe("QUALITY_SCANNER_REGISTRY", () => {
  it("contains the orphan-node scanner", () => {
    expect(
      QUALITY_SCANNER_REGISTRY.find((r) => r.scanKind === "orphan_node"),
    ).toBeDefined();
  });

  it("scanKind values are unique", () => {
    const kinds = QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
