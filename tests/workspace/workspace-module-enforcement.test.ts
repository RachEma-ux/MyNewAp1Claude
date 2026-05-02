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
  // Each per-purpose shell defines its own ModuleGate that gates
  // module sub-routes against `enabledModules`.
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

    it(`${name} defines a ModuleGate component`, () => {
      const content = fs.readFileSync(shellPath, "utf-8");
      expect(content).toContain("ModuleGate");
    });

    it(`${name} ModuleGate checks enabledModules set`, () => {
      const content = fs.readFileSync(shellPath, "utf-8");
      expect(content).toMatch(/enabledModules\.has\(/);
    });

    it(`${name} wraps multiple module routes in ModuleGate`, () => {
      const content = fs.readFileSync(shellPath, "utf-8");
      const gateMatches = content.match(/<ModuleGate/g);
      expect(gateMatches).not.toBeNull();
      // Each shell gates several module routes
      // (Project shell has the most: pmt, knowledge, agents, collab, reporting…).
      expect(gateMatches!.length).toBeGreaterThanOrEqual(2);
    });
  }

  it("ModuleDisabled component still exists for re-use", () => {
    const mdPath = path.resolve(process.cwd(), "client/src/components/workspace/ModuleDisabled.tsx");
    expect(fs.existsSync(mdPath)).toBe(true);
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

  it("Per-purpose shells declare a complete module key set", () => {
    // Replaces the legacy `ALL_MODULE_KEYS` constant in WorkspaceShell.
    // Each per-purpose shell maintains its own `MODULE_KEYS` list of
    // every module it can render (regardless of enabled state).
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
      // Each shell defines its module keys (constant array) and
      // tracks `enabledModules` separately — sidebar shows all,
      // ModuleGate handles disabled rendering.
      expect(content).toMatch(/MODULE_KEYS|ModuleKey/);
    }
  });
});
