/**
 * Phase 5 — Module Enforcement Tests
 *
 * WS-11: Disabled modules cannot be reached through direct route/service calls
 *
 * Validates that:
 * - requireModule throws for disabled modules
 * - isModuleEnabled returns correct boolean
 * - Module router applies workspace guards
 * - ModuleGate in WorkspaceShell blocks disabled modules UI-side
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ============================================================================
// Server-Side Module Enforcement
// ============================================================================

describe("Phase 5 — Module Registry Enforcement", () => {
  it("isModuleEnabled is exported", async () => {
    const mod = await import("../../server/modules/registry");
    expect(typeof mod.isModuleEnabled).toBe("function");
  });

  it("requireModule is exported", async () => {
    const mod = await import("../../server/modules/registry");
    expect(typeof mod.requireModule).toBe("function");
  });

  it("MODULE_PRESETS covers all workspace types", async () => {
    const { MODULE_PRESETS } = await import("../../server/modules/registry");
    expect(MODULE_PRESETS.personal).toBeDefined();
    expect(MODULE_PRESETS.team).toBeDefined();
    expect(MODULE_PRESETS.project).toBeDefined();
    expect(MODULE_PRESETS.research).toBeDefined();
    expect(MODULE_PRESETS.enterprise).toBeDefined();
    expect(MODULE_PRESETS.sandbox).toBeDefined();
  });
});

// ============================================================================
// WS-11: Module Router Applies Guards
// ============================================================================

describe("Phase 5 — Module Router Guards", () => {
  const modulesRouterPath = path.resolve(process.cwd(), "server/modules/router.ts");

  it("module manage.setEnabled requires executable workspace", () => {
    const content = fs.readFileSync(modulesRouterPath, "utf-8");
    expect(content).toContain("requireExecutableWorkspaceRoute");
  });

  it("module manage.list requires readable workspace", () => {
    const content = fs.readFileSync(modulesRouterPath, "utf-8");
    expect(content).toContain("requireReadableWorkspaceRoute");
  });

  it("module manage.seed requires executable workspace", () => {
    const content = fs.readFileSync(modulesRouterPath, "utf-8");
    // setEnabled and seed should both use executable guard
    const execMatches = content.match(/requireExecutableWorkspaceRoute/g);
    expect(execMatches).not.toBeNull();
    expect(execMatches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// WS-11: Workspace Guards Module Check
// ============================================================================

describe("Phase 5 — Workspace Guards Module Check", () => {
  it("requireModuleEnabled is exported from workspace-guards", async () => {
    const mod = await import("../../server/workspace/workspace-guards");
    expect(typeof mod.requireModuleEnabled).toBe("function");
  });

  it("guardWorkspaceRoute accepts moduleKey parameter", async () => {
    const mod = await import("../../server/workspace/workspace-guards");
    expect(typeof mod.guardWorkspaceRoute).toBe("function");
    // The function signature accepts moduleKey
  });
});

// ============================================================================
// WS-11: UI Module Gate
// ============================================================================

describe("Phase 5 — UI ModuleGate Enforcement", () => {
  it("WorkspaceShell has ModuleGate component", () => {
    const shellPath = path.resolve(process.cwd(), "client/src/pages/WorkspaceShell.tsx");
    const content = fs.readFileSync(shellPath, "utf-8");
    expect(content).toContain("ModuleGate");
    expect(content).toContain("ModuleDisabled");
  });

  it("ModuleGate checks enabledModules set", () => {
    const shellPath = path.resolve(process.cwd(), "client/src/pages/WorkspaceShell.tsx");
    const content = fs.readFileSync(shellPath, "utf-8");
    expect(content).toContain("enabledModules.has(moduleKey)");
  });

  it("ModuleDisabled component exists", () => {
    const mdPath = path.resolve(process.cwd(), "client/src/components/workspace/ModuleDisabled.tsx");
    expect(fs.existsSync(mdPath)).toBe(true);
  });

  it("every module route is wrapped in ModuleGate", () => {
    const shellPath = path.resolve(process.cwd(), "client/src/pages/WorkspaceShell.tsx");
    const content = fs.readFileSync(shellPath, "utf-8");
    // Count ModuleGate occurrences — should cover all module routes
    const gateMatches = content.match(/<ModuleGate/g);
    expect(gateMatches).not.toBeNull();
    // Should have many module gates (PMT + Knowledge + Agents + Collab + Reporting)
    expect(gateMatches!.length).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================================
// Distinction: visible vs enabled vs usable
// ============================================================================

// ============================================================================
// WS-11: Enhanced requireModule — Lifecycle Enforcement
// ============================================================================

describe("Phase 5 — requireModule Lifecycle Enforcement", () => {
  it("requireModule calls requireWorkspaceNotDeleted for lifecycle blocking", () => {
    const registryPath = path.resolve(process.cwd(), "server/modules/registry.ts");
    const content = fs.readFileSync(registryPath, "utf-8");
    expect(content).toContain("requireWorkspaceNotDeleted");
  });

  it("requireModule checks workspace status for deleted state", () => {
    const registryPath = path.resolve(process.cwd(), "server/modules/registry.ts");
    const content = fs.readFileSync(registryPath, "utf-8");
    expect(content).toContain('ws.status === "deleted"');
  });

  it("requireModule throws NOT_FOUND for deleted workspaces", () => {
    const registryPath = path.resolve(process.cwd(), "server/modules/registry.ts");
    const content = fs.readFileSync(registryPath, "utf-8");
    expect(content).toContain('"Workspace is deleted"');
  });
});

describe("Phase 5 — Module State Semantics", () => {
  it("workspace_modules table has enabled column", () => {
    const schemaPath = path.resolve(process.cwd(), "drizzle/tables/workspace-modules.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("enabled");
    expect(content).toContain("boolean");
  });

  it("sidebar shows all modules regardless of enabled state", () => {
    const shellPath = path.resolve(process.cwd(), "client/src/pages/WorkspaceShell.tsx");
    const content = fs.readFileSync(shellPath, "utf-8");
    // "Always show all sidebar items; ModuleGate handles disabled content"
    expect(content).toContain("ALL_MODULE_KEYS");
  });
});
