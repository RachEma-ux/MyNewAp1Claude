/**
 * Phase 1 — Workspace Lifecycle Guard Tests
 *
 * WS-01: Every workspace route resolves context where required
 * WS-04: Workspace lifecycle status gates execution
 * WS-06: Non-executable workspaces block writes
 *
 * Validates that the guard helpers correctly enforce lifecycle rules.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ============================================================================
// Guard Helpers — Structural Tests
// ============================================================================

describe("Phase 1 — Workspace Guard Exports", () => {
  it("workspace-guards module exports all required functions", async () => {
    const mod = await import("../../server/workspace/workspace-guards");
    expect(typeof mod.requireWorkspaceAccess).toBe("function");
    expect(typeof mod.requireReadableWorkspaceRoute).toBe("function");
    expect(typeof mod.requireExecutableWorkspaceRoute).toBe("function");
    expect(typeof mod.requireCapability).toBe("function");
    expect(typeof mod.requireModuleEnabled).toBe("function");
    expect(typeof mod.guardWorkspaceRoute).toBe("function");
  });

  it("workspace-lifecycle exports all required functions", async () => {
    const mod = await import("../../server/workspace/workspace-lifecycle");
    expect(typeof mod.isWorkspaceExecutable).toBe("function");
    expect(typeof mod.isWorkspaceReadable).toBe("function");
    expect(typeof mod.isWorkspaceDeleted).toBe("function");
    expect(typeof mod.requireExecutableWorkspace).toBe("function");
    expect(typeof mod.requireReadableWorkspace).toBe("function");
    expect(typeof mod.isActionAllowed).toBe("function");
    expect(mod.ARCHIVED_ALLOWED_ACTIONS).toBeInstanceOf(Set);
  });
});

// ============================================================================
// Lifecycle Status Enforcement
// ============================================================================

describe("Phase 1 — Lifecycle Status Enforcement", () => {
  // Lifecycle is now the canonical 9-status set: only `active` is
  // fully executable. Legacy `created`/`configured` map to the
  // setup-mutable `draft`/`ready_for_review` (allow workspace.* but
  // not full execution). Legacy `paused` maps to `archived`.
  it("only `active` is fully executable", async () => {
    const { isWorkspaceExecutable } = await import("../../server/workspace/workspace-lifecycle");
    expect(isWorkspaceExecutable("active")).toBe(true);
    expect(isWorkspaceExecutable("draft")).toBe(false);
    expect(isWorkspaceExecutable("ready_for_review")).toBe(false);
  });

  it("setup-mutable and archived are NOT fully executable", async () => {
    const { isWorkspaceExecutable } = await import("../../server/workspace/workspace-lifecycle");
    expect(isWorkspaceExecutable("draft")).toBe(false);
    expect(isWorkspaceExecutable("rejected")).toBe(false);
    expect(isWorkspaceExecutable("archived")).toBe(false);
  });

  it("deleted is NOT executable and NOT readable", async () => {
    const { isWorkspaceExecutable, isWorkspaceReadable } = await import(
      "../../server/workspace/workspace-lifecycle"
    );
    expect(isWorkspaceExecutable("deleted")).toBe(false);
    expect(isWorkspaceReadable("deleted")).toBe(false);
  });

  it("active and archived are readable", async () => {
    const { isWorkspaceReadable } = await import("../../server/workspace/workspace-lifecycle");
    expect(isWorkspaceReadable("active")).toBe(true);
    expect(isWorkspaceReadable("archived")).toBe(true);
  });
});

// ============================================================================
// Archived Escape Hatch
// ============================================================================

describe("Phase 1 — Archived Escape Hatch", () => {
  it("archived allows specific escape-hatch actions", async () => {
    const { isActionAllowed, ARCHIVED_ALLOWED_ACTIONS } = await import(
      "../../server/workspace/workspace-lifecycle"
    );

    for (const action of ARCHIVED_ALLOWED_ACTIONS) {
      expect(isActionAllowed("archived", action, false)).toBe(true);
    }
  });

  it("archived blocks non-escape-hatch mutations", async () => {
    const { isActionAllowed } = await import("../../server/workspace/workspace-lifecycle");
    expect(isActionAllowed("archived", "workspace.update", false)).toBe(false);
    expect(isActionAllowed("archived", "documents.upload", false)).toBe(false);
    expect(isActionAllowed("archived", "agents.create", false)).toBe(false);
  });

  it("archived allows reads", async () => {
    const { isActionAllowed } = await import("../../server/workspace/workspace-lifecycle");
    expect(isActionAllowed("archived", "workspace.get", true)).toBe(true);
    expect(isActionAllowed("archived", "documents.list", true)).toBe(true);
  });
});

// ============================================================================
// Router Integration — Static Analysis
// ============================================================================

describe("Phase 1 — Router Lifecycle Guard Integration", () => {
  // Workspace routes were extracted from server/routers.ts into a
  // dedicated module router at server/workspace/workspace-router.ts.
  const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");

  it("workspace.get uses requireReadableWorkspaceRoute", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("requireReadableWorkspaceRoute");
  });

  it("workspace mutations are gated (executable or workspace-access)", () => {
    // Simple `update` and `delete` aliases use requireWorkspaceAccess.
    // Lifecycle-aware mutations (updateRoutingProfile) use the
    // requireExecutableWorkspaceRoute gate. Both are present.
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("requireWorkspaceAccess");
    expect(content).toContain("requireExecutableWorkspaceRoute");
  });

  it("workspace.updateRoutingProfile uses requireExecutableWorkspaceRoute", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/updateRoutingProfile:.*requireExecutableWorkspaceRoute/s);
  });

  it("workspace.getRoutingProfile uses requireReadableWorkspaceRoute", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/getRoutingProfile:.*requireReadableWorkspaceRoute/s);
  });

  it("workspace.delete is gated and admin-only", () => {
    // The delete route now combines a hard admin-role check with
    // requireWorkspaceAccess, then defers to softDeleteWorkspace
    // which itself enforces the deleted-state invariant. The
    // observable-from-source guard is the admin role + access check.
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/delete:[\s\S]*?ctx\.user\.role !== "admin"/);
    expect(content).toMatch(/delete:[\s\S]*?requireWorkspaceAccess/);
  });

  it("workspace routes import lifecycle guard helpers", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    // Imports reference the workspace-guards module by path.
    expect(content).toMatch(/workspace-guards|requireReadableWorkspaceRoute/);
  });
});

// ============================================================================
// Module Router Guards — Static Analysis
// ============================================================================

describe("Phase 1 — Module Router Lifecycle Guards", () => {
  const modulesRouterPath = path.resolve(process.cwd(), "server/modules/router.ts");

  it("module manage.list uses readable workspace guard", () => {
    const content = fs.readFileSync(modulesRouterPath, "utf-8");
    expect(content).toContain("requireReadableWorkspaceRoute");
  });

  it("module manage.setEnabled uses executable workspace guard", () => {
    const content = fs.readFileSync(modulesRouterPath, "utf-8");
    expect(content).toContain("requireExecutableWorkspaceRoute");
  });

  it("module router imports workspace guards", () => {
    const content = fs.readFileSync(modulesRouterPath, "utf-8");
    expect(content).toContain("workspace-guards");
  });
});

// ============================================================================
// Deleted Workspace Behavior
// ============================================================================

describe("Phase 1 — Deleted Workspace Behavior", () => {
  it("deleted blocks all action types", async () => {
    const { isActionAllowed } = await import("../../server/workspace/workspace-lifecycle");
    expect(isActionAllowed("deleted", "workspace.get", true)).toBe(false);
    expect(isActionAllowed("deleted", "workspace.update", false)).toBe(false);
    expect(isActionAllowed("deleted", "workspace.unarchive", false)).toBe(false);
  });

  it("isWorkspaceDeleted correctly identifies deleted status", async () => {
    const { isWorkspaceDeleted } = await import("../../server/workspace/workspace-lifecycle");
    expect(isWorkspaceDeleted("deleted")).toBe(true);
    expect(isWorkspaceDeleted("active")).toBe(false);
    expect(isWorkspaceDeleted("archived")).toBe(false);
  });
});
