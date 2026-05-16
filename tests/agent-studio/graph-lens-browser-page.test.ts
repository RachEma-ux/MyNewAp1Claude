/**
 * Graph Lens browser page — source-scan integrity (T-F.62).
 *
 * Cheap structural tests that lock the route / shell / sidebar /
 * panel wiring without booting the React app. Pattern mirrors the
 * other admin-page wiring tests in this directory.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), "utf8");
}

// ============================================================================
// Page + panel files exist with the expected shape
// ============================================================================

describe("Graph lens browser — page + panel", () => {
  it("page exports default GraphLensBrowserPage and mounts the panel", () => {
    const src = read(
      "client/src/modules/agent-studio/pages/GraphLensBrowserPage.tsx",
    );
    expect(src).toMatch(/export\s+default\s+function\s+GraphLensBrowserPage\(/);
    expect(src).toContain("GraphLensBrowserPanel");
    expect(src).toContain("Graph lens browser");
  });

  it("panel calls the three graphLens tRPC procedures", () => {
    const src = read(
      "client/src/modules/agent-studio/components/GraphLensBrowserPanel.tsx",
    );
    expect(src).toContain("agentStudio.graphLens.list");
    expect(src).toContain("agentStudio.graphLens.summary");
    expect(src).toContain("agentStudio.graphLens.render");
  });

  it("panel renders the three discriminated render-envelope states", () => {
    const src = read(
      "client/src/modules/agent-studio/components/GraphLensBrowserPanel.tsx",
    );
    expect(src).toContain("graph-lens-render-not-found");
    expect(src).toContain("graph-lens-render-no-runner");
    expect(src).toContain("graph-lens-render-ok");
    expect(src).toContain("graph-lens-render-empty");
  });

  it("panel surfaces runner-coverage gauge + missing-kinds list", () => {
    const src = read(
      "client/src/modules/agent-studio/components/GraphLensBrowserPanel.tsx",
    );
    expect(src).toContain("graph-lens-runner-coverage");
    expect(src).toContain("missingKinds");
  });

  it("panel renders by-typeKey rollup + first-15 nodes + first-15 edges previews", () => {
    const src = read(
      "client/src/modules/agent-studio/components/GraphLensBrowserPanel.tsx",
    );
    expect(src).toContain("graph-lens-render-by-typekey");
    expect(src).toContain("graph-lens-render-nodes-preview");
    expect(src).toContain("graph-lens-render-edges-preview");
    expect(src).toContain(".slice(0, 15)");
  });
});

// ============================================================================
// Shell wiring — path → view → component
// ============================================================================

describe("Graph lens browser — shell wiring", () => {
  it("AgentStudioShell lazy-imports GraphLensBrowserPage", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(\s*"\.\.\/pages\/GraphLensBrowserPage"/);
  });

  it("AgentStudioShell parses /agent-studio/graph-lens-browser path", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );
    expect(src).toContain("/agent-studio/graph-lens-browser");
    expect(src).toMatch(/view:\s*"graph-lens-browser"/);
  });

  it("AgentStudioShell renders <GraphLensBrowserPage /> for the view", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );
    expect(src).toMatch(/case\s+"graph-lens-browser"[\s\S]{0,200}<GraphLensBrowserPage/);
  });
});

// ============================================================================
// Sidebar wiring
// ============================================================================

describe("Graph lens browser — sidebar wiring", () => {
  it("AgentStudioSidebar lists graph-lens-browser in the view union + a nav group", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );
    expect(src).toContain('| "graph-lens-browser"');
    expect(src).toMatch(/key:\s*"graph-lens-browser"/);
    expect(src).toContain("Lens Browser");
  });

  it("AgentStudioSidebar uses the Telescope icon for the new entry", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );
    expect(src).toMatch(/Telescope[,\s]/);
  });
});

// ============================================================================
// Routes registry
// ============================================================================

describe("Graph lens browser — routes registry", () => {
  it("routes.tsx registers /agent-studio/graph-lens-browser", () => {
    const src = read("client/src/modules/agent-studio/routes.tsx");
    expect(src).toContain("/agent-studio/graph-lens-browser");
  });
});

// ============================================================================
// Boundary — panel must not import the runner registry directly
// ============================================================================

describe("Graph lens browser — boundary discipline", () => {
  it("panel does not import the server-side graph-lens public-api", () => {
    const src = read(
      "client/src/modules/agent-studio/components/GraphLensBrowserPanel.tsx",
    );
    // Client must call through tRPC, not import server modules.
    expect(src).not.toMatch(/from\s+["'][^"']*graph-lens\/public-api/);
    expect(src).not.toMatch(/from\s+["'][^"']*server\/agent-studio/);
  });
});
