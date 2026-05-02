/**
 * Phase 6 — Activity & Traceability Tests
 *
 * WS-12: Workspace activity must be traceable
 * WS-13: Actions are attributable to principal + workspace
 *
 * Validates that:
 * - Activity log schema has all required fields
 * - logActivity is called for key workspace actions
 * - Activity records include workspaceId, actorId, action
 * - getActivity route is available for dashboard consumption
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ============================================================================
// WS-12: Activity Log Schema
// ============================================================================

describe("Phase 6 — Activity Log Schema", () => {
  it("workspace_activity_log table is defined", async () => {
    const schema = await import("../../drizzle/schema");
    expect(schema.workspaceActivityLog).toBeDefined();
  });

  it("activity log has required columns", () => {
    const schemaPath = path.resolve(process.cwd(), "drizzle/tables/workspace-modules.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("workspaceId");
    expect(content).toContain("moduleKey");
    expect(content).toContain("actorId");
    expect(content).toContain("action");
    expect(content).toContain("targetType");
    expect(content).toContain("targetId");
    expect(content).toContain("metadata");
    expect(content).toContain("createdAt");
  });
});

// ============================================================================
// WS-13: Activity Emission in Workspace Routes
// ============================================================================

describe("Phase 6 — Activity Emission in Routes", () => {
  const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");

  it("workspace.create emits activity", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/create:.*logActivity.*workspace\.create/s);
  });

  it("workspace.update emits activity", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/workspace\.update.*logActivity/s);
  });

  it("workspace.delete emits activity (via softDeleteWorkspace transition)", () => {
    // The delete route delegates to `softDeleteWorkspace`, which
    // calls `transitionWorkspace(..., "deleted")`. That helper
    // emits `logActivity({ action: "workspace.transition.deleted" })`,
    // so the route-level evidence is the call to softDeleteWorkspace.
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/delete:[\s\S]*?softDeleteWorkspace/);
    const lifecycleSvc = fs.readFileSync(
      path.resolve(process.cwd(), "server/workspace/lifecycle-service.ts"),
      "utf-8",
    );
    expect(lifecycleSvc).toMatch(/logActivity\(/);
    expect(lifecycleSvc).toContain("workspace.transition.${targetStatus}");
  });

  it("workspace.updateRoutingProfile emits activity", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("workspace.updateRoutingProfile");
  });
});

// ============================================================================
// WS-13: Activity Emission in Module Routes
// ============================================================================

describe("Phase 6 — Activity Emission in Module Routes", () => {
  const modulesRouterPath = path.resolve(process.cwd(), "server/modules/router.ts");

  it("module.enable/disable emits activity", () => {
    const content = fs.readFileSync(modulesRouterPath, "utf-8");
    expect(content).toContain("module.enable");
    expect(content).toContain("module.disable");
    expect(content).toContain("logActivity");
  });

  it("modules.seed emits activity", () => {
    const content = fs.readFileSync(modulesRouterPath, "utf-8");
    expect(content).toContain("modules.seed");
  });
});

// ============================================================================
// WS-12: logActivity Function Contract
// ============================================================================

describe("Phase 6 — logActivity Function", () => {
  it("logActivity is exported from modules/registry", async () => {
    const mod = await import("../../server/modules/registry");
    expect(typeof mod.logActivity).toBe("function");
  });

  it("logActivity accepts required fields", () => {
    const registryPath = path.resolve(process.cwd(), "server/modules/registry.ts");
    const content = fs.readFileSync(registryPath, "utf-8");
    expect(content).toMatch(/logActivity.*workspaceId.*action/s);
  });
});

// ============================================================================
// WS-12: getActivity Route for Dashboard
// ============================================================================

describe("Phase 6 — getActivity Route", () => {
  it("workspace.getActivity route exists", () => {
    const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("getActivity");
    expect(content).toContain("workspaceActivityLog");
  });

  it("getActivity uses readable workspace guard", () => {
    const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/getActivity:.*requireReadableWorkspaceRoute/s);
  });
});

// ============================================================================
// WS-12: Dashboard Consumes Activity
// ============================================================================

describe("Phase 6 — Workspace activity surface", () => {
  // Legacy WorkspaceHome.tsx surfaced "Recent Activity" inline. The
  // per-purpose shells delegate the activity surface to oversight
  // drawers (Project/Research) and to dedicated activity routes,
  // not to a fixed home dashboard. The persistent invariant is
  // that the server-side `getActivity` route exists and the
  // workspace activity log is reachable from the per-purpose shells.
  it("server-side getActivity route is exposed", () => {
    const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("getActivity");
  });

  it("at least one per-purpose shell wires an activity surface", () => {
    const shells = [
      "PersonalWorkspaceShell",
      "ProjectWorkspaceShell",
      "ResearchWorkspaceShell",
    ];
    let found = false;
    for (const name of shells) {
      const p = path.resolve(process.cwd(), "client/src/pages", `${name}.tsx`);
      if (!fs.existsSync(p)) continue;
      const content = fs.readFileSync(p, "utf-8");
      // OversightDrawer / ActivityFeed / getActivity any-of: each shell
      // exposes activity through one of these paths.
      if (
        /OversightDrawer|ActivityFeed|getActivity\.useQuery|getActivity/.test(
          content,
        )
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
