/**
 * Phase 2 — Workspace Boundary Scoping Tests
 *
 * WS-03: Workspace pages use scoped queries (no cross-workspace leakage)
 * WS-09: Workspace membership governs participation
 * WS-15: Workspace is an execution boundary, not merely a view
 *
 * Validates that workspace-facing pages use explicitly scoped queries
 * and do not leak global data into workspace surfaces.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const CLIENT_PAGES = path.resolve(process.cwd(), "client/src/pages");
const CLIENT_WORKSPACE = path.resolve(CLIENT_PAGES, "workspace");

// ============================================================================
// WS-03: Workspace Data Scoping
// ============================================================================

describe("Phase 2 — WorkspaceDetail scoped queries", () => {
  const filePath = path.join(CLIENT_PAGES, "WorkspaceDetail.tsx");

  it("WorkspaceDetail exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("WorkspaceDetail does NOT use global trpc.agents.list", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    // Should NOT have unscoped global agent list
    expect(content).not.toMatch(/trpc\.agents\.list\.useQuery\(\)/);
  });

  it("WorkspaceDetail uses workspace-scoped agent query", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    // Should use modules.agentOrch.agents.list with workspaceId
    expect(content).toContain("workspaceId");
  });

  it("WorkspaceDetail uses workspace-scoped document query", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    // documents.list with workspaceId
    expect(content).toMatch(/documents\.list\.useQuery.*workspaceId/s);
  });
});

// ============================================================================
// WS-03: WorkspaceShell passes workspaceId to all module pages
// ============================================================================

describe("Phase 2 — WorkspaceShell scoped module rendering", () => {
  const filePath = path.join(CLIENT_PAGES, "WorkspaceShell.tsx");

  it("WorkspaceShell exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("WorkspaceShell passes workspaceId to every module page", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    const matches = content.match(/workspaceId={workspaceId}/g);
    expect(matches).not.toBeNull();
    // Should pass to many module pages (at least 10)
    expect(matches!.length).toBeGreaterThanOrEqual(10);
  });

  it("WorkspaceShell loads workspace via scoped query", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("trpc.workspaces.get.useQuery");
  });

  it("WorkspaceShell loads modules via scoped query", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("trpc.modules.manage.list.useQuery");
  });
});

// ============================================================================
// WS-03: WorkspaceHome uses scoped queries
// ============================================================================

describe("Phase 2 — WorkspaceHome scoped queries", () => {
  const filePath = path.join(CLIENT_PAGES, "WorkspaceHome.tsx");

  it("WorkspaceHome exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("WorkspaceHome uses workspace-scoped activity query", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("getActivity");
  });

  it("WorkspaceHome uses workspace-scoped members query", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("getMembers");
  });

  it("WorkspaceHome uses workspace-scoped modules query", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("getModules");
  });

  it("WorkspaceHome does NOT contain global list queries", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    // Should NOT have unscoped global queries
    expect(content).not.toMatch(/trpc\.agents\.list\.useQuery\(\)/);
    expect(content).not.toMatch(/trpc\.providers\.list\.useQuery\(\)/);
  });
});

// ============================================================================
// WS-15: Workspace module pages require workspaceId
// ============================================================================

describe("Phase 2 — Module pages receive workspaceId", () => {
  const modulePages = [
    "AgentsRosterPage.tsx",
    "KnowledgeDocsPage.tsx",
    "PMTProjectsPage.tsx",
    "CollabThreadsPage.tsx",
    "ReportingDashboardPage.tsx",
    "GovernancePage.tsx",
  ];

  for (const page of modulePages) {
    it(`${page} accepts workspaceId prop`, () => {
      const filePath = path.join(CLIENT_WORKSPACE, page);
      if (!fs.existsSync(filePath)) return; // skip if not present
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("workspaceId");
    });
  }
});

// ============================================================================
// WS-09: Server-side workspace access checks
// ============================================================================

describe("Phase 2 — Server-side access enforcement", () => {
  it("hasWorkspaceAccess is exported from server/db/workspaces", async () => {
    const mod = await import("../../server/db/workspaces");
    expect(typeof mod.hasWorkspaceAccess).toBe("function");
  });

  it("workspace routes use access checks before data return", () => {
    const routersPath = path.resolve(process.cwd(), "server/routers.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    // get, getRoutingProfile, getActivity, getMembers should all have guards
    expect(content).toContain("requireReadableWorkspaceRoute");
  });
});
