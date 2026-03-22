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
  it("active, created, configured are fully executable", async () => {
    const { isWorkspaceExecutable } = await import("../../server/workspace/workspace-lifecycle");
    expect(isWorkspaceExecutable("active")).toBe(true);
    expect(isWorkspaceExecutable("created")).toBe(true);
    expect(isWorkspaceExecutable("configured")).toBe(true);
  });

  it("paused, archived are NOT executable", async () => {
    const { isWorkspaceExecutable } = await import("../../server/workspace/workspace-lifecycle");
    expect(isWorkspaceExecutable("paused")).toBe(false);
    expect(isWorkspaceExecutable("archived")).toBe(false);
  });

  it("deleted is NOT executable and NOT readable", async () => {
    const { isWorkspaceExecutable, isWorkspaceReadable } = await import(
      "../../server/workspace/workspace-lifecycle"
    );
    expect(isWorkspaceExecutable("deleted")).toBe(false);
    expect(isWorkspaceReadable("deleted")).toBe(false);
  });

  it("paused and archived are readable", async () => {
    const { isWorkspaceReadable } = await import("../../server/workspace/workspace-lifecycle");
    expect(isWorkspaceReadable("paused")).toBe(true);
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
  const routersPath = path.resolve(process.cwd(), "server/routers.ts");

  it("workspace.get uses requireReadableWorkspaceRoute", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("requireReadableWorkspaceRoute");
  });

  it("workspace.update uses requireExecutableWorkspaceRoute", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    // The update route should call the executable guard
    expect(content).toMatch(/update:.*requireExecutableWorkspaceRoute/s);
  });

  it("workspace.updateRoutingProfile uses requireExecutableWorkspaceRoute", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/updateRoutingProfile:.*requireExecutableWorkspaceRoute/s);
  });

  it("workspace.getRoutingProfile uses requireReadableWorkspaceRoute", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/getRoutingProfile:.*requireReadableWorkspaceRoute/s);
  });

  it("workspace.delete checks for already-deleted workspace", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/delete:.*isWorkspaceDeleted/s);
  });

  it("workspace routes import lifecycle guard helpers", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("workspace-guards");
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
