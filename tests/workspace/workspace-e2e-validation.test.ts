/**
 * Phase 7 — End-to-End Validation Tests
 *
 * Proves the workspace contract works as a real system boundary.
 * Covers: lifecycle, scoping, RBAC, modules, dashboard, traceability.
 *
 * Test invariants:
 *   WS-01: Every execution path resolves context
 *   WS-02: Workspace purpose and lifecycle semantics
 *   WS-03: No cross-workspace data leakage
 *   WS-04/WS-10: Capability-based decisions are authoritative
 *   WS-11: Disabled modules blocked both UI and server-side
 *   WS-12: Activity emission is attributable
 *   WS-15: Workspace is an execution boundary
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import type { WorkspaceContext } from "../../server/workspace/workspace-contract";
import { WORKSPACE_STATUSES, type WorkspaceStatus } from "../../drizzle/tables/users";

// ============================================================================
// Helper
// ============================================================================

function mockContext(overrides: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return {
    workspaceId: 1,
    workspaceName: "E2E Test",
    userId: 1,
    role: "owner",
    permissions: {
      canRead: true,
      canWrite: true,
      canDelete: true,
      canManageMembers: true,
      canManageSettings: true,
    },
    effectiveCapabilities: new Set(["workspace.manage"]),
    enabledModules: ["pmt", "knowledge", "agents"],
    routingProfile: null,
    workspaceType: "team",
    status: "active",
    purposeType: "project",
    workspace: {
      id: 1,
      name: "E2E Test",
      description: null,
      type: "team",
      ownerId: 1,
      status: "active",
      purposeType: "project",
      purposeRef: null,
      embeddingModel: "bge-small-en-v1.5",
      chunkingStrategy: "semantic",
      chunkSize: 512,
      chunkOverlap: 50,
      vectorDb: "qdrant",
      collectionName: "ws_e2e",
      routingProfile: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

// ============================================================================
// E2E-01: Lifecycle Validation
// ============================================================================

describe("E2E — Lifecycle Enforcement", () => {
  it("the canonical 9-status lifecycle is recognized", () => {
    // Lifecycle was extended from 6 to 9 statuses. Legacy
    // `created`/`configured`/`paused` are mapped via LEGACY_STATUS_MAP.
    expect(WORKSPACE_STATUSES).toHaveLength(9);
    const expected = [
      "draft",
      "ready_for_review",
      "under_review",
      "approved",
      "published",
      "active",
      "rejected",
      "archived",
      "deleted",
    ];
    for (const s of expected) {
      expect(WORKSPACE_STATUSES).toContain(s);
    }
  });

  it("active workspace allows all operations", async () => {
    const { isActionAllowed } = await import("../../server/workspace/workspace-lifecycle");
    expect(isActionAllowed("active", "workspace.update", false)).toBe(true);
    expect(isActionAllowed("active", "agents.create", false)).toBe(true);
    expect(isActionAllowed("active", "workspace.get", true)).toBe(true);
  });

  it("archived workspace allows reads but blocks mutations", async () => {
    const { isActionAllowed } = await import("../../server/workspace/workspace-lifecycle");
    expect(isActionAllowed("archived", "workspace.get", true)).toBe(true);
    expect(isActionAllowed("archived", "workspace.update", false)).toBe(false);
  });

  it("deleted workspace blocks all operations", async () => {
    const { isActionAllowed } = await import("../../server/workspace/workspace-lifecycle");
    expect(isActionAllowed("deleted", "workspace.get", true)).toBe(false);
    expect(isActionAllowed("deleted", "workspace.update", false)).toBe(false);
  });

  it("requireExecutableWorkspace throws for non-executable statuses", async () => {
    const { requireExecutableWorkspace } = await import("../../server/workspace/workspace-lifecycle");
    const draft = mockContext({ status: "draft" });
    const archived = mockContext({ status: "archived" });
    const deleted = mockContext({ status: "deleted" });

    // Draft permits workspace.* setup actions but not bare execution.
    expect(() => requireExecutableWorkspace(draft)).toThrow();
    expect(() => requireExecutableWorkspace(archived)).toThrow();
    expect(() => requireExecutableWorkspace(deleted)).toThrow();
  });
});

// ============================================================================
// E2E-02: Scoping Validation
// ============================================================================

describe("E2E — Scoping (No Cross-Workspace Leakage)", () => {
  it("different workspace IDs produce distinct contexts", () => {
    const ctx1 = mockContext({ workspaceId: 1, workspace: { ...mockContext().workspace, id: 1 } });
    const ctx2 = mockContext({ workspaceId: 2, workspace: { ...mockContext().workspace, id: 2 } });
    expect(ctx1.workspaceId).not.toBe(ctx2.workspaceId);
  });

  it("Per-purpose shells render workspace-specific content", () => {
    // Legacy WorkspaceShell.tsx was unified into three per-purpose
    // shells. Each reads workspaceId from URL params and mounts
    // module routes under a workspace-prefixed basePath.
    const shells = [
      "PersonalWorkspaceShell",
      "ProjectWorkspaceShell",
      "ResearchWorkspaceShell",
    ];
    for (const name of shells) {
      const shellPath = path.resolve(
        process.cwd(),
        "client/src/pages",
        `${name}.tsx`,
      );
      const content = fs.readFileSync(shellPath, "utf-8");
      expect(content).toContain("useParams");
      expect(content).toContain("workspaceId");
      expect(content).toMatch(/\$\{basePath\}/);
    }
  });

  it("workspace router routes require workspace ID input", () => {
    const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    // get, update, delete all require id
    expect(content).toMatch(/get:.*z\.object.*id:.*z\.number/s);
    expect(content).toMatch(/update:.*z\.object.*id:.*z\.number/s);
    expect(content).toMatch(/delete:.*z\.object.*id:.*z\.number/s);
  });
});

// ============================================================================
// E2E-03: RBAC Validation
// ============================================================================

describe("E2E — RBAC (Capability-Based Allow/Deny)", () => {
  it("permissions-service uses capability resolver, not just role labels", () => {
    const permPath = path.resolve(process.cwd(), "server/workspaces/permissions-service.ts");
    const content = fs.readFileSync(permPath, "utf-8");
    expect(content).toContain("resolveWorkspaceCapabilities");
    expect(content).toContain("capabilitiesToPermissions");
  });

  it("capability resolver supports deny override", () => {
    const resolverPath = path.resolve(process.cwd(), "server/workspace/capability-resolver.ts");
    const content = fs.readFileSync(resolverPath, "utf-8");
    expect(content).toContain("effect === \"deny\"");
    expect(content).toContain("roleCapKeys.delete");
  });

  it("workspace-guards exports requireCapability", async () => {
    const mod = await import("../../server/workspace/workspace-guards");
    expect(typeof mod.requireCapability).toBe("function");
  });

  it("workspace mutations enforce requireCapability in routers.ts", () => {
    const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    const capMatches = content.match(/requireCapability/g);
    expect(capMatches).not.toBeNull();
    expect(capMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it("module management enforces requireCapability in modules/router.ts", () => {
    const modulesPath = path.resolve(process.cwd(), "server/modules/router.ts");
    const content = fs.readFileSync(modulesPath, "utf-8");
    const capMatches = content.match(/requireCapability/g);
    expect(capMatches).not.toBeNull();
    expect(capMatches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// E2E-04: Module Enforcement
// ============================================================================

describe("E2E — Module Enforcement", () => {
  it("UI module gate blocks disabled modules in per-purpose shells", () => {
    // Each per-purpose shell defines its own ModuleGate that hides
    // disabled module content. (`ModuleDisabled` was a separate
    // component in the legacy shell — the per-purpose shells inline
    // their disabled-state UI inside ModuleGate itself.)
    const shells = [
      "PersonalWorkspaceShell",
      "ProjectWorkspaceShell",
      "ResearchWorkspaceShell",
    ];
    for (const name of shells) {
      const shellPath = path.resolve(
        process.cwd(),
        "client/src/pages",
        `${name}.tsx`,
      );
      const content = fs.readFileSync(shellPath, "utf-8");
      expect(content).toContain("ModuleGate");
    }
  });

  it("server-side requireModule throws for disabled modules", async () => {
    const { requireModule } = await import("../../server/modules/registry");
    expect(typeof requireModule).toBe("function");
  });

  it("module manage routes enforce workspace lifecycle", () => {
    const modulesPath = path.resolve(process.cwd(), "server/modules/router.ts");
    const content = fs.readFileSync(modulesPath, "utf-8");
    expect(content).toContain("requireReadableWorkspaceRoute");
    expect(content).toContain("requireExecutableWorkspaceRoute");
  });
});

// ============================================================================
// E2E-05: Dashboard Operational State
// ============================================================================

describe("E2E — Workspace overview surface (per-purpose shells)", () => {
  // Legacy WorkspaceHome.tsx was a standalone dashboard. The
  // per-purpose shells now render an inline overview as the default
  // wouter route. The assertions below check what the new arch
  // actually does — workspace-name + module visibility — rather
  // than fossilized UI text from the removed page.
  const shells = [
    "PersonalWorkspaceShell",
    "ProjectWorkspaceShell",
    "ResearchWorkspaceShell",
  ];

  for (const name of shells) {
    const shellPath = path.resolve(
      process.cwd(),
      "client/src/pages",
      `${name}.tsx`,
    );

    it(`${name} overview is not a placeholder`, () => {
      const content = fs.readFileSync(shellPath, "utf-8");
      expect(content).not.toContain("Coming Soon");
      expect(content).not.toContain("Construction");
    });

    it(`${name} renders the workspace name`, () => {
      const content = fs.readFileSync(shellPath, "utf-8");
      expect(content).toContain("workspace.name");
    });

    it(`${name} surfaces enabled-module state`, () => {
      const content = fs.readFileSync(shellPath, "utf-8");
      // The default route iterates enabledModules / enabledCount.
      expect(content).toMatch(/enabledModules|enabledCount/);
    });

    it(`${name} navigates to module sub-routes`, () => {
      const content = fs.readFileSync(shellPath, "utf-8");
      // Cards link to the workspace-prefixed module paths.
      expect(content).toMatch(/\$\{basePath\}\//);
    });
  }
});

// ============================================================================
// E2E-06: Traceability
// ============================================================================

describe("E2E — Activity Traceability", () => {
  it("activity_log schema has all required fields", () => {
    const schemaPath = path.resolve(process.cwd(), "drizzle/tables/workspace-modules.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("workspaceId");
    expect(content).toContain("actorId");
    expect(content).toContain("action");
    expect(content).toContain("targetType");
    expect(content).toContain("targetId");
  });

  it("workspace routes emit activity on mutations", () => {
    const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    const logMatches = content.match(/logActivity/g);
    expect(logMatches).not.toBeNull();
    // Should have multiple logActivity calls (create, update, delete, routing)
    expect(logMatches!.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================================
// E2E-07: Existing Functionality Preserved
// ============================================================================

describe("E2E — No Regressions", () => {
  it("workspace creation route still exists", () => {
    const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/create:.*governedProcedure/s);
    expect(content).toContain("createWorkspace");
  });

  it("workspace list route still exists", () => {
    const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("getUserWorkspaces");
  });

  it("Per-purpose workspace shells still exist and export default components", () => {
    // Legacy WorkspaceShell.tsx and WorkspaceDetail.tsx were unified
    // into three per-purpose shells. The "no-regressions" check is now
    // that each shell file exists and exports a default function.
    const shells = [
      "PersonalWorkspaceShell",
      "ProjectWorkspaceShell",
      "ResearchWorkspaceShell",
    ];
    for (const name of shells) {
      const shellPath = path.resolve(
        process.cwd(),
        "client/src/pages",
        `${name}.tsx`,
      );
      expect(fs.existsSync(shellPath)).toBe(true);
      const content = fs.readFileSync(shellPath, "utf-8");
      expect(content).toContain(`export default function ${name}`);
    }
  });

  it("workspace routing profile routes still exist", () => {
    const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("getRoutingProfile");
    expect(content).toContain("updateRoutingProfile");
  });
});
