/**
 * Seed Script Tests
 *
 * Tests:
 * 1. Seed creates capabilities via upsert
 * 2. Seed creates workspace roles
 * 3. Seed creates role→capability mappings
 * 4. Seed assigns owner membership with WorkspaceOwner
 * 5. Seed respects blockedCapabilities
 * 6. Idempotent re-run
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

// Mock loaders
const mockCapabilities = {
  version: 1,
  capabilities: [
    { key: "chat.send", description: "Send messages" },
    { key: "chat.history", description: "View history" },
    { key: "agents.view", description: "View agents" },
    { key: "agents.promote", description: "Promote agents" },
  ],
};

const mockPresets = {
  version: 1,
  roles: [
    {
      name: "WorkspaceOwner",
      description: "Full control",
      isSystem: true,
      allow: ["chat.send", "chat.history", "agents.view", "agents.promote"],
    },
    {
      name: "Viewer",
      description: "Read only",
      isSystem: true,
      allow: ["chat.history", "agents.view"],
    },
  ],
  workspaceTypes: [
    { type: "team", description: "Team", blockedCapabilities: [] },
    { type: "sandbox", description: "Sandbox", blockedCapabilities: ["agents.promote"] },
  ],
};

vi.mock("./loaders", () => ({
  loadCapabilitiesCatalog: vi.fn(() => mockCapabilities),
  loadWorkspaceRolePresets: vi.fn(() => mockPresets),
}));

// Mock DB connection
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../../db/connection", () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: (table: any) => ({
        where: () => ({
          limit: () => [{ id: 1, name: "test-user" }],
        }),
      }),
    }),
    insert: (table: any) => ({
      values: (v: any) => ({
        returning: () => [{ id: 1, name: "Seeded Workspace", ownerId: 1 }],
        onConflictDoNothing: () => ({
          returning: () => [],
        }),
      }),
    }),
  })),
}));

// Mock DB helper functions
const mockUpsertCapabilities = vi.fn().mockResolvedValue(4);
const mockUpsertWorkspaceRole = vi.fn();
const mockUpsertRoleCapability = vi.fn().mockResolvedValue(undefined);
const mockUpsertWorkspaceMember = vi.fn().mockResolvedValue(undefined);
const mockGetAllCapabilities = vi.fn();

// Track role creation calls
let roleCallCount = 0;

vi.mock("../../db/workspace-rbac", () => ({
  upsertCapabilities: (...args: any[]) => mockUpsertCapabilities(...args),
  upsertWorkspaceRole: (...args: any[]) => {
    roleCallCount++;
    const roleId = roleCallCount;
    return Promise.resolve({
      id: roleId,
      workspaceId: args[0],
      name: args[1],
      description: args[2],
      isSystem: args[3] ?? false,
      createdAt: new Date(),
    });
  },
  upsertRoleCapability: (...args: any[]) => mockUpsertRoleCapability(...args),
  upsertWorkspaceMember: (...args: any[]) => mockUpsertWorkspaceMember(...args),
  getAllCapabilities: () =>
    mockGetAllCapabilities().then ? mockGetAllCapabilities() : Promise.resolve(mockGetAllCapabilities()),
}));

import { seedWorkspace } from "./seed";

// ============================================================================
// Tests
// ============================================================================

describe("seedWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleCallCount = 0;
    mockGetAllCapabilities.mockReturnValue([
      { id: 1, key: "chat.send" },
      { id: 2, key: "chat.history" },
      { id: 3, key: "agents.view" },
      { id: 4, key: "agents.promote" },
    ]);
  });

  it("creates capabilities via upsert", async () => {
    const result = await seedWorkspace({
      owner: 1,
      workspaceType: "team",
      name: "Test",
      withDefaultAI: false,
    });

    expect(mockUpsertCapabilities).toHaveBeenCalledWith(mockCapabilities.capabilities);
    expect(result.capabilitiesUpserted).toBe(4);
  });

  it("creates workspace roles", async () => {
    const result = await seedWorkspace({
      owner: 1,
      workspaceType: "team",
      name: "Test",
      withDefaultAI: false,
    });

    expect(result.rolesCreated).toContain("WorkspaceOwner");
    expect(result.rolesCreated).toContain("Viewer");
    expect(result.rolesCreated.length).toBe(2);
  });

  it("creates role→capability mappings", async () => {
    await seedWorkspace({
      owner: 1,
      workspaceType: "team",
      name: "Test",
      withDefaultAI: false,
    });

    // WorkspaceOwner has 4 caps + Viewer has 2 caps = 6 mappings
    expect(mockUpsertRoleCapability).toHaveBeenCalledTimes(6);
  });

  it("assigns owner membership with WorkspaceOwner role", async () => {
    const result = await seedWorkspace({
      owner: 1,
      workspaceType: "team",
      name: "Test",
      withDefaultAI: false,
    });

    expect(result.ownerAssigned).toBe(true);
    expect(mockUpsertWorkspaceMember).toHaveBeenCalledWith(
      expect.any(Number), // workspaceId
      1, // userId (owner)
      expect.any(Number), // roleId (WorkspaceOwner)
      "owner"
    );
  });

  it("respects blockedCapabilities from workspace type preset", async () => {
    mockUpsertRoleCapability.mockClear();

    await seedWorkspace({
      owner: 1,
      workspaceType: "sandbox",
      name: "Sandbox Test",
      withDefaultAI: false,
    });

    // Sandbox blocks "agents.promote"
    // WorkspaceOwner: 4 allowed - 1 blocked = 3 mappings
    // Viewer: 2 allowed - 0 blocked (no agents.promote) = 2 mappings
    // Total = 5 mappings (not 6)
    expect(mockUpsertRoleCapability).toHaveBeenCalledTimes(5);
  });

  it("is idempotent on re-run", async () => {
    // First run
    await seedWorkspace({
      owner: 1,
      workspaceType: "team",
      name: "Test",
      withDefaultAI: false,
    });

    vi.clearAllMocks();
    roleCallCount = 0;
    mockUpsertCapabilities.mockResolvedValue(0); // 0 new on second run
    mockGetAllCapabilities.mockReturnValue([
      { id: 1, key: "chat.send" },
      { id: 2, key: "chat.history" },
      { id: 3, key: "agents.view" },
      { id: 4, key: "agents.promote" },
    ]);

    // Second run — should not throw, just return 0 new
    const result = await seedWorkspace({
      owner: 1,
      workspaceType: "team",
      name: "Test",
      withDefaultAI: false,
    });

    expect(result.capabilitiesUpserted).toBe(0);
    // Roles and mappings still created (upsert/ON CONFLICT DO NOTHING)
    expect(result.rolesCreated.length).toBe(2);
  });
});
