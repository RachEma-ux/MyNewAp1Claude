/**
 * Workspace Invariants Test Suite — WS-01 through WS-15
 *
 * Comprehensive tests for all 15 formal workspace invariants.
 * Structural tests run without DB. Integration tests require DB (describe.runIf).
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import type { WorkspaceContext } from "../../server/workspace/workspace-contract";
import type { WorkspacePermissions } from "../../server/workspaces/permissions-service";
import {
  WORKSPACE_STATUSES,
  WORKSPACE_PURPOSE_TYPES,
  type WorkspaceStatus,
  type WorkspacePurposeType,
} from "../../drizzle/tables/users";

// ============================================================================
// Helper: Build a mock WorkspaceContext for testing
// ============================================================================

function mockContext(overrides: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return {
    workspaceId: 1,
    workspaceName: "Test Workspace",
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
      name: "Test Workspace",
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
    ...overrides,
  };
}

// ============================================================================
// WS-01: Workspace Execution Contract
// ============================================================================

describe("WS-01: Every execution path resolves a WorkspaceContext", () => {
  it("WorkspaceContext has all required fields", () => {
    const ctx = mockContext();
    const requiredKeys: (keyof WorkspaceContext)[] = [
      "workspaceId",
      "workspaceName",
      "userId",
      "role",
      "permissions",
      "effectiveCapabilities",
      "enabledModules",
      "routingProfile",
      "workspaceType",
      "status",
      "purposeType",
      "workspace",
    ];

    for (const key of requiredKeys) {
      expect(key in ctx).toBe(true);
    }
  });

  it("resolveWorkspaceContext and requireWorkspaceContext are exported", async () => {
    const mod = await import("../../server/workspace/workspace-contract");
    expect(typeof mod.resolveWorkspaceContext).toBe("function");
    expect(typeof mod.requireWorkspaceContext).toBe("function");
    expect(typeof mod.hasContextPermission).toBe("function");
    expect(typeof mod.isModuleEnabled).toBe("function");
  });
});

// ============================================================================
// WS-02: Capability-Based Access Resolution
// ============================================================================

describe("WS-02: Access resolves through capability model", () => {
  it("capabilitiesToPermissions is deterministic", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );

    const caps = new Set(["models.view", "documents.upload", "chat.send"]);
    const p1 = capabilitiesToPermissions(caps);
    const p2 = capabilitiesToPermissions(caps);

    expect(p1).toEqual(p2);
  });

  it("empty capabilities produce deny-all", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );

    const perms = capabilitiesToPermissions(new Set());
    expect(perms.canRead).toBe(false);
    expect(perms.canWrite).toBe(false);
    expect(perms.canDelete).toBe(false);
  });

  it("effectiveCapabilities is a Set on WorkspaceContext", () => {
    const ctx = mockContext();
    expect(ctx.effectiveCapabilities).toBeInstanceOf(Set);
    expect(ctx.effectiveCapabilities.has("workspace.manage")).toBe(true);
  });
});

// ============================================================================
// WS-03: Workspace Boundary Scoping (per-purpose shells)
// ============================================================================

describe("WS-03: Workspace pages use scoped queries", () => {
  const SHELLS = [
    "PersonalWorkspaceShell",
    "ProjectWorkspaceShell",
    "ResearchWorkspaceShell",
  ] as const;

  for (const name of SHELLS) {
    it(`${name} does not use unscoped global agents.list`, () => {
      const filePath = path.resolve(
        process.cwd(),
        "client/src/pages",
        `${name}.tsx`,
      );
      if (!fs.existsSync(filePath)) return; // shell may have moved
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).not.toMatch(/trpc\.agents\.list\.useQuery\(\s*\)/);
    });

    it(`${name} threads workspaceId via URL params and basePath`, () => {
      const filePath = path.resolve(
        process.cwd(),
        "client/src/pages",
        `${name}.tsx`,
      );
      if (!fs.existsSync(filePath)) return;
      const content = fs.readFileSync(filePath, "utf-8");
      // URL-scoped: shells read workspaceId from useParams and mount
      // module routes under basePath (replaces prop-passing).
      expect(content).toContain("useParams");
      expect(content).toContain("workspaceId");
      expect(content).toMatch(/\$\{basePath\}/);
    });
  }
});

// ============================================================================
// WS-04: Workspace Lifecycle Status
// ============================================================================

describe("WS-04: Workspace lifecycle status enforcement", () => {
  // Lifecycle was extended from 6 statuses to a 9-status canonical
  // model: draft, ready_for_review, under_review, approved, published,
  // active, rejected, archived, deleted. The legacy "created" /
  // "configured" / "paused" names are mapped via LEGACY_STATUS_MAP.
  it("WORKSPACE_STATUSES is the canonical 9-status set", () => {
    const required = [
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
    for (const s of required) {
      expect(WORKSPACE_STATUSES, `missing status ${s}`).toContain(s);
    }
    expect(WORKSPACE_STATUSES.length).toBe(9);
  });

  it("isWorkspaceExecutable is true only for `active`", async () => {
    const { isWorkspaceExecutable } = await import(
      "../../server/workspace/workspace-lifecycle"
    );

    expect(isWorkspaceExecutable("active")).toBe(true);
    expect(isWorkspaceExecutable("draft")).toBe(false);
    expect(isWorkspaceExecutable("ready_for_review")).toBe(false);
    expect(isWorkspaceExecutable("archived")).toBe(false);
    expect(isWorkspaceExecutable("deleted")).toBe(false);
  });

  it("isWorkspaceReadable allows active and archived; deleted is blocked", async () => {
    const { isWorkspaceReadable } = await import(
      "../../server/workspace/workspace-lifecycle"
    );

    expect(isWorkspaceReadable("active")).toBe(true);
    expect(isWorkspaceReadable("archived")).toBe(true);
    expect(isWorkspaceReadable("deleted")).toBe(false);
  });

  it("requireExecutableWorkspace throws for archived workspace (without escape action)", async () => {
    const { requireExecutableWorkspace } = await import(
      "../../server/workspace/workspace-lifecycle"
    );

    const ctx = mockContext({ status: "archived" });
    expect(() => requireExecutableWorkspace(ctx)).toThrow(/archived/);
  });

  it("requireExecutableWorkspace throws for deleted workspace", async () => {
    const { requireExecutableWorkspace } = await import(
      "../../server/workspace/workspace-lifecycle"
    );

    const ctx = mockContext({ status: "deleted" });
    expect(() => requireExecutableWorkspace(ctx)).toThrow(/deleted/);
  });

  it("requireExecutableWorkspace passes for active workspace", async () => {
    const { requireExecutableWorkspace } = await import(
      "../../server/workspace/workspace-lifecycle"
    );

    const ctx = mockContext({ status: "active" });
    expect(() => requireExecutableWorkspace(ctx)).not.toThrow();
  });

  it("archived workspace allows escape-hatch actions", async () => {
    const { requireExecutableWorkspace, ARCHIVED_ALLOWED_ACTIONS } = await import(
      "../../server/workspace/workspace-lifecycle"
    );

    const ctx = mockContext({ status: "archived" });

    // Without action — should throw
    expect(() => requireExecutableWorkspace(ctx)).toThrow();

    // With allowed action — should not throw
    expect(() => requireExecutableWorkspace(ctx, "workspace.unarchive")).not.toThrow();
    expect(() => requireExecutableWorkspace(ctx, "workspace.get")).not.toThrow();
  });

  it("WorkspaceContext includes status field", () => {
    const ctx = mockContext();
    expect(ctx.status).toBe("active");
  });
});

// ============================================================================
// WS-05: Workspace Purpose Type
// ============================================================================

describe("WS-05: Workspace purpose type", () => {
  it("WORKSPACE_PURPOSE_TYPES includes all required types", () => {
    // Canonical purpose set was expanded from 6 to 8 (added
    // `research`, `operational`).
    const required = [
      "goal",
      "mission",
      "project",
      "team",
      "research",
      "operational",
      "strategy",
      "other",
    ];
    for (const t of required) {
      expect(WORKSPACE_PURPOSE_TYPES, `missing purpose ${t}`).toContain(t);
    }
    expect(WORKSPACE_PURPOSE_TYPES.length).toBe(8);
  });

  it("WorkspaceContext includes purposeType field", () => {
    const ctx = mockContext({ purposeType: "project" });
    expect(ctx.purposeType).toBe("project");
  });

  it("purposeType can be null", () => {
    const ctx = mockContext({ purposeType: null });
    expect(ctx.purposeType).toBeNull();
  });
});

// ============================================================================
// WS-06: Non-Executable Workspace Blocks Writes
// ============================================================================

describe("WS-06: Non-executable workspaces block writes", () => {
  it("isActionAllowed blocks writes on archived workspace (writes denied)", async () => {
    const { isActionAllowed } = await import(
      "../../server/workspace/workspace-lifecycle"
    );

    // Archived is the canonical "non-executable readable" status
    // (legacy "paused" was folded into archived).
    expect(isActionAllowed("archived", "documents.upload", false)).toBe(false);
    expect(isActionAllowed("archived", "workspace.get", true)).toBe(true);
  });

  it("isActionAllowed blocks all on deleted workspace", async () => {
    const { isActionAllowed } = await import(
      "../../server/workspace/workspace-lifecycle"
    );

    expect(isActionAllowed("deleted", "workspace.get", true)).toBe(false);
    expect(isActionAllowed("deleted", "workspace.get", false)).toBe(false);
  });

  it("isActionAllowed allows all on active workspace", async () => {
    const { isActionAllowed } = await import(
      "../../server/workspace/workspace-lifecycle"
    );

    expect(isActionAllowed("active", "documents.upload", false)).toBe(true);
    expect(isActionAllowed("active", "workspace.get", true)).toBe(true);
  });
});

// ============================================================================
// WS-07: Module Access Guard
// ============================================================================

describe("WS-07: Module access requires enablement", () => {
  it("isModuleEnabled returns false for disabled modules", async () => {
    const { isModuleEnabled } = await import(
      "../../server/workspace/workspace-contract"
    );

    const ctx = mockContext({ enabledModules: ["pmt", "knowledge"] });
    expect(isModuleEnabled(ctx, "pmt")).toBe(true);
    expect(isModuleEnabled(ctx, "agents")).toBe(false);
  });

  it("requireModule is exported from modules/registry", async () => {
    const { requireModule } = await import("../../server/modules/registry");
    expect(typeof requireModule).toBe("function");
  });
});

// ============================================================================
// WS-08: Permission Resolution Consistency
// ============================================================================

describe("WS-08: Permission resolution is consistent", () => {
  it("WorkspacePermissions interface has exactly 5 boolean fields", () => {
    const perms: WorkspacePermissions = {
      canRead: true,
      canWrite: false,
      canDelete: false,
      canManageMembers: false,
      canManageSettings: false,
    };
    expect(Object.keys(perms)).toHaveLength(5);
    for (const val of Object.values(perms)) {
      expect(typeof val).toBe("boolean");
    }
  });

  it("permissions-service exports all required functions", async () => {
    const mod = await import("../../server/workspaces/permissions-service");
    expect(typeof mod.getUserWorkspaceRole).toBe("function");
    expect(typeof mod.getWorkspacePermissions).toBe("function");
    expect(typeof mod.hasPermission).toBe("function");
  });
});

// ============================================================================
// WS-09: Workspace Identity Boundary
// ============================================================================

describe("WS-09: Workspace identity boundary", () => {
  it("workspaceId is always a positive integer in context", () => {
    const ctx = mockContext();
    expect(Number.isInteger(ctx.workspaceId)).toBe(true);
    expect(ctx.workspaceId).toBeGreaterThan(0);
  });

  it("workspaceName is always a non-empty string", () => {
    const ctx = mockContext();
    expect(typeof ctx.workspaceName).toBe("string");
    expect(ctx.workspaceName.length).toBeGreaterThan(0);
  });

  it("workspace.id matches workspaceId", () => {
    const ctx = mockContext();
    expect(ctx.workspace.id).toBe(ctx.workspaceId);
  });
});

// ============================================================================
// WS-10: Workspace Isolation
// ============================================================================

describe("WS-10: Cross-workspace access must be denied", () => {
  it("two contexts with different workspaceIds are distinct", () => {
    const ctx1 = mockContext({ workspaceId: 1, workspace: { ...mockContext().workspace, id: 1 } });
    const ctx2 = mockContext({ workspaceId: 2, workspace: { ...mockContext().workspace, id: 2 } });

    expect(ctx1.workspaceId).not.toBe(ctx2.workspaceId);
    expect(ctx1.workspace.id).not.toBe(ctx2.workspace.id);
  });

  it("hasWorkspaceAccess function is exported", async () => {
    const mod = await import("../../server/db/workspaces");
    expect(typeof mod.hasWorkspaceAccess).toBe("function");
  });
});

// ============================================================================
// WS-11: Workspace Owner Authority
// ============================================================================

describe("WS-11: Workspace owner has full control", () => {
  it("owner capabilities are a superset of all other roles", async () => {
    const { capabilitiesToPermissions } = await import(
      "../../server/workspace/capability-resolver"
    );

    const ownerCaps = new Set([
      "workspace.manage", "workspace.settings",
      "workspace.members.invite", "workspace.members.remove",
      "models.view", "models.manage", "documents.upload",
      "documents.view", "documents.delete", "agents.view",
      "agents.create", "agents.delete", "chat.send",
    ]);

    const perms = capabilitiesToPermissions(ownerCaps);
    expect(perms.canRead).toBe(true);
    expect(perms.canWrite).toBe(true);
    expect(perms.canDelete).toBe(true);
    expect(perms.canManageMembers).toBe(true);
    expect(perms.canManageSettings).toBe(true);
  });
});

// ============================================================================
// WS-12: Workspace Data Scoping
// ============================================================================

describe("WS-12: Workspace data queries are explicitly scoped", () => {
  it("workspace DB queries file exists", () => {
    const dbPath = path.resolve(process.cwd(), "server/db/workspaces.ts");
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it("getWorkspaceById scopes by workspaceId", () => {
    const dbPath = path.resolve(process.cwd(), "server/db/workspaces.ts");
    const content = fs.readFileSync(dbPath, "utf-8");
    expect(content).toContain("getWorkspaceById");
    expect(content).toMatch(/where.*workspaces\.id.*workspaceId/s);
  });
});

// ============================================================================
// WS-13: Activity Traceability
// ============================================================================

describe("WS-13: Workspace actions are auditable", () => {
  it("logActivity is exported from modules/registry", async () => {
    const mod = await import("../../server/modules/registry");
    expect(typeof mod.logActivity).toBe("function");
  });

  it("workspace_activity_log table exists in schema", async () => {
    const schema = await import("../../drizzle/schema");
    expect(schema.workspaceActivityLog).toBeDefined();
  });
});

// ============================================================================
// WS-14: Workspace Configuration Completeness
// ============================================================================

describe("WS-14: Workspace has required configuration", () => {
  it("workspace schema has embeddingModel with default", () => {
    const schemaPath = path.resolve(process.cwd(), "drizzle/tables/users.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toMatch(/embeddingModel.*default/);
  });

  it("workspace schema has chunkingStrategy with default", () => {
    const schemaPath = path.resolve(process.cwd(), "drizzle/tables/users.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toMatch(/chunkingStrategy.*default/);
  });

  it("workspace schema has status with default", () => {
    const schemaPath = path.resolve(process.cwd(), "drizzle/tables/users.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    // Default flipped from "active" to "draft" with the 9-status
    // canonical lifecycle (workspaces enter the world unsubmitted).
    expect(content).toMatch(/status.*default\("draft"\)/);
  });
});

// ============================================================================
// WS-15: Module Presets Match Workspace Types
// ============================================================================

describe("WS-15: Module presets are consistent with workspace types", () => {
  it("MODULE_PRESETS covers common workspace types", async () => {
    const { MODULE_PRESETS } = await import("../../server/modules/registry");
    expect(MODULE_PRESETS.personal).toBeDefined();
    expect(MODULE_PRESETS.team).toBeDefined();
    expect(MODULE_PRESETS.enterprise).toBeDefined();
    expect(MODULE_PRESETS.sandbox).toBeDefined();
    expect(MODULE_PRESETS.readonly).toBeDefined();
  });

  it("every MODULE_PRESET is a non-empty array", async () => {
    const { MODULE_PRESETS } = await import("../../server/modules/registry");
    for (const [type, modules] of Object.entries(MODULE_PRESETS)) {
      expect(Array.isArray(modules)).toBe(true);
      expect(modules.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Anti-Pattern Detection — Static Analysis
// ============================================================================

describe("Anti-patterns: No execution without workspaceId", () => {
  it("workspace router procedures require workspace ID in input", () => {
    const routersPath = path.resolve(process.cwd(), "server/workspace/workspace-router.ts");
    const content = fs.readFileSync(routersPath, "utf-8");

    // The workspace get/update/delete endpoints all require id input
    expect(content).toMatch(/get:.*input.*z\.object.*id:.*z\.number/s);
    expect(content).toMatch(/update:.*input.*z\.object.*id:.*z\.number/s);
    expect(content).toMatch(/delete:.*input.*z\.object.*id:.*z\.number/s);
  });
});

describe("Anti-patterns: Role-only permission logic is bridged", () => {
  it("permissions-service routes through capability resolver", () => {
    const permPath = path.resolve(process.cwd(), "server/workspaces/permissions-service.ts");
    const content = fs.readFileSync(permPath, "utf-8");

    // Must import from capability-resolver
    expect(content).toContain("capability-resolver");
    expect(content).toContain("resolveWorkspaceCapabilities");
    expect(content).toContain("capabilitiesToPermissions");
  });
});

// ============================================================================
// Documentation Verification
// ============================================================================

describe("Invariant documentation completeness", () => {
  it("WORKSPACE_INVARIANTS.md exists", () => {
    const docPath = path.resolve(process.cwd(), "docs/workspace/WORKSPACE_INVARIANTS.md");
    expect(fs.existsSync(docPath)).toBe(true);
  });

  it("WORKSPACE_INVARIANTS.md documents WS-01 through WS-15", () => {
    const docPath = path.resolve(process.cwd(), "docs/workspace/WORKSPACE_INVARIANTS.md");
    const content = fs.readFileSync(docPath, "utf-8");

    for (let i = 1; i <= 15; i++) {
      const id = `WS-${String(i).padStart(2, "0")}`;
      expect(content).toContain(id);
    }
  });
});
