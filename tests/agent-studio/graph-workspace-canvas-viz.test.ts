/**
 * Graph Workspace force-directed viz — source-scan integrity.
 *
 * Locks the structural invariants for `LocalGraphCanvas` +
 * `GlobalGraphCanvas`, the visual companions to the text-based
 * `LocalGraphView` / `GlobalGraphView` panes. Shipped 2026-05-19
 * on top of the AsdbPostgresGraphRepository wiring (PR #1524) so
 * the canvas has real nodes + edges to render.
 *
 * Behavioral coverage (react-flow render) is intentionally NOT in
 * this test — that requires JSDOM + a full DOM and is significantly
 * heavier than the rest of the agent-studio source-scan layer. The
 * source-scan locks the wiring; runtime regressions surface via the
 * graph-workspace router tests + manual smoke.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const COMPONENT_DIR = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace",
);

function read(name: string): string {
  return readFileSync(resolve(COMPONENT_DIR, name), "utf8");
}

describe("Graph Workspace — canvas viz files exist", () => {
  it("LocalGraphCanvas + GlobalGraphCanvas + barrel updated", () => {
    expect(existsSync(resolve(COMPONENT_DIR, "LocalGraphCanvas.tsx"))).toBe(true);
    expect(existsSync(resolve(COMPONENT_DIR, "GlobalGraphCanvas.tsx"))).toBe(true);
    const barrel = read("index.ts");
    expect(barrel).toMatch(/export\s+\{\s*default\s+as\s+LocalGraphCanvas\s*\}/);
    expect(barrel).toMatch(/export\s+\{\s*default\s+as\s+GlobalGraphCanvas\s*\}/);
  });
});

describe("LocalGraphCanvas — wiring", () => {
  const src = read("LocalGraphCanvas.tsx");

  it("imports reactflow + its stylesheet", () => {
    expect(src).toMatch(/import\s+ReactFlow.*from\s+["']reactflow["']/s);
    expect(src).toMatch(/import\s+["']reactflow\/dist\/style\.css["']/);
  });

  it("queries the same tRPC procedure as LocalGraphView (no duplicate fetch surface)", () => {
    expect(src).toMatch(
      /trpc\.agentStudio\.graphWorkspace\.localGraph\.useQuery/,
    );
  });

  it("re-uses the canonical WorkspaceStateLayer + classifyWorkspaceState helpers", () => {
    expect(src).toMatch(/from\s+["']\.\/WorkspaceStateLayer["']/);
    expect(src).toMatch(/classifyWorkspaceState/);
  });

  it("renders Background + Controls + MiniMap (operator-grade affordances)", () => {
    expect(src).toMatch(/<Background\s/);
    expect(src).toMatch(/<Controls\s/);
    expect(src).toMatch(/<MiniMap\s/);
  });

  it("emits operator-test data-* attributes for the seed + counts", () => {
    expect(src).toMatch(/data-testid=["']local-graph-canvas["']/);
    expect(src).toMatch(/data-node-count=/);
    expect(src).toMatch(/data-edge-count=/);
  });

  it("hides the react-flow attribution per operator-grade requirement", () => {
    // Operator-facing surfaces should not advertise the underlying lib.
    expect(src).toMatch(/hideAttribution:\s*true/);
  });
});

describe("GlobalGraphCanvas — wiring", () => {
  const src = read("GlobalGraphCanvas.tsx");

  it("imports reactflow + its stylesheet", () => {
    expect(src).toMatch(/import\s+ReactFlow.*from\s+["']reactflow["']/s);
    expect(src).toMatch(/import\s+["']reactflow\/dist\/style\.css["']/);
  });

  it("queries globalGraphSample tRPC procedure", () => {
    expect(src).toMatch(
      /trpc\.agentStudio\.graphWorkspace\.globalGraphSample\.useQuery/,
    );
  });

  it("re-uses WorkspaceStateLayer + classifyWorkspaceState", () => {
    expect(src).toMatch(/from\s+["']\.\/WorkspaceStateLayer["']/);
    expect(src).toMatch(/classifyWorkspaceState/);
  });

  it("emits operator-test attributes", () => {
    expect(src).toMatch(/data-testid=["']global-graph-canvas["']/);
    expect(src).toMatch(/data-sample-size=/);
  });
});

describe("LocalGraphView — view-mode toggle", () => {
  const src = read("LocalGraphView.tsx");

  it("renders LocalGraphCanvas when viewMode === 'canvas'", () => {
    expect(src).toMatch(/import\s+LocalGraphCanvas/);
    expect(src).toMatch(/<LocalGraphCanvas\s/);
  });

  it("exposes canvas + list as the two view modes", () => {
    expect(src).toMatch(/VIEW_MODES\s*=\s*\["canvas",\s*"list"\]/);
  });

  it("emits data-view-mode on the section for operator tests", () => {
    expect(src).toMatch(/data-view-mode=\{viewMode\}/);
  });

  it("defaults the view mode to 'canvas' (so the new viz lights up by default)", () => {
    expect(src).toMatch(/defaultViewMode\s*=\s*["']canvas["']/);
  });

  it("preserves the text-list NodeList for screen-reader / list-mode operators", () => {
    expect(src).toMatch(/<NodeList\s/);
  });
});

describe("GlobalGraphView — view-mode toggle", () => {
  const src = read("GlobalGraphView.tsx");

  it("renders GlobalGraphCanvas when viewMode === 'canvas'", () => {
    expect(src).toMatch(/import\s+GlobalGraphCanvas/);
    expect(src).toMatch(/<GlobalGraphCanvas\s/);
  });

  it("emits data-view-mode on the section", () => {
    expect(src).toMatch(/data-view-mode=\{viewMode\}/);
  });

  it("defaults the view mode to 'canvas'", () => {
    expect(src).toMatch(/defaultViewMode\s*=\s*["']canvas["']/);
  });
});
