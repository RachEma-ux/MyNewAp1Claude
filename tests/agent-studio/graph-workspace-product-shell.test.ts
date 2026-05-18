/**
 * PW — Graph Workspace product shell source-scan integrity.
 *
 * Locks the structural invariants of the new workspace shell + 10
 * client components. Behavioral coverage of the tRPC surface lives
 * in p0-neo4j-traversal-permission-explain.test.ts +
 * graph-workspace-router.test.ts; this test ensures the UI files
 * compose the expected primitives and don't break any hard rule.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const COMPONENT_DIR = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace",
);
const PAGE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/pages/GraphWorkspacePage.tsx",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("PW — shell composition", () => {
  it("graph-workspace component directory contains all 10 product files + barrel", () => {
    for (const f of [
      "VaultExplorer.tsx",
      "MarkdownEditorPane.tsx",
      "WikilinksBacklinksPanel.tsx",
      "LocalGraphView.tsx",
      "GlobalGraphView.tsx",
      "GraphInspector.tsx",
      "ImpactAnalysisView.tsx",
      "RuntimeAndDecisionTraceView.tsx",
      "WorkspaceStateLayer.tsx",
      "index.ts",
    ]) {
      expect(existsSync(resolve(COMPONENT_DIR, f)), `missing ${f}`).toBe(true);
    }
  });

  it("page composes every workspace component + preserves the 3 observability panels", () => {
    const src = read(PAGE);
    for (const imported of [
      "VaultExplorer",
      "MarkdownEditorPane",
      "WikilinksBacklinksPanel",
      "LocalGraphView",
      "GlobalGraphView",
      "GraphInspector",
      "ImpactAnalysisView",
      "RuntimeAndDecisionTraceView",
      "WorkspaceStateLayer",
      "GraphSkillUsagePanel",
      "GraphAgentExplainPanel",
      "GraphSchemaSummaryPanel",
      "GraphQualityFindingsPanel",
    ]) {
      expect(src, `${imported} not imported in page`).toMatch(
        new RegExp(`\\b${imported}\\b`),
      );
    }
  });

  it("page declares the 6 workspace tabs", () => {
    const src = read(PAGE);
    for (const tab of [
      "editor",
      "local_graph",
      "global_graph",
      "impact",
      "trace",
      "observability",
    ]) {
      expect(src).toMatch(new RegExp(`["']${tab}["']`));
    }
  });
});

describe("PW — WorkspaceStateLayer taxonomy lock", () => {
  it("declares all 11 explicit states (item 25 acceptance)", async () => {
    const { WORKSPACE_STATE_METADATA } = await import(
      "../../client/src/modules/agent-studio/components/graph-workspace/WorkspaceStateLayer"
    );
    expect(Object.keys(WORKSPACE_STATE_METADATA).sort()).toEqual(
      [
        "empty_graph",
        "empty_vault",
        "graph_query_timeout",
        "hidden_reference",
        "loading",
        "neo4j_unavailable",
        "permission_denied",
        "projection_drift",
        "projection_stale",
        "read_only",
        "save_conflict",
        "stale_search_index",
      ].sort(),
    );
  });

  it("classifyWorkspaceState maps tRPC FORBIDDEN → permission_denied", async () => {
    const { classifyWorkspaceState } = await import(
      "../../client/src/modules/agent-studio/components/graph-workspace/WorkspaceStateLayer"
    );
    expect(
      classifyWorkspaceState({ trpcError: { code: "FORBIDDEN" } }),
    ).toBe("permission_denied");
  });

  it("classifyWorkspaceState maps failure-state keys to the right slides", async () => {
    const { classifyWorkspaceState } = await import(
      "../../client/src/modules/agent-studio/components/graph-workspace/WorkspaceStateLayer"
    );
    expect(
      classifyWorkspaceState({ failureStateKey: "neo4j_unavailable" }),
    ).toBe("neo4j_unavailable");
    expect(
      classifyWorkspaceState({ failureStateKey: "neo4j_query_timeout" }),
    ).toBe("graph_query_timeout");
    expect(
      classifyWorkspaceState({ failureStateKey: "neo4j_projection_stale" }),
    ).toBe("projection_stale");
    expect(
      classifyWorkspaceState({ failureStateKey: "projection_sync_failed" }),
    ).toBe("projection_drift");
    expect(
      classifyWorkspaceState({ failureStateKey: "note_conflict" }),
    ).toBe("save_conflict");
    expect(
      classifyWorkspaceState({
        failureStateKey: "runtime_reference_hidden_by_permission",
      }),
    ).toBe("hidden_reference");
  });

  it("classifyWorkspaceState maps emptyResultKind correctly", async () => {
    const { classifyWorkspaceState } = await import(
      "../../client/src/modules/agent-studio/components/graph-workspace/WorkspaceStateLayer"
    );
    expect(classifyWorkspaceState({ emptyResultKind: "vault" })).toBe("empty_vault");
    expect(classifyWorkspaceState({ emptyResultKind: "graph" })).toBe("empty_graph");
    expect(classifyWorkspaceState({ readOnly: true })).toBe("read_only");
  });
});

describe("PW — Hard-rule + no-mock-data discipline", () => {
  it("no graph-workspace UI file uses mock/fake static graph data arrays", () => {
    // Smoke: forbid common mock patterns. Each panel queries via tRPC;
    // any file declaring a hardcoded nodes array would be a mock.
    for (const f of [
      "LocalGraphView.tsx",
      "GlobalGraphView.tsx",
      "ImpactAnalysisView.tsx",
      "GraphInspector.tsx",
      "RuntimeAndDecisionTraceView.tsx",
    ]) {
      const src = read(resolve(COMPONENT_DIR, f));
      expect(
        src,
        `${f} appears to declare a static graph node array`,
      ).not.toMatch(
        /const\s+\w*[Mm]ock\w*\s*=|const\s+\w*FAKE\w*\s*=|const\s+\w*Stub\w*Nodes\s*=/,
      );
    }
  });

  it("no graph-workspace UI file imports neo4j-driver", () => {
    for (const f of [
      "LocalGraphView.tsx",
      "GlobalGraphView.tsx",
      "ImpactAnalysisView.tsx",
      "GraphInspector.tsx",
      "RuntimeAndDecisionTraceView.tsx",
      "VaultExplorer.tsx",
      "MarkdownEditorPane.tsx",
      "WikilinksBacklinksPanel.tsx",
      "WorkspaceStateLayer.tsx",
    ]) {
      const src = read(resolve(COMPONENT_DIR, f));
      expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
    }
  });

  it("no graph-workspace UI file reads process.env API keys", () => {
    for (const f of [
      "LocalGraphView.tsx",
      "GlobalGraphView.tsx",
      "ImpactAnalysisView.tsx",
      "GraphInspector.tsx",
      "RuntimeAndDecisionTraceView.tsx",
      "VaultExplorer.tsx",
      "MarkdownEditorPane.tsx",
      "WikilinksBacklinksPanel.tsx",
    ]) {
      const src = read(resolve(COMPONENT_DIR, f));
      expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
    }
  });

  it("MarkdownEditorPane uses existing AppStreamdown for reading mode (no second renderer)", () => {
    const src = read(resolve(COMPONENT_DIR, "MarkdownEditorPane.tsx"));
    expect(src).toMatch(/AppStreamdown/);
  });

  it("editor's save path uses the existing vault.updateNote tRPC procedure (no duplicate persistence)", () => {
    const src = read(resolve(COMPONENT_DIR, "MarkdownEditorPane.tsx"));
    expect(src).toMatch(/agentStudio\.vault\.updateNote/);
  });

  // B1 — Auto-save: dirty drafts auto-flush after AUTO_SAVE_DEBOUNCE_MS.
  // The structural test locks the wiring so a future refactor that
  // removes the debounce won't silently regress Obsidian-style autosave.
  it("MarkdownEditorPane wires debounced auto-save via setTimeout + handleSave", () => {
    const src = read(resolve(COMPONENT_DIR, "MarkdownEditorPane.tsx"));
    expect(src).toMatch(/AUTO_SAVE_DEBOUNCE_MS/);
    expect(src).toMatch(/setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*?handleSave\(\)/);
    expect(src).toMatch(/clearTimeout/);
    expect(src).toMatch(/data-testid="markdown-editor-saving-flag"/);
    expect(src).toMatch(/Save now/);
  });

  // Auto-save must NOT fire while a conflict is unresolved — the
  // operator has to reconcile the save_conflict surface before further
  // edits flush. Lock the guard so it can't quietly disappear.
  it("MarkdownEditorPane auto-save effect guards on !conflict and !readOnly", () => {
    const src = read(resolve(COMPONENT_DIR, "MarkdownEditorPane.tsx"));
    expect(src).toMatch(/!dirty\s*\|\|\s*readOnly\s*\|\|\s*conflict/);
  });

  it("vault explorer uses existing vault.listMyVaults + vault.listNotes (reuse-first)", () => {
    const src = read(resolve(COMPONENT_DIR, "VaultExplorer.tsx"));
    expect(src).toMatch(/agentStudio\.vault\.listMyVaults/);
    expect(src).toMatch(/agentStudio\.vault\.listNotes/);
  });

  it("graph views go through graphWorkspace tRPC router (no direct repository import)", () => {
    for (const [file, query] of [
      ["LocalGraphView.tsx", "agentStudio.graphWorkspace.localGraph"],
      ["GlobalGraphView.tsx", "agentStudio.graphWorkspace.globalGraphSample"],
      ["GraphInspector.tsx", "agentStudio.graphWorkspace.explainNode"],
      ["GraphInspector.tsx", "agentStudio.graphWorkspace.explainPath"],
      ["ImpactAnalysisView.tsx", "agentStudio.graphWorkspace.runImpactTemplate"],
    ] as const) {
      const src = read(resolve(COMPONENT_DIR, file));
      const escaped = query.replace(/\./g, "\\.");
      expect(src, `${file} missing ${query}`).toMatch(new RegExp(escaped));
    }
  });
});
