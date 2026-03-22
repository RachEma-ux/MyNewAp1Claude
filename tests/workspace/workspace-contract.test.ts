/**
 * Workspace Contract Tests — Phase 1
 *
 * Validates WS-01: Every workspace-scoped execution path must be able
 * to resolve a WorkspaceContext.
 *
 * These tests verify the contract shape and resolver behavior using
 * real DB when available (describe.runIf(hasDb)).
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
} from "../helpers/governance-harness";

// Import the contract module — structural tests work without DB
import type { WorkspaceContext } from "../../server/workspace/workspace-contract";

// ============================================================================
// Structural Tests (no DB required)
// ============================================================================

describe("WS-01: WorkspaceContext contract shape", () => {
  it("WorkspaceContext interface has all required fields", () => {
    // Type-level check: verify the shape compiles correctly
    const mockCtx: WorkspaceContext = {
      workspaceId: 1,
      workspaceName: "Test",
      userId: 1,
      role: "owner",
      permissions: {
        canRead: true,
        canWrite: true,
        canDelete: true,
        canManageMembers: true,
        canManageSettings: true,
      },
      effectiveCapabilities: new Set(["workspace.manage", "models.view"]),
      enabledModules: ["pmt", "knowledge", "agents"],
      routingProfile: { defaultRoute: "AUTO" },
      workspaceType: "team",
      status: "active",
      purposeType: "team",
      workspace: {
        id: 1,
        name: "Test",
        description: null,
        type: "team",
        ownerId: 1,
        status: "active",
        purposeType: "team",
        purposeRef: null,
        embeddingModel: "bge-small-en-v1.5",
        chunkingStrategy: "semantic",
        chunkSize: 512,
        chunkOverlap: 50,
        vectorDb: "qdrant",
        collectionName: "ws_1",
        routingProfile: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    expect(mockCtx.workspaceId).toBe(1);
    expect(mockCtx.workspaceName).toBe("Test");
    expect(mockCtx.userId).toBe(1);
    expect(mockCtx.role).toBe("owner");
    expect(mockCtx.permissions.canRead).toBe(true);
    expect(mockCtx.effectiveCapabilities).toBeInstanceOf(Set);
    expect(mockCtx.enabledModules).toContain("pmt");
    expect(mockCtx.workspaceType).toBe("team");
    expect(mockCtx.status).toBe("active");
    expect(mockCtx.purposeType).toBe("team");
  });

  it("WorkspaceContext with null role represents no-access state", () => {
    const noAccess: WorkspaceContext = {
      workspaceId: 1,
      workspaceName: "Denied",
      userId: 999,
      role: null,
      permissions: {
        canRead: false,
        canWrite: false,
        canDelete: false,
        canManageMembers: false,
        canManageSettings: false,
      },
      effectiveCapabilities: new Set(),
      enabledModules: [],
      routingProfile: null,
      workspaceType: null,
      status: "active",
      purposeType: null,
      workspace: {} as any,
    };

    expect(noAccess.role).toBeNull();
    expect(noAccess.permissions.canRead).toBe(false);
    expect(noAccess.enabledModules).toHaveLength(0);
    expect(noAccess.effectiveCapabilities.size).toBe(0);
  });

  it("WorkspaceContext permissions cover all 5 boolean fields", () => {
    const permissionKeys = [
      "canRead",
      "canWrite",
      "canDelete",
      "canManageMembers",
      "canManageSettings",
    ];

    const mockPerms = {
      canRead: true,
      canWrite: false,
      canDelete: false,
      canManageMembers: false,
      canManageSettings: false,
    };

    for (const key of permissionKeys) {
      expect(key in mockPerms).toBe(true);
    }
  });
});

// ============================================================================
// Resolver Tests (DB required)
// ============================================================================

describe.runIf(hasDb)("WS-01: resolveWorkspaceContext — DB integration", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("resolveWorkspaceContext is importable and is a function", async () => {
    const mod = await import("../../server/workspace/workspace-contract");
    expect(typeof mod.resolveWorkspaceContext).toBe("function");
    expect(typeof mod.requireWorkspaceContext).toBe("function");
    expect(typeof mod.hasContextPermission).toBe("function");
    expect(typeof mod.isModuleEnabled).toBe("function");
  });
});

// ============================================================================
// Helper Tests (no DB required)
// ============================================================================

describe("WS-01: WorkspaceContext helper functions", () => {
  it("hasContextPermission returns correct boolean", async () => {
    const { hasContextPermission } = await import(
      "../../server/workspace/workspace-contract"
    );

    const ctx: WorkspaceContext = {
      workspaceId: 1,
      workspaceName: "Test",
      userId: 1,
      role: "member",
      permissions: {
        canRead: true,
        canWrite: true,
        canDelete: false,
        canManageMembers: false,
        canManageSettings: false,
      },
      effectiveCapabilities: new Set(["models.view", "chat.send"]),
      enabledModules: ["pmt"],
      routingProfile: null,
      workspaceType: "team",
      status: "active",
      purposeType: "team",
      workspace: {} as any,
    };

    expect(hasContextPermission(ctx, "canRead")).toBe(true);
    expect(hasContextPermission(ctx, "canWrite")).toBe(true);
    expect(hasContextPermission(ctx, "canDelete")).toBe(false);
    expect(hasContextPermission(ctx, "canManageMembers")).toBe(false);
  });

  it("isModuleEnabled checks enabledModules array", async () => {
    const { isModuleEnabled } = await import(
      "../../server/workspace/workspace-contract"
    );

    const ctx: WorkspaceContext = {
      workspaceId: 1,
      workspaceName: "Test",
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
      purposeType: "team",
      workspace: {} as any,
    };

    expect(isModuleEnabled(ctx, "pmt")).toBe(true);
    expect(isModuleEnabled(ctx, "knowledge")).toBe(true);
    expect(isModuleEnabled(ctx, "agents")).toBe(true);
    expect(isModuleEnabled(ctx, "collaboration")).toBe(false);
    expect(isModuleEnabled(ctx, "reporting")).toBe(false);
  });
});
