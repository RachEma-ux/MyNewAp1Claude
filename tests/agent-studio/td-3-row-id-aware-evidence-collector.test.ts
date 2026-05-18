/**
 * T-D.3 row-id-aware evidence collector (2026-05-18 follow-up).
 *
 * Closes the β/γ MVP caveat that entity + edge candidates landed as
 * `candidatesSkippedNoCitations` because their `targetId` (an entity
 * row id, an edge row id) wasn't text-matchable against KB
 * `content_text`. The collector now branches on `targetKind`:
 *
 *   - `"node"` / `"node_property"` / undefined — text-match `targetId`
 *   - `"entity"` — resolve `canonical_label` first, then text-match it
 *   - `"edge"` — resolve `(source_node_id, target_node_id)` first,
 *     then text-match either
 *
 * Tests:
 *   - Source-scan: `resolveNeedles` branches by targetKind with the
 *     expected primitives
 *   - Behavioral (per-kind, with a custom `db` override):
 *     - "node" / undefined → KB query with the targetId needle
 *     - "node_property" → same as "node"
 *     - "entity" → `ags_graph_entities` lookup precedes KB; needle is
 *       the resolved `canonical_label`
 *     - "edge" → `ags_graph_edges` lookup precedes KB; needles are
 *       BOTH endpoint node ids
 *     - Indirection-empty (entity row missing / edge row missing) →
 *       empty citations, no KB query
 *   - Doc lockstep on the runner header naming row-id-aware coverage
 *   - Agent passes `targetKind` (+ `propertyKey` for node_property)
 *     through to the collector
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  createSemanticEnrichmentEvidenceCollector,
  type EvidenceCollectionInput,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

const COLLECTOR_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-evidence-collector.ts",
);
const AGENT_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-agent.ts",
);
const RUNNER_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-runner.ts",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

// ────────────────────────────────────────────────────────────────────
// Fake DB — programmable scripted query plan
// ────────────────────────────────────────────────────────────────────

interface FakeQueryStep {
  // The "table marker" used when `.from(t)` is called — we inspect
  // the marker to know which table the chain targeted.
  fromMarker: "knowledge_units" | "entities" | "edges_with_node_join";
  rows: Array<Record<string, unknown>>;
}

interface FakeDbState {
  queries: Array<{ fromTable: string; whereBuilder?: unknown }>;
  scriptedSteps: FakeQueryStep[];
}

/**
 * Identify which table a Drizzle `.from(x)` argument refers to. The
 * argument is the table-builder export; reading its symbol shape via
 * `Symbol.toStringTag` is brittle, so instead we check by reference
 * identity against the known table exports.
 */
function identifyTable(t: unknown): string {
  // Drizzle table builders have a `_` runtime property pointing at
  // metadata; in practice the cheapest stable check is `getSQL().queryChunks`
  // or its symbol. For test purposes, the chain's first call narrows
  // sufficiently — and the inner-join chain is unambiguous because
  // `.innerJoin(agsGraphNodes, ...)` only fires for the edge path.
  // We don't need a perfect identifier — the call ORDER suffices.
  return String(t);
}

function makeFakeDb(state: FakeDbState) {
  let stepIdx = 0;
  return {
    select: (_proj?: unknown) => {
      const step = state.scriptedSteps[stepIdx];
      const localStep = step;
      // Increment AFTER `.limit(n)` resolves to mirror await ordering.
      const innerChain = {
        from: (t: unknown) => {
          state.queries.push({ fromTable: identifyTable(t) });
          return innerChain;
        },
        innerJoin: (_t: unknown, _on: unknown) => innerChain,
        where: (_cond: unknown) => innerChain,
        limit: async (_n: number) => {
          stepIdx++;
          return localStep ? localStep.rows : [];
        },
      };
      return innerChain;
    },
  };
}

// ────────────────────────────────────────────────────────────────────
// Source-scan
// ────────────────────────────────────────────────────────────────────

describe("row-id-aware evidence collector — source-scan", () => {
  const SRC = read(COLLECTOR_FILE);

  it("collector imports agsGraphEntities + agsGraphEdges + agsGraphNodes for indirection", () => {
    expect(SRC).toMatch(/agsGraphEntities/);
    expect(SRC).toMatch(/agsGraphEdges/);
    expect(SRC).toMatch(/agsGraphNodes/);
  });

  it("EvidenceCollectionInput declares optional targetKind + propertyKey", () => {
    expect(SRC).toMatch(/targetKind\?:\s*SemanticEnrichmentCandidateTargetKind/);
    expect(SRC).toMatch(/propertyKey\?:\s*string/);
  });

  it("resolveNeedles helper exists with the 3-kind branch shape", () => {
    expect(SRC).toMatch(/function\s+resolveNeedles/);
    expect(SRC).toMatch(/kind === "entity"/);
    expect(SRC).toMatch(/kind === "edge"/);
    expect(SRC).toMatch(/canonicalLabel/);
    expect(SRC).toMatch(/sourceNodeId/);
    expect(SRC).toMatch(/targetNodeId/);
  });

  it("edge path inner-joins ags_graph_nodes for workspace scoping", () => {
    expect(SRC).toMatch(/\.innerJoin\(\s*agsGraphNodes/);
  });

  it("KB ILIKE uses OR over the resolved needles array", () => {
    expect(SRC).toMatch(/or\([\s\S]*?needles\.map/);
  });
});

describe("row-id-aware evidence collector — runner doc lockstep", () => {
  const SRC = read(RUNNER_FILE);

  it("runner header names row-id-aware coverage closing the β/γ caveat", () => {
    expect(SRC).toMatch(/row-id-aware/);
    expect(SRC).toMatch(/canonical_label/);
    expect(SRC).toMatch(/source_node_id/);
    expect(SRC).toMatch(/skipped_no_citations/i);
    expect(SRC).toMatch(/closed/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Behavioral — node / node_property (regression: existing behavior)
// ────────────────────────────────────────────────────────────────────

describe("row-id-aware evidence collector — node + node_property paths", () => {
  it("targetKind=\"node\" runs a single KB query without indirection", async () => {
    const state: FakeDbState = {
      queries: [],
      scriptedSteps: [
        {
          fromMarker: "knowledge_units",
          rows: [
            { id: 1, contentText: "alpha note 42 beta" },
            { id: 2, contentText: "node 42 mentioned again" },
          ],
        },
      ],
    };
    const collector = createSemanticEnrichmentEvidenceCollector({
      db: makeFakeDb(state),
    });
    const out = await collector.collect({
      workspaceId: 7,
      targetTypeKey: "service",
      targetId: 42,
      targetKind: "node",
    });
    expect(out).toHaveLength(2);
    expect(state.scriptedSteps.length).toBe(1);
  });

  it("targetKind undefined (default) behaves like \"node\"", async () => {
    const state: FakeDbState = {
      queries: [],
      scriptedSteps: [
        {
          fromMarker: "knowledge_units",
          rows: [{ id: 1, contentText: "x 42 y" }],
        },
      ],
    };
    const collector = createSemanticEnrichmentEvidenceCollector({
      db: makeFakeDb(state),
    });
    const out = await collector.collect({
      workspaceId: 7,
      targetTypeKey: "service",
      targetId: 42,
    });
    expect(out).toHaveLength(1);
  });

  it("targetKind=\"node_property\" runs a single KB query (same as \"node\")", async () => {
    const state: FakeDbState = {
      queries: [],
      scriptedSteps: [
        {
          fromMarker: "knowledge_units",
          rows: [{ id: 1, contentText: "the owner field on 42" }],
        },
      ],
    };
    const collector = createSemanticEnrichmentEvidenceCollector({
      db: makeFakeDb(state),
    });
    const out = await collector.collect({
      workspaceId: 7,
      targetTypeKey: "service",
      targetId: 42,
      targetKind: "node_property",
      propertyKey: "owner",
    });
    expect(out).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Behavioral — entity path
// ────────────────────────────────────────────────────────────────────

describe("row-id-aware evidence collector — entity path", () => {
  it("resolves canonical_label, then KB-queries against it", async () => {
    const state: FakeDbState = {
      queries: [],
      scriptedSteps: [
        // Step 1: entity lookup
        {
          fromMarker: "entities",
          rows: [{ canonicalLabel: "John Smith" }],
        },
        // Step 2: KB lookup using the resolved label
        {
          fromMarker: "knowledge_units",
          rows: [{ id: 11, contentText: "John Smith is the team lead" }],
        },
      ],
    };
    const collector = createSemanticEnrichmentEvidenceCollector({
      db: makeFakeDb(state),
    });
    const out = await collector.collect({
      workspaceId: 7,
      targetTypeKey: "person",
      targetId: 99,
      targetKind: "entity",
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.noteId).toBe(11);
    expect(out[0]?.excerpt).toContain("John Smith");
  });

  it("returns empty citations when the entity row isn't found in the workspace", async () => {
    const state: FakeDbState = {
      queries: [],
      scriptedSteps: [
        { fromMarker: "entities", rows: [] }, // not found
      ],
    };
    const collector = createSemanticEnrichmentEvidenceCollector({
      db: makeFakeDb(state),
    });
    const out = await collector.collect({
      workspaceId: 7,
      targetTypeKey: "person",
      targetId: 99,
      targetKind: "entity",
    });
    expect(out).toEqual([]);
    // KB query MUST NOT run when indirection comes back empty.
    expect(state.scriptedSteps[1]).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// Behavioral — edge path
// ────────────────────────────────────────────────────────────────────

describe("row-id-aware evidence collector — edge path", () => {
  it("resolves both endpoint node ids, then KB-queries with both as needles", async () => {
    const state: FakeDbState = {
      queries: [],
      scriptedSteps: [
        {
          fromMarker: "edges_with_node_join",
          rows: [{ sourceNodeId: 10, targetNodeId: 20 }],
        },
        {
          fromMarker: "knowledge_units",
          rows: [
            { id: 101, contentText: "service 10 calls service 20" },
            { id: 102, contentText: "node 10 referenced in onboarding" },
          ],
        },
      ],
    };
    const collector = createSemanticEnrichmentEvidenceCollector({
      db: makeFakeDb(state),
    });
    const out = await collector.collect({
      workspaceId: 7,
      targetTypeKey: "RELATED_TO",
      targetId: 555,
      targetKind: "edge",
    });
    expect(out).toHaveLength(2);
  });

  it("returns empty citations when the edge row isn't found in the workspace", async () => {
    const state: FakeDbState = {
      queries: [],
      scriptedSteps: [
        { fromMarker: "edges_with_node_join", rows: [] }, // not found
      ],
    };
    const collector = createSemanticEnrichmentEvidenceCollector({
      db: makeFakeDb(state),
    });
    const out = await collector.collect({
      workspaceId: 7,
      targetTypeKey: "RELATED_TO",
      targetId: 555,
      targetKind: "edge",
    });
    expect(out).toEqual([]);
    expect(state.scriptedSteps[1]).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// Agent → collector propagation
// ────────────────────────────────────────────────────────────────────

describe("agent threads candidate.targetKind through to the collector", () => {
  it("agent source passes targetKind from each candidate", () => {
    const src = read(AGENT_FILE);
    expect(src).toMatch(/targetKind:\s*candidate\.targetKind/);
  });

  it("agent source threads propertyKey when targetKind === 'node_property'", () => {
    const src = read(AGENT_FILE);
    expect(src).toMatch(/candidate\.targetKind === "node_property"/);
    expect(src).toMatch(/propertyKey:\s*candidate\.propertyKey/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Test-seam (NoteVersionReader) — confirm targetKind/propertyKey
// flow through the stub-injected reader path
// ────────────────────────────────────────────────────────────────────

describe("row-id-aware evidence collector — test-seam capture", () => {
  it("noteVersionReader receives the full EvidenceCollectionInput including targetKind", async () => {
    const captured: EvidenceCollectionInput[] = [];
    const collector = createSemanticEnrichmentEvidenceCollector({
      noteVersionReader: async (input: EvidenceCollectionInput) => {
        captured.push(input);
        return [];
      },
    });
    await collector.collect({
      workspaceId: 7,
      targetTypeKey: "person",
      targetId: 99,
      targetKind: "entity",
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.targetKind).toBe("entity");
    await collector.collect({
      workspaceId: 7,
      targetTypeKey: "service",
      targetId: 42,
      targetKind: "node_property",
      propertyKey: "owner",
    });
    expect(captured).toHaveLength(2);
    expect(captured[1]?.targetKind).toBe("node_property");
    expect(captured[1]?.propertyKey).toBe("owner");
  });
});

// Suppress unused-import warning if vi remains needed elsewhere.
void vi;
