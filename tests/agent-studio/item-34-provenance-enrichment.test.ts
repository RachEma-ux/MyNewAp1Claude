/**
 * Item 34 — Provenance explanation from graph path/node explain methods.
 *
 * Five acceptance cases per the closure prompt:
 *   - visible graph provenance
 *   - hidden provenance redaction (load-bearing — must NOT leak
 *     label or provenance for nodes the viewer can't see)
 *   - missing provenance (node id with no underlying row)
 *   - path provenance (multi-node enrichment via explainPath)
 *   - actor mismatch (viewer A sees, viewer B does not)
 *
 * Plus:
 *   - engine integration: `extractGraphNodeIdsFromContextBlocks`
 *     correctly extracts node ids from each GraphRAG block shape and
 *     ignores synthetic non-graph blocks.
 *   - source-scan integrity: enricher imports only from
 *     repository/types (no neo4j-driver / no model access / no MCP).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  enrichWithGraphProvenance,
  enrichPathWithGraphProvenance,
  countHiddenInProvenance,
  isVisibleProvenance,
  type NodeProvenanceEnvelope,
} from "../../server/agent-studio/services/graph-agent/public-api";

import { extractGraphNodeIdsFromContextBlocks } from "../../server/agent-studio/services/graph-agent/engine";

import type {
  GraphRepository,
  ProvenanceFields,
  RuntimeContext,
  NodeIdentity,
  NodeProperties,
  TraversalPath,
} from "../../server/agent-studio/services/graph/repository/types";

// ──────────────────────────────────────────────────────────────────
// Stub repository — implements explainNode + explainPath +
// isVisibleToUser. Per-runtime per-id behavior is dispatched via a
// lookup map so individual tests can shape returns precisely without
// re-implementing the whole repo.
// ──────────────────────────────────────────────────────────────────

interface StubBehavior {
  /** Map of `${userId}:${nodeId}` → either a node explain payload
   *  or `null` (meaning "explainNode returns null"). */
  explainNodeReturns: Record<
    string,
    {
      node: NodeIdentity;
      properties: NodeProperties;
      provenance: ProvenanceFields;
    } | null
  >;
  /** Map of `${userId}:${nodeId}` → boolean. Defaults to `false`
   *  (SAFE-DEFAULT DENY) when not present. */
  isVisibleReturns: Record<string, boolean>;
  /** Map of `${userId}:${from}->${to}` → an explainPath return. */
  explainPathReturns: Record<
    string,
    { path: TraversalPath | null; cypher?: string; cost?: number }
  >;
}

function makeStubRepo(behavior: Partial<StubBehavior> = {}): GraphRepository {
  const b: StubBehavior = {
    explainNodeReturns: behavior.explainNodeReturns ?? {},
    isVisibleReturns: behavior.isVisibleReturns ?? {},
    explainPathReturns: behavior.explainPathReturns ?? {},
  };
  // The enricher only uses three methods on GraphRepository: explainNode,
  // explainPath, and isVisibleToUser. We throw on every other call so
  // any accidental dependency leak fails loudly in tests.
  const throwUnsupported = (name: string) =>
    async (..._args: unknown[]): Promise<never> => {
      throw new Error(`stub repo: ${name} not implemented for enricher test`);
    };
  return {
    backendKey: "test-stub" as never,
    capabilities: { supportsTraversal: true, supportsAlgorithms: false } as never,
    localGraph: throwUnsupported("localGraph"),
    globalGraphSample: throwUnsupported("globalGraphSample"),
    neighborhood: throwUnsupported("neighborhood"),
    shortestPath: throwUnsupported("shortestPath"),
    filterByPermissions: throwUnsupported("filterByPermissions"),
    runAlgorithm: throwUnsupported("runAlgorithm"),
    enqueueProjectionJob: throwUnsupported("enqueueProjectionJob"),
    takeSnapshot: throwUnsupported("takeSnapshot"),
    detectDrift: throwUnsupported("detectDrift"),
    rebuildProjection: throwUnsupported("rebuildProjection"),
    runBenchmark: throwUnsupported("runBenchmark"),
    async isVisibleToUser(nodeId, runtime) {
      const key = `${runtime.userId ?? "anon"}:${nodeId}`;
      return b.isVisibleReturns[key] ?? false;
    },
    async explainNode(nodeId, runtime) {
      const key = `${runtime.userId ?? "anon"}:${nodeId}`;
      return key in b.explainNodeReturns ? b.explainNodeReturns[key]! : null;
    },
    async explainPath(fromId, toId, runtime) {
      const key = `${runtime.userId ?? "anon"}:${fromId}->${toId}`;
      return key in b.explainPathReturns
        ? b.explainPathReturns[key]!
        : { path: null };
    },
  } as unknown as GraphRepository;
}

const VISIBLE_RUNTIME: RuntimeContext = {
  userId: 1,
  workspaceId: 100,
  userRole: "user",
};

const OTHER_RUNTIME: RuntimeContext = {
  userId: 2,
  workspaceId: 100,
  userRole: "user",
};

function visibleNodeExplain(
  id: string,
  overrides: Partial<NodeProperties & { label?: string }> = {},
): {
  node: NodeIdentity;
  properties: NodeProperties;
  provenance: ProvenanceFields;
} {
  return {
    node: { typeKey: "note", id, sourceId: `src:${id}`, sourceVersionId: "v3" },
    properties: { label: `Label for ${id}`, ...overrides },
    provenance: {
      sourceType: "vault_note",
      sourceId: `src:${id}`,
      sourceVersionId: "v3",
      sourceLocator: `vault/notes/${id}.md`,
      confidence: 0.92,
      lineageStatus: "asserted",
      validationStatus: "validated",
      governanceStatus: "active",
    },
  };
}

// ══════════════════════════════════════════════════════════════════
// §1 — Visible provenance
// ══════════════════════════════════════════════════════════════════

describe("Item 34 §1 — visible graph provenance", () => {
  it("returns full provenance for a visible node", async () => {
    const repo = makeStubRepo({
      explainNodeReturns: { "1:n1": visibleNodeExplain("n1") },
    });
    const out = await enrichWithGraphProvenance(["n1"], repo, VISIBLE_RUNTIME);
    expect(out.length).toBe(1);
    expect(out[0]!.status).toBe("visible");
    if (out[0]!.status === "visible") {
      expect(out[0]!.label).toBe("Label for n1");
      expect(out[0]!.provenance.sourceType).toBe("vault_note");
      expect(out[0]!.provenance.sourceId).toBe("src:n1");
      expect(out[0]!.provenance.sourceVersionId).toBe("v3");
      expect(out[0]!.provenance.confidence).toBe(0.92);
      expect(out[0]!.provenance.lineageStatus).toBe("asserted");
      expect(out[0]!.provenance.governanceStatus).toBe("active");
    }
  });

  it("falls back to properties.name when label is absent", async () => {
    const repo = makeStubRepo({
      explainNodeReturns: {
        "1:n1": {
          node: { typeKey: "agent", id: "n1" },
          properties: { name: "Agent Smith" },
          provenance: {
            sourceType: "agent",
            sourceId: "n1",
            lineageStatus: "asserted",
          },
        },
      },
    });
    const out = await enrichWithGraphProvenance(["n1"], repo, VISIBLE_RUNTIME);
    expect(out[0]!.status).toBe("visible");
    if (out[0]!.status === "visible") expect(out[0]!.label).toBe("Agent Smith");
  });
});

// ══════════════════════════════════════════════════════════════════
// §2 — Hidden provenance redaction (load-bearing)
// ══════════════════════════════════════════════════════════════════

describe("Item 34 §2 — hidden provenance redaction", () => {
  it("hidden node returns NO label and NO provenance", async () => {
    const repo = makeStubRepo({
      // explainNode returns null AND isVisibleToUser returns false → hidden
      explainNodeReturns: { "1:secret": null },
      isVisibleReturns: { "1:secret": false },
    });
    const out = await enrichWithGraphProvenance(
      ["secret"],
      repo,
      VISIBLE_RUNTIME,
    );
    expect(out.length).toBe(1);
    expect(out[0]!.status).toBe("hidden");
    expect(out[0]!.nodeId).toBe("secret");
    // The load-bearing invariant: no other fields in the hidden envelope.
    expect(Object.keys(out[0]!).sort()).toEqual(["nodeId", "status"]);
  });

  it("countHiddenInProvenance counts hidden envelopes correctly", async () => {
    const repo = makeStubRepo({
      explainNodeReturns: {
        "1:v1": visibleNodeExplain("v1"),
        "1:h1": null,
        "1:h2": null,
        "1:v2": visibleNodeExplain("v2"),
      },
      isVisibleReturns: { "1:h1": false, "1:h2": false },
    });
    const out = await enrichWithGraphProvenance(
      ["v1", "h1", "h2", "v2"],
      repo,
      VISIBLE_RUNTIME,
    );
    expect(countHiddenInProvenance(out)).toBe(2);
    const visible = out.filter(isVisibleProvenance);
    expect(visible.map((v) => v.nodeId)).toEqual(["v1", "v2"]);
  });
});

// ══════════════════════════════════════════════════════════════════
// §3 — Missing provenance
// ══════════════════════════════════════════════════════════════════

describe("Item 34 §3 — missing provenance", () => {
  it("not_found status when node id has no row AND viewer can see (would have if it existed)", async () => {
    const repo = makeStubRepo({
      // explainNode returns null but viewer would be permitted → not_found
      explainNodeReturns: { "1:gone": null },
      isVisibleReturns: { "1:gone": true },
    });
    const out = await enrichWithGraphProvenance(
      ["gone"],
      repo,
      VISIBLE_RUNTIME,
    );
    expect(out[0]!.status).toBe("not_found");
    expect(Object.keys(out[0]!).sort()).toEqual(["nodeId", "status"]);
  });
});

// ══════════════════════════════════════════════════════════════════
// §4 — Path provenance
// ══════════════════════════════════════════════════════════════════

describe("Item 34 §4 — path provenance", () => {
  it("enrichPathWithGraphProvenance attaches per-node provenance for visible nodes", async () => {
    const path: TraversalPath = {
      length: 2,
      nodes: [
        { typeKey: "note", id: "a", sourceId: "src:a", sourceVersionId: "v1" },
        { typeKey: "note", id: "b", sourceId: "src:b", sourceVersionId: "v2" },
        { typeKey: "note", id: "c", sourceId: "src:c", sourceVersionId: "v3" },
      ],
      edges: [],
    };
    const repo = makeStubRepo({
      explainPathReturns: {
        "1:a->c": { path, cypher: "MATCH (a)-[*]-(c) RETURN a,c", cost: 1.5 },
      },
      explainNodeReturns: {
        "1:a": visibleNodeExplain("a"),
        "1:b": null, // hidden middle node
        "1:c": visibleNodeExplain("c"),
      },
      isVisibleReturns: { "1:b": false },
    });
    const out = await enrichPathWithGraphProvenance(
      "a",
      "c",
      repo,
      VISIBLE_RUNTIME,
    );
    expect(out.status).toBe("path");
    if (out.status === "path") {
      expect(out.length).toBe(2);
      expect(out.cypher).toBe("MATCH (a)-[*]-(c) RETURN a,c");
      expect(out.cost).toBe(1.5);
      expect(out.nodeProvenance.length).toBe(3);
      expect(out.nodeProvenance[0]!.status).toBe("visible");
      expect(out.nodeProvenance[1]!.status).toBe("hidden");
      expect(out.nodeProvenance[2]!.status).toBe("visible");
      // load-bearing: hidden middle node has no label
      if (out.nodeProvenance[1]!.status === "hidden") {
        expect(Object.keys(out.nodeProvenance[1]!).sort()).toEqual([
          "nodeId",
          "status",
        ]);
      }
    }
  });

  it("returns null_path when no path exists", async () => {
    const repo = makeStubRepo({
      explainPathReturns: { "1:x->y": { path: null } },
    });
    const out = await enrichPathWithGraphProvenance(
      "x",
      "y",
      repo,
      VISIBLE_RUNTIME,
    );
    expect(out.status).toBe("null_path");
  });
});

// ══════════════════════════════════════════════════════════════════
// §5 — Actor mismatch
// ══════════════════════════════════════════════════════════════════

describe("Item 34 §5 — actor mismatch", () => {
  it("same node returns visible for viewer 1, hidden for viewer 2", async () => {
    const repo = makeStubRepo({
      explainNodeReturns: {
        "1:shared": visibleNodeExplain("shared"),
        "2:shared": null,
      },
      isVisibleReturns: { "1:shared": true, "2:shared": false },
    });
    const v1 = await enrichWithGraphProvenance(
      ["shared"],
      repo,
      VISIBLE_RUNTIME,
    );
    const v2 = await enrichWithGraphProvenance(
      ["shared"],
      repo,
      OTHER_RUNTIME,
    );
    expect(v1[0]!.status).toBe("visible");
    expect(v2[0]!.status).toBe("hidden");
  });
});

// ══════════════════════════════════════════════════════════════════
// §6 — Engine integration (graph-node-id extraction)
// ══════════════════════════════════════════════════════════════════

describe("Item 34 §6 — extractGraphNodeIdsFromContextBlocks", () => {
  it("extracts node id from graphrag_local-shaped blocks (payload.node.id)", () => {
    const blocks = [
      {
        id: "n1",
        sourceKind: "note",
        payload: { node: { typeKey: "note", id: "n1" } },
      },
      {
        id: "n2",
        sourceKind: "agent",
        payload: { node: { typeKey: "agent", id: "n2" } },
      },
    ];
    expect(extractGraphNodeIdsFromContextBlocks(blocks)).toEqual(["n1", "n2"]);
  });

  it("extracts from/to/nodes from graphrag_shortest_path block", () => {
    const blocks = [
      {
        id: "shortest:a->c",
        sourceKind: "graph_path",
        payload: { from: "a", to: "c", nodes: ["a", "b", "c"] },
      },
    ];
    // Order-preserving + deduplicating: from, to (already in nodes), then
    // the nodes list (already de-duplicated against from/to).
    expect(extractGraphNodeIdsFromContextBlocks(blocks)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("ignores cypher_template / retrieval-router synthetic blocks", () => {
    const blocks = [
      { id: "template:1", sourceKind: "cypher_template", payload: { rows: [] } },
      { id: "router:err", sourceKind: "retrieval-router", payload: {} },
      {
        id: "perm:1",
        sourceKind: "retrieval-router.permission-filter",
        payload: {},
      },
      {
        id: "exec:1",
        sourceKind: "graph-template-executor",
        payload: {},
      },
    ];
    expect(extractGraphNodeIdsFromContextBlocks(blocks)).toEqual([]);
  });

  it("deduplicates across mixed shapes", () => {
    const blocks = [
      {
        id: "a",
        sourceKind: "note",
        payload: { node: { typeKey: "note", id: "a" } },
      },
      {
        id: "shortest:a->c",
        sourceKind: "graph_path",
        payload: { from: "a", to: "c", nodes: ["a", "b", "c"] },
      },
    ];
    expect(extractGraphNodeIdsFromContextBlocks(blocks)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });
});

// ══════════════════════════════════════════════════════════════════
// §7 — Source-scan integrity
// ══════════════════════════════════════════════════════════════════

describe("Item 34 §7 — source-scan integrity", () => {
  it("enricher imports ONLY from repository/types — no driver / model / MCP coupling", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-agent/provenance-enricher.ts",
      ),
      "utf-8",
    );
    expect(file).not.toMatch(/neo4j-driver/);
    expect(file).not.toMatch(/openrouter/);
    expect(file).not.toMatch(/model-access/);
    expect(file).not.toMatch(/dispatchMcpToolCall/);
    expect(file).not.toMatch(/credential-resolver/);
    // It imports from repository/types only (no barrel — avoids
    // eager-loading Neo4jCommunityGraphRepository).
    expect(file).toMatch(/from "..\/graph\/repository\/types\.js"/);
  });
});
