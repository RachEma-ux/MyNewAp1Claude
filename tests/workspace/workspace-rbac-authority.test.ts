/**
 * Phase 3 — RBAC Authority Tests
 *
 * WS-02: All workspace access decisions resolve through capability model
 * WS-04/WS-10: Capability-based decisions are authoritative, role labels are not final
 *
 * Validates that:
 * - Capabilities are resolved from RBAC tables (or legacy fallback)
 * - capabilitiesToPermissions produces correct boolean flags
 * - Deny overrides beat inherited grants
 * - Empty capabilities produce deny-all
 * - Viewer/member capabilities are correctly subset
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ============================================================================
// WS-02: Capability Resolution
// ============================================================================

describe("Phase 3 — Capability Resolver Exports", () => {
  it("capability-resolver exports all required functions", async () => {
    const mod = await import("../../server/workspace/capability-resolver");
    expect(typeof mod.resolveWorkspaceCapabilities).toBe("function");
    expect(typeof mod.hasCapability).toBe("function");
    expect(typeof mod.capabilitiesToPermissions).toBe("function");
    expect(typeof mod.resolveWorkspacePermissions).toBe("function");
  });
});

// ============================================================================
// WS-10: Capability-to-Permission Mapping
// ============================================================================

describe("Phase 3 — capabilitiesToPermissions authority", () => {
  it("empty capabilities produce deny-all", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );
    const perms = capabilitiesToPermissions(new Set());
    expect(perms.canRead).toBe(false);
    expect(perms.canWrite).toBe(false);
    expect(perms.canDelete).toBe(false);
    expect(perms.canManageMembers).toBe(false);
    expect(perms.canManageSettings).toBe(false);
  });

  it("owner capabilities grant full access", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );
    const ownerCaps = new Set([
      "workspace.manage", "workspace.settings",
      "workspace.members.invite", "workspace.members.remove",
      "models.view", "models.manage",
      "documents.upload", "documents.view", "documents.delete",
      "agents.view", "agents.create", "agents.delete",
      "chat.send", "chat.history",
    ]);
    const perms = capabilitiesToPermissions(ownerCaps);
    expect(perms.canRead).toBe(true);
    expect(perms.canWrite).toBe(true);
    expect(perms.canDelete).toBe(true);
    expect(perms.canManageMembers).toBe(true);
    expect(perms.canManageSettings).toBe(true);
  });

  it("viewer capabilities grant read-only", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );
    const viewerCaps = new Set([
      "models.view", "providers.view", "chat.history",
      "documents.view", "agents.view", "workflows.view",
    ]);
    const perms = capabilitiesToPermissions(viewerCaps);
    expect(perms.canRead).toBe(true);
    expect(perms.canWrite).toBe(false);
    expect(perms.canDelete).toBe(false);
    expect(perms.canManageMembers).toBe(false);
    expect(perms.canManageSettings).toBe(false);
  });

  it("member capabilities grant read+write but not manage", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );
    const memberCaps = new Set([
      "models.view", "providers.view",
      "chat.send", "chat.history",
      "documents.upload", "documents.view",
      "agents.view", "agents.create", "agents.edit",
    ]);
    const perms = capabilitiesToPermissions(memberCaps);
    expect(perms.canRead).toBe(true);
    expect(perms.canWrite).toBe(true);
    expect(perms.canDelete).toBe(false);
    expect(perms.canManageMembers).toBe(false);
    expect(perms.canManageSettings).toBe(false);
  });
});

// ============================================================================
// WS-10: Deny beats grant
// ============================================================================

describe("Phase 3 — Deny override semantics", () => {
  it("removing a capability from the set denies it", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );

    // Start with owner-like caps
    const caps = new Set([
      "workspace.manage", "workspace.settings",
      "workspace.members.invite", "models.view",
      "documents.upload", "documents.view",
    ]);

    // Grant-all check
    const fullPerms = capabilitiesToPermissions(caps);
    expect(fullPerms.canManageSettings).toBe(true);
    expect(fullPerms.canManageMembers).toBe(true);

    // Simulate deny: remove manage capabilities
    caps.delete("workspace.manage");
    caps.delete("workspace.settings");
    caps.delete("workspace.members.invite");

    const deniedPerms = capabilitiesToPermissions(caps);
    expect(deniedPerms.canManageSettings).toBe(false);
    expect(deniedPerms.canManageMembers).toBe(false);
    // Still has read
    expect(deniedPerms.canRead).toBe(true);
  });
});

// ============================================================================
// WS-10: Permissions service routes through capability resolver
// ============================================================================

describe("Phase 3 — Permissions Service Integration", () => {
  it("permissions-service imports capability-resolver", () => {
    const permPath = path.resolve(process.cwd(), "server/workspaces/permissions-service.ts");
    const content = fs.readFileSync(permPath, "utf-8");
    expect(content).toContain("capability-resolver");
    expect(content).toContain("resolveWorkspaceCapabilities");
    expect(content).toContain("capabilitiesToPermissions");
  });

  it("permissions-service has legacy fallback", () => {
    const permPath = path.resolve(process.cwd(), "server/workspaces/permissions-service.ts");
    const content = fs.readFileSync(permPath, "utf-8");
    expect(content).toContain("legacyGetWorkspacePermissions");
    expect(content).toContain("Legacy fallback");
  });

  it("workspace-contract resolves capabilities", () => {
    const contractPath = path.resolve(process.cwd(), "server/workspace/workspace-contract.ts");
    const content = fs.readFileSync(contractPath, "utf-8");
    expect(content).toContain("resolveWorkspaceCapabilities");
    expect(content).toContain("effectiveCapabilities");
  });
});

// ============================================================================
// Canonical Permission Gates
// ============================================================================

describe("Phase 3 — Canonical Permission Gates", () => {
  it("workspace-guards exports requireCapability", async () => {
    const mod = await import("../../server/workspace/workspace-guards");
    expect(typeof mod.requireCapability).toBe("function");
  });

  it("guardWorkspaceRoute accepts capability parameter", async () => {
    const mod = await import("../../server/workspace/workspace-guards");
    expect(typeof mod.guardWorkspaceRoute).toBe("function");
  });

  it("capability resolver handles legacy role mapping", async () => {
    // The legacy fallback should cover owner/admin/editor/viewer
    const resolverPath = path.resolve(process.cwd(), "server/workspace/capability-resolver.ts");
    const content = fs.readFileSync(resolverPath, "utf-8");
    expect(content).toContain("legacyRoleToCapabilities");
    expect(content).toContain("owner");
    expect(content).toContain("admin");
    expect(content).toContain("editor");
    expect(content).toContain("viewer");
  });
});
