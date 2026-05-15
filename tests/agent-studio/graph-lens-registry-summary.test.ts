/**
 * Phase 24 §T-F.9 — graph-lens registry summary lockstep.
 *
 * Tests `summarizeGraphLensRegistry` over the runtime registry. Uses
 * `__resetGraphLensRegistryForTests` to set up deterministic state
 * per test.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  GRAPH_LENS_KINDS,
  GRAPH_LENS_LAYOUTS,
  GRAPH_LENS_GOVERNANCE_SCOPES,
  registerGraphLens,
  summarizeGraphLensRegistry,
  __resetGraphLensRegistryForTests,
  type GraphLensDefinition,
} from "../../server/agent-studio/services/graph-lens/public-api.js";

function makeDef(overrides: Partial<GraphLensDefinition> = {}): GraphLensDefinition {
  return {
    id: "test_lens",
    kind: "rag",
    label: "Test Lens",
    layout: "force_directed",
    governanceScope: "workspace_public",
    ...overrides,
  };
}

beforeEach(() => {
  __resetGraphLensRegistryForTests();
});

describe("summarizeGraphLensRegistry (T-F.9)", () => {
  it("empty registry → total=0 + every key at 0", () => {
    const s = summarizeGraphLensRegistry();
    expect(s.total).toBe(0);
    for (const k of GRAPH_LENS_KINDS) expect(s.byKind[k]).toBe(0);
    for (const l of GRAPH_LENS_LAYOUTS) expect(s.byLayout[l]).toBe(0);
    for (const g of GRAPH_LENS_GOVERNANCE_SCOPES) {
      expect(s.byGovernanceScope[g]).toBe(0);
    }
  });

  it("counts a single registered lens in all 3 axes", () => {
    registerGraphLens(makeDef());
    const s = summarizeGraphLensRegistry();
    expect(s.total).toBe(1);
    expect(s.byKind.rag).toBe(1);
    expect(s.byLayout.force_directed).toBe(1);
    expect(s.byGovernanceScope.workspace_public).toBe(1);
  });

  it("aggregates a mixed set of lenses correctly", () => {
    registerGraphLens(makeDef({ id: "a", kind: "rag", layout: "tree" }));
    registerGraphLens(makeDef({ id: "b", kind: "rag", layout: "matrix" }));
    registerGraphLens(
      makeDef({ id: "c", kind: "cag", layout: "tree", governanceScope: "admin_only" }),
    );
    const s = summarizeGraphLensRegistry();
    expect(s.total).toBe(3);
    expect(s.byKind.rag).toBe(2);
    expect(s.byKind.cag).toBe(1);
    expect(s.byLayout.tree).toBe(2);
    expect(s.byLayout.matrix).toBe(1);
    expect(s.byGovernanceScope.workspace_public).toBe(2);
    expect(s.byGovernanceScope.admin_only).toBe(1);
  });

  it("Σ byKind == total", () => {
    registerGraphLens(makeDef({ id: "a" }));
    registerGraphLens(makeDef({ id: "b", kind: "cag" }));
    const s = summarizeGraphLensRegistry();
    const sum = Object.values(s.byKind).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.total);
  });

  it("Σ byLayout == total", () => {
    registerGraphLens(makeDef({ id: "a", layout: "tree" }));
    registerGraphLens(makeDef({ id: "b", layout: "matrix" }));
    const s = summarizeGraphLensRegistry();
    const sum = Object.values(s.byLayout).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.total);
  });

  it("Σ byGovernanceScope == total", () => {
    registerGraphLens(makeDef({ id: "a" }));
    registerGraphLens(
      makeDef({ id: "b", governanceScope: "workspace_members" }),
    );
    const s = summarizeGraphLensRegistry();
    const sum = Object.values(s.byGovernanceScope).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.total);
  });

  it("stable-shape: every closed-taxonomy axis key present", () => {
    registerGraphLens(makeDef());
    const s = summarizeGraphLensRegistry();
    expect(Object.keys(s.byKind).length).toBe(GRAPH_LENS_KINDS.length);
    expect(Object.keys(s.byLayout).length).toBe(GRAPH_LENS_LAYOUTS.length);
    expect(Object.keys(s.byGovernanceScope).length).toBe(
      GRAPH_LENS_GOVERNANCE_SCOPES.length,
    );
  });
});
