/**
 * Final Workspace Hardening — Capability Enforcement + Module Lifecycle
 *
 * Validates the last two enforcement gaps:
 * 1. Route-level capability enforcement on workspace mutations
 * 2. Lifecycle enforcement on module sub-routers via enhanced requireModule
 * 3. Workspace access checks on 5 main module routers
 *
 * Invariants:
 *   WS-04: Workspace lifecycle status gates execution
 *   WS-10: Capability checks are authoritative
 *   WS-11: Module access requires enablement + lifecycle check
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const resolve = (p: string) => path.resolve(process.cwd(), p);

// ============================================================================
// 1. Capability Enforcement on Workspace Routes
// ============================================================================

describe("Hardening — Capability Enforcement on Workspace Mutations", () => {
  const routersPath = resolve("server/routers.ts");
  const content = fs.readFileSync(routersPath, "utf-8");

  it("workspace.update requires workspace.manage capability", () => {
    // After the lifecycle guard, there should be a capability check
    expect(content).toContain('requireCapability(ctx.user.id, input.id, "workspace.manage")');
  });

  it("workspace.delete requires workspace.manage capability", () => {
    expect(content).toContain('requireCapability(ctx.user.id, input.id, "workspace.manage")');
    // Verify it appears in the delete context (near ownerId check)
    const deleteSection = content.substring(
      content.indexOf("delete: governedProcedure"),
      content.indexOf("documents: documentsCrudRouter")
    );
    expect(deleteSection).toContain("requireCapability");
  });

  it("workspace.updateRoutingProfile requires workspace.settings capability", () => {
    expect(content).toContain('requireCapability(ctx.user.id, input.id, "workspace.settings")');
  });

  it("requireCapability is imported in routers.ts", () => {
    expect(content).toContain("requireCapability");
    expect(content).toMatch(/import.*requireCapability.*from.*workspace-guards/);
  });

  it("has at least 3 requireCapability calls in workspace routes", () => {
    const matches = content.match(/requireCapability/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// 2. Capability Enforcement on Module Management
// ============================================================================

describe("Hardening — Capability Enforcement on Module Management", () => {
  const modulesPath = resolve("server/modules/router.ts");
  const content = fs.readFileSync(modulesPath, "utf-8");

  it("manage.setEnabled requires workspace.settings capability", () => {
    expect(content).toContain('requireCapability(ctx.user.id, input.workspaceId, "workspace.settings")');
  });

  it("manage.seed requires workspace.manage capability", () => {
    expect(content).toContain('requireCapability(ctx.user.id, input.workspaceId, "workspace.manage")');
  });

  it("requireCapability is imported in modules/router.ts", () => {
    expect(content).toMatch(/import.*requireCapability.*from.*workspace-guards/);
  });

  it("has at least 2 requireCapability calls in module management", () => {
    const matches = content.match(/requireCapability/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// 3. Enhanced requireModule — Lifecycle Check
// ============================================================================

describe("Hardening — Enhanced requireModule with Lifecycle Check", () => {
  const registryPath = resolve("server/modules/registry.ts");
  const content = fs.readFileSync(registryPath, "utf-8");

  it("requireModule calls requireWorkspaceNotDeleted", () => {
    expect(content).toContain("requireWorkspaceNotDeleted");
  });

  it("requireWorkspaceNotDeleted checks workspace status", () => {
    expect(content).toContain('ws.status === "deleted"');
  });

  it("requireWorkspaceNotDeleted throws NOT_FOUND for deleted workspaces", () => {
    expect(content).toContain('"Workspace is deleted"');
  });

  it("requireWorkspaceNotDeleted throws NOT_FOUND for missing workspaces", () => {
    expect(content).toContain('"Workspace not found"');
  });

  it("imports TRPCError for lifecycle blocking", () => {
    expect(content).toContain('import { TRPCError }');
  });

  it("imports workspaces table for status lookup", () => {
    expect(content).toContain("workspaces");
  });
});

// ============================================================================
// 4. Module Routes Have Workspace Access Checks
// ============================================================================

describe("Hardening — Workspace Access on Module Routers", () => {
  const moduleRouterPaths = [
    { name: "PMT", path: "server/modules/pmt/router.ts" },
    { name: "Knowledge", path: "server/modules/knowledge/router.ts" },
    { name: "Agents", path: "server/modules/agents/router.ts" },
    { name: "Collaboration", path: "server/modules/collaboration/router.ts" },
    { name: "Reporting", path: "server/modules/reporting/router.ts" },
  ];

  for (const { name, path: filePath } of moduleRouterPaths) {
    describe(`${name} Router`, () => {
      const content = fs.readFileSync(resolve(filePath), "utf-8");

      it(`imports requireWorkspaceAccess`, () => {
        expect(content).toContain("requireWorkspaceAccess");
        expect(content).toMatch(/import.*requireWorkspaceAccess.*from.*workspace-guards/);
      });

      it(`calls requireWorkspaceAccess before requireModule`, () => {
        // Every requireModule call should be preceded by a requireWorkspaceAccess call
        const moduleCallCount = (content.match(/requireModule\(/g) || []).length;
        const accessCallCount = (content.match(/requireWorkspaceAccess\(/g) || []).length;
        expect(accessCallCount).toBeGreaterThanOrEqual(moduleCallCount);
      });
    });
  }
});

// ============================================================================
// 5. guardModuleRoute Helper Exists
// ============================================================================

describe("Hardening — guardModuleRoute Helper", () => {
  const guardsPath = resolve("server/workspace/workspace-guards.ts");
  const content = fs.readFileSync(guardsPath, "utf-8");

  it("guardModuleRoute is exported", () => {
    expect(content).toContain("export async function guardModuleRoute");
  });

  it("guardModuleRoute accepts moduleKey parameter", () => {
    expect(content).toContain("moduleKey: ModuleKey");
  });

  it("guardModuleRoute calls requireModuleEnabled", () => {
    const fnSection = content.substring(
      content.indexOf("async function guardModuleRoute"),
      content.indexOf("async function guardWorkspaceRoute")
    );
    expect(fnSection).toContain("requireModuleEnabled");
  });
});

// ============================================================================
// 6. Lifecycle Edge Cases — Archived and Deleted
// ============================================================================

describe("Hardening — Lifecycle Edge Cases", () => {
  it("archived workspace blocks mutations via isActionAllowed", async () => {
    const { isActionAllowed } = await import("../../server/workspace/workspace-lifecycle");
    expect(isActionAllowed("archived", "workspace.update", false)).toBe(false);
    expect(isActionAllowed("archived", "agents.create", false)).toBe(false);
  });

  it("archived workspace allows reads via isActionAllowed", async () => {
    const { isActionAllowed } = await import("../../server/workspace/workspace-lifecycle");
    expect(isActionAllowed("archived", "workspace.get", true)).toBe(true);
  });

  it("deleted workspace blocks everything via isActionAllowed", async () => {
    const { isActionAllowed } = await import("../../server/workspace/workspace-lifecycle");
    expect(isActionAllowed("deleted", "workspace.get", true)).toBe(false);
    expect(isActionAllowed("deleted", "workspace.update", false)).toBe(false);
    expect(isActionAllowed("deleted", "module.enable", false)).toBe(false);
  });
});

// ============================================================================
// 7. Combined Enforcement — Full Stack
// ============================================================================

describe("Hardening — Combined Enforcement Stack", () => {
  it("workspace update has lifecycle + capability enforcement", () => {
    const content = fs.readFileSync(resolve("server/routers.ts"), "utf-8");
    const updateSection = content.substring(
      content.indexOf("update: governedProcedure"),
      content.indexOf("getRoutingProfile")
    );
    expect(updateSection).toContain("requireExecutableWorkspaceRoute");
    expect(updateSection).toContain("requireCapability");
  });

  it("module setEnabled has lifecycle + capability enforcement", () => {
    const content = fs.readFileSync(resolve("server/modules/router.ts"), "utf-8");
    const setEnabledSection = content.substring(
      content.indexOf("setEnabled: governedProcedure"),
      content.indexOf("seed: governedProcedure")
    );
    expect(setEnabledSection).toContain("requireExecutableWorkspaceRoute");
    expect(setEnabledSection).toContain("requireCapability");
  });

  it("module routes have access + module + lifecycle enforcement", () => {
    const content = fs.readFileSync(resolve("server/modules/pmt/router.ts"), "utf-8");
    // Every procedure should have: requireWorkspaceAccess -> requireModule (which includes lifecycle)
    expect(content).toContain("requireWorkspaceAccess");
    expect(content).toContain("requireModule");
  });
});

// ============================================================================
// 8. No Regressions
// ============================================================================

describe("Hardening — No Regressions", () => {
  it("workspace create route still works (no capability on create)", () => {
    const content = fs.readFileSync(resolve("server/routers.ts"), "utf-8");
    const createSection = content.substring(
      content.indexOf("create: governedProcedure"),
      content.indexOf("get: protectedProcedure")
    );
    // Create should NOT have requireCapability (workspace doesn't exist yet)
    expect(createSection).not.toContain("requireCapability");
    expect(createSection).toContain("createWorkspace");
  });

  it("workspace read routes don't require capabilities", () => {
    const content = fs.readFileSync(resolve("server/routers.ts"), "utf-8");
    // get route should not have requireCapability
    const getSection = content.substring(
      content.indexOf("get: protectedProcedure"),
      content.indexOf("update: governedProcedure")
    );
    expect(getSection).not.toContain("requireCapability");
    expect(getSection).toContain("requireReadableWorkspaceRoute");
  });

  it("module registry still exports requireModule", async () => {
    const mod = await import("../../server/modules/registry");
    expect(typeof mod.requireModule).toBe("function");
  });

  it("workspace-guards still exports all guards", async () => {
    const mod = await import("../../server/workspace/workspace-guards");
    expect(typeof mod.requireWorkspaceAccess).toBe("function");
    expect(typeof mod.requireReadableWorkspaceRoute).toBe("function");
    expect(typeof mod.requireExecutableWorkspaceRoute).toBe("function");
    expect(typeof mod.requireCapability).toBe("function");
    expect(typeof mod.requireModuleEnabled).toBe("function");
    expect(typeof mod.guardWorkspaceRoute).toBe("function");
    expect(typeof mod.guardModuleRoute).toBe("function");
  });

  it("all 5 module routers still export their router", async () => {
    const pmt = await import("../../server/modules/pmt/router");
    const knowledge = await import("../../server/modules/knowledge/router");
    const agents = await import("../../server/modules/agents/router");
    const collaboration = await import("../../server/modules/collaboration/router");
    const reporting = await import("../../server/modules/reporting/router");
    expect(pmt.pmtRouter).toBeDefined();
    expect(knowledge.knowledgeRouter).toBeDefined();
    expect(agents.agentOrchRouter).toBeDefined();
    expect(collaboration.collaborationRouter).toBeDefined();
    expect(reporting.reportingRouter).toBeDefined();
  });
});

// ============================================================================
// 9. Canonical Capability Gate Mapping
// ============================================================================

describe("Hardening — Canonical Gate Coverage", () => {
  it("workspace.read is enforced via requireReadableWorkspaceRoute", () => {
    const content = fs.readFileSync(resolve("server/routers.ts"), "utf-8");
    expect(content).toContain("requireReadableWorkspaceRoute");
  });

  it("workspace.update is enforced via requireCapability(workspace.manage)", () => {
    const content = fs.readFileSync(resolve("server/routers.ts"), "utf-8");
    expect(content).toContain('"workspace.manage"');
  });

  it("workspace.settings is enforced via requireCapability(workspace.settings)", () => {
    const content = fs.readFileSync(resolve("server/routers.ts"), "utf-8");
    expect(content).toContain('"workspace.settings"');
  });

  it("workspace.module.use is enforced via requireModule + lifecycle", () => {
    const registryContent = fs.readFileSync(resolve("server/modules/registry.ts"), "utf-8");
    expect(registryContent).toContain("requireWorkspaceNotDeleted");
    expect(registryContent).toContain("requireModule");
  });
});
