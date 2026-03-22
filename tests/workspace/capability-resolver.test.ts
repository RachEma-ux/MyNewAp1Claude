/**
 * Capability Resolver Tests — Phase 2
 *
 * Validates WS-02: All workspace access decisions must resolve through
 * the workspace capability model.
 *
 * Tests the capability resolver, compatibility adapter, and legacy fallback.
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// Compatibility Adapter Tests (no DB required)
// ============================================================================

describe("WS-02: capabilitiesToPermissions — compatibility adapter", () => {
  it("owner capabilities produce full permissions", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );

    const ownerCaps = new Set([
      "workspace.manage",
      "workspace.settings",
      "workspace.members.invite",
      "workspace.members.remove",
      "workspace.members.editRole",
      "workspace.billing",
      "models.view",
      "models.manage",
      "documents.upload",
      "documents.view",
      "documents.delete",
      "agents.view",
      "agents.create",
      "agents.delete",
      "chat.send",
    ]);

    const perms = capabilitiesToPermissions(ownerCaps);
    expect(perms.canRead).toBe(true);
    expect(perms.canWrite).toBe(true);
    expect(perms.canDelete).toBe(true);
    expect(perms.canManageMembers).toBe(true);
    expect(perms.canManageSettings).toBe(true);
  });

  it("viewer capabilities produce read-only permissions", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );

    const viewerCaps = new Set([
      "models.view",
      "providers.view",
      "chat.history",
      "documents.view",
      "agents.view",
      "workflows.view",
      "governance.view",
    ]);

    const perms = capabilitiesToPermissions(viewerCaps);
    expect(perms.canRead).toBe(true);
    expect(perms.canWrite).toBe(false);
    expect(perms.canDelete).toBe(false);
    expect(perms.canManageMembers).toBe(false);
    expect(perms.canManageSettings).toBe(false);
  });

  it("member capabilities produce read+write without admin", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );

    const memberCaps = new Set([
      "models.view",
      "providers.view",
      "chat.send",
      "chat.history",
      "documents.upload",
      "documents.view",
      "agents.view",
      "agents.create",
      "agents.edit",
      "workflows.view",
      "workflows.execute",
      "governance.view",
      "reporting.view",
    ]);

    const perms = capabilitiesToPermissions(memberCaps);
    expect(perms.canRead).toBe(true);
    expect(perms.canWrite).toBe(true); // has chat.send, documents.upload, agents.create
    expect(perms.canDelete).toBe(false); // no workspace.manage, documents.delete, agents.delete
    expect(perms.canManageMembers).toBe(false);
    expect(perms.canManageSettings).toBe(false);
  });

  it("empty capabilities produce deny-all permissions", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );

    const noCaps = new Set<string>();
    const perms = capabilitiesToPermissions(noCaps);
    expect(perms.canRead).toBe(false);
    expect(perms.canWrite).toBe(false);
    expect(perms.canDelete).toBe(false);
    expect(perms.canManageMembers).toBe(false);
    expect(perms.canManageSettings).toBe(false);
  });

  it("admin capabilities match admin role semantics", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );

    // Admin has everything except workspace.manage (no delete workspace)
    // but has workspace.settings
    const adminCaps = new Set([
      "workspace.settings",
      "workspace.members.invite",
      "workspace.members.remove",
      "workspace.members.editRole",
      "models.view",
      "models.manage",
      "models.benchmark",
      "providers.view",
      "providers.manage",
      "providers.secrets",
      "chat.send",
      "chat.history",
      "documents.upload",
      "documents.view",
      "documents.delete",
      "documents.reindex",
      "agents.view",
      "agents.create",
      "agents.edit",
      "agents.delete",
      "agents.promote",
      "workflows.view",
      "workflows.manage",
      "workflows.execute",
      "governance.view",
      "governance.manage",
      "reporting.view",
      "reporting.manage",
    ]);

    const perms = capabilitiesToPermissions(adminCaps);
    expect(perms.canRead).toBe(true);
    expect(perms.canWrite).toBe(true);
    expect(perms.canDelete).toBe(true); // has documents.delete, agents.delete
    expect(perms.canManageMembers).toBe(true); // has workspace.members.invite
    expect(perms.canManageSettings).toBe(true); // has workspace.settings
  });
});

// ============================================================================
// Module Import Tests
// ============================================================================

describe("WS-02: capability-resolver module exports", () => {
  it("exports all expected functions", async () => {
    const mod = await import("../../server/workspace/capability-resolver");
    expect(typeof mod.resolveWorkspaceCapabilities).toBe("function");
    expect(typeof mod.hasCapability).toBe("function");
    expect(typeof mod.capabilitiesToPermissions).toBe("function");
    expect(typeof mod.resolveWorkspacePermissions).toBe("function");
  });
});

// ============================================================================
// Permissions Service Integration Tests
// ============================================================================

describe("WS-02: permissions-service exports remain stable", () => {
  it("permissions-service exports all original functions", async () => {
    const mod = await import("../../server/workspaces/permissions-service");
    expect(typeof mod.getUserWorkspaceRole).toBe("function");
    expect(typeof mod.getWorkspacePermissions).toBe("function");
    expect(typeof mod.hasPermission).toBe("function");
    expect(typeof mod.addWorkspaceMember).toBe("function");
    expect(typeof mod.removeWorkspaceMember).toBe("function");
    expect(typeof mod.updateMemberRole).toBe("function");
    expect(typeof mod.getWorkspaceMembers).toBe("function");
    expect(typeof mod.getUserWorkspaces).toBe("function");
  });

  it("WorkspacePermissions interface shape is preserved", () => {
    // Compile-time check: the interface still has all 5 fields
    const perms: import("../../server/workspaces/permissions-service").WorkspacePermissions = {
      canRead: true,
      canWrite: false,
      canDelete: false,
      canManageMembers: false,
      canManageSettings: false,
    };
    expect(Object.keys(perms)).toHaveLength(5);
  });
});
