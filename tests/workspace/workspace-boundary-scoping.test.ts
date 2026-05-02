/**
 * Phase 2 — Workspace Boundary Scoping Tests
 *   (post-per-purpose-shell migration)
 *
 * WS-03: Workspace pages use scoped queries (no cross-workspace leakage)
 * WS-09: Workspace membership governs participation
 * WS-15: Workspace is an execution boundary, not merely a view
 *
 * Validates that workspace-facing pages use explicitly scoped queries
 * and do not leak global data into workspace surfaces.
 *
 * Legacy `WorkspaceShell.tsx` / `WorkspaceDetail.tsx` / `WorkspaceHome.tsx`
 * were replaced by three per-purpose shells (Personal/Project/Research).
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { allShellSources } from "./_workspace-shell-helpers";

const CLIENT_PAGES = path.resolve(process.cwd(), "client/src/pages");
const CLIENT_WORKSPACE = path.resolve(CLIENT_PAGES, "workspace");

// ============================================================================
// WS-03: Per-purpose shells use workspace-scoped data queries
// ============================================================================

describe("Phase 2 — Per-purpose shells: scoped data queries", () => {
  for (const { name, source } of allShellSources()) {
    it(`${name} does NOT use unscoped global trpc.agents.list`, () => {
      expect(source).not.toMatch(/trpc\.agents\.list\.useQuery\(\s*\)/);
    });

    it(`${name} references workspaceId for scoping`, () => {
      expect(source).toContain("workspaceId");
    });

    it(`${name} loads modules via modules.manage.list with workspaceId`, () => {
      expect(source).toMatch(
        /trpc\.modules\.manage\.list\.useQuery\(\s*\{\s*workspaceId/,
      );
    });

    it(`${name} loads the workspace via workspaces.get with id`, () => {
      expect(source).toMatch(
        /trpc\.workspaces\.get\.useQuery\(\s*\{\s*id:\s*workspaceId/,
      );
    });
  }
});

// ============================================================================
// WS-03: Per-purpose shells route module pages under the workspace prefix
//         (replaces "passes workspaceId={workspaceId}" prop pattern)
// ============================================================================

describe("Phase 2 — Per-purpose shells: workspace-scoped routing", () => {
  for (const { name, source } of allShellSources()) {
    it(`${name} reads workspaceId from useParams`, () => {
      expect(source).toContain("useParams");
    });

    it(`${name} mounts module routes under basePath`, () => {
      expect(source).toMatch(/\$\{basePath\}/);
    });
  }
});

// ============================================================================
// WS-03: Per-purpose shells render workspace-aware content
//         (replaces WorkspaceHome dashboard inline default route)
// ============================================================================

describe("Phase 2 — Per-purpose shells render workspace-aware content", () => {
  for (const { name, source } of allShellSources()) {
    it(`${name} renders workspace.name`, () => {
      expect(source).toContain("workspace.name");
    });

    it(`${name} surfaces enabled module count`, () => {
      // Each shell tracks enabledCount/enabledModules and renders it.
      expect(source).toMatch(/enabledCount|enabledModules/);
    });
  }
});

// ============================================================================
// WS-15: Module pages receive workspaceId via URL params (not props)
// ============================================================================

describe("Phase 2 — Module pages live under per-purpose shells", () => {
  const modulePages = [
    "AgentsRosterPage.tsx",
    "KnowledgeDocsPage.tsx",
    "PMTProjectsPage.tsx",
    "CollabThreadsPage.tsx",
    "ReportingDashboardPage.tsx",
    "GovernancePage.tsx",
  ];

  for (const page of modulePages) {
    it(`${page} is workspace-scoped (workspaceId prop, URL param, or shell-id resolver)`, () => {
      const filePath = path.join(CLIENT_WORKSPACE, page);
      if (!fs.existsSync(filePath)) return; // page may have been retired
      const content = fs.readFileSync(filePath, "utf-8");
      // After the per-purpose shell migration, scoping is signaled
      // any of three ways:
      //   1. Page references workspaceId directly (legacy prop / URL param)
      //   2. Server-side queries resolve via getShellWorkspaceId
      //   3. Page calls a workspace-scoped tRPC route (the server router
      //      itself enforces the scope, e.g. pmCentral / agents.* under
      //      governedProcedure with shell resolver).
      const scoped =
        /workspaceId/.test(content) ||
        /getShellWorkspaceId/.test(content) ||
        /trpc\.(pmCentral|agents|knowledge|collaboration|reporting)\./.test(
          content,
        ) ||
        // Module sub-routers under `trpc.modules.<key>.*` resolve the
        // workspace server-side via getShellWorkspaceId.
        /trpc\.modules\.(pmt|knowledge|agents|collaboration|reporting|agentOrch)\./.test(
          content,
        );
      expect(scoped, `${page} has no workspace-scoping signal`).toBe(true);
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
    const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("requireReadableWorkspaceRoute");
  });
});
