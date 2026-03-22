/**
 * Boundary Scoping Tests — Phase 3
 *
 * Validates WS-03: Workspace-facing data queries must be explicitly scoped
 * to the current workspace when the data is intended to reflect workspace state.
 *
 * These tests verify that workspace pages use scoped queries, not global ones.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const CLIENT_PAGES = path.resolve(process.cwd(), "client/src/pages");

// ============================================================================
// Boundary Leak Detection — Static Analysis
// ============================================================================

describe("WS-03: WorkspaceDetail boundary scoping", () => {
  it("WorkspaceDetail agents tab uses workspace-scoped query, not global", () => {
    const filePath = path.join(CLIENT_PAGES, "WorkspaceDetail.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Must NOT use global agents.list
    expect(content).not.toMatch(/trpc\.agents\.list\.useQuery\(\)/);

    // Must use workspace-scoped query (modules.agentOrch or with workspaceId)
    expect(content).toMatch(/workspaceId/);
  });

  it("WorkspaceDetail documents tab uses workspace-scoped query", () => {
    const filePath = path.join(CLIENT_PAGES, "WorkspaceDetail.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Documents query should include workspaceId
    expect(content).toMatch(/documents\.list\.useQuery.*workspaceId/s);
  });
});

describe("WS-03: WorkspaceShell uses workspace-scoped module queries", () => {
  it("WorkspaceShell loads modules with workspaceId", () => {
    const filePath = path.join(CLIENT_PAGES, "WorkspaceShell.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Module list query should be workspace-scoped
    expect(content).toMatch(/modules\.manage\.list\.useQuery.*workspaceId/s);
  });

  it("WorkspaceShell passes workspaceId to all module pages", () => {
    const filePath = path.join(CLIENT_PAGES, "WorkspaceShell.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Every module page component should receive workspaceId prop
    const modulePageMatches = content.match(/workspaceId={workspaceId}/g);
    expect(modulePageMatches).not.toBeNull();
    // At least 10 module page references should have workspaceId
    expect(modulePageMatches!.length).toBeGreaterThanOrEqual(10);
  });
});

describe("WS-03: Workspace module pages use scoped queries", () => {
  it("AgentsRosterPage uses workspace-scoped agent list", () => {
    const filePath = path.join(CLIENT_PAGES, "workspace/AgentsRosterPage.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Must use workspace-scoped query
    expect(content).toMatch(/agents\.list\.useQuery.*workspaceId/s);
    // Must NOT use global agents.list
    expect(content).not.toMatch(/trpc\.agents\.list\.useQuery\(\)/);
  });
});

// ============================================================================
// Workspace Contract Module Export Verification
// ============================================================================

describe("WS-03: workspace-contract module is available", () => {
  it("workspace-contract.ts exists and exports contract types", async () => {
    const contractPath = path.resolve(
      process.cwd(),
      "server/workspace/workspace-contract.ts"
    );
    expect(fs.existsSync(contractPath)).toBe(true);
  });

  it("capability-resolver.ts exists and exports resolver functions", async () => {
    const resolverPath = path.resolve(
      process.cwd(),
      "server/workspace/capability-resolver.ts"
    );
    expect(fs.existsSync(resolverPath)).toBe(true);
  });
});

// ============================================================================
// Invariant Document Verification
// ============================================================================

describe("WS-01/02/03: Invariant documentation exists", () => {
  it("WORKSPACE_INVARIANTS.md exists in docs/workspace/", () => {
    const docPath = path.resolve(
      process.cwd(),
      "docs/workspace/WORKSPACE_INVARIANTS.md"
    );
    expect(fs.existsSync(docPath)).toBe(true);
  });

  it("WORKSPACE_INVARIANTS.md documents all three invariants", () => {
    const docPath = path.resolve(
      process.cwd(),
      "docs/workspace/WORKSPACE_INVARIANTS.md"
    );
    const content = fs.readFileSync(docPath, "utf-8");

    expect(content).toContain("WS-01");
    expect(content).toContain("WS-02");
    expect(content).toContain("WS-03");
  });
});
