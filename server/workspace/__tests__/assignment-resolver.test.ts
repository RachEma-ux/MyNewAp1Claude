/**
 * Workspace Assignment Resolver — Unit Tests
 *
 * Tests the assignment-driven staffing logic for workspaces.
 * Validates that workspace is READ-ONLY for staffing data.
 */

import { describe, it, expect } from "vitest";
import path from "path";

/**
 * These tests validate the resolver's contract and type shapes.
 * DB-dependent integration tests would require test fixtures.
 */

const REPO_ROOT = process.cwd();
const WORKSPACE_ROUTER_PATH = path.resolve(
  REPO_ROOT,
  "server/workspace/workspace-router.ts",
);
const SHELL_VIEW_RESOLVER_PATH = path.resolve(
  REPO_ROOT,
  "server/workspace/shell-view-resolver.ts",
);
const ASSIGNMENT_RESOLVER_PATH = path.resolve(
  REPO_ROOT,
  "server/workspace/assignment-resolver.ts",
);

describe("Workspace Assignment Resolver — Contract", () => {
  it("exports resolveWorkspaceAssignments function", async () => {
    const mod = await import("../assignment-resolver");
    expect(typeof mod.resolveWorkspaceAssignments).toBe("function");
  });

  it("exports getPendingRequests function", async () => {
    const mod = await import("../assignment-resolver");
    expect(typeof mod.getPendingRequests).toBe("function");
  });

  it("resolveWorkspaceAssignments returns empty view when DB unavailable", async () => {
    const { resolveWorkspaceAssignments } = await import("../assignment-resolver");
    // Without DATABASE_URL set, getDb() returns null → empty view
    const result = await resolveWorkspaceAssignments(999);
    expect(result).toEqual({
      assignments: [],
      conflicts: [],
      workload: [],
      summary: {
        totalAssignments: 0,
        activeAssignments: 0,
        totalAllocation: 0,
        hasConflicts: false,
      },
    });
  });

  it("getPendingRequests returns empty array when DB unavailable", async () => {
    const { getPendingRequests } = await import("../assignment-resolver");
    const result = await getPendingRequests(999);
    expect(result).toEqual([]);
  });
});

describe("Workspace Staffing — Governance Enforcement", () => {
  it("assignment-resolver module has NO write/insert/update/delete exports", async () => {
    const mod = await import("../assignment-resolver");
    const exportNames = Object.keys(mod);

    // Resolver must be read-only — no mutation functions. We check verb
    // PREFIXES (camelCase) so noun-bearing names like
    // `resolveWorkspaceAssignments` (read-only) don't trip the
    // `assign` / `assignment` / `release` substrings.
    const writeVerbPrefixes = [
      "create", "insert", "update", "delete", "remove",
      "assign", "release", "approve", "reject", "cancel",
      "mutate", "write", "set", "modify",
    ];

    for (const name of exportNames) {
      // Only function-style camelCase names start with a lowercase verb.
      const firstWord = name.match(/^[a-z]+/)?.[0] ?? "";
      expect(
        writeVerbPrefixes.includes(firstWord),
        `Export ${name} starts with write-verb ${firstWord}`,
      ).toBe(false);
    }
  });

  it("workspace router does NOT expose assignment write operations", async () => {
    // Verify the staffing sub-router only has query (read) endpoints
    // This is a structural test — the router definition should only use .query(), not .mutation()
    const routerSource = await import("fs/promises").then((fs) =>
      fs.readFile(WORKSPACE_ROUTER_PATH, "utf-8"),
    );

    // Find the staffing section
    const staffingStart = routerSource.indexOf("staffing: router({");
    const staffingEnd = routerSource.indexOf("}),", staffingStart + 100);
    if (staffingStart >= 0 && staffingEnd >= 0) {
      const staffingSection = routerSource.slice(staffingStart, staffingEnd);
      // Staffing section should NOT contain .mutation(
      expect(staffingSection).not.toContain(".mutation(");
    }
  });
});

describe("Workspace Shell View — Staffing Integration", () => {
  it("ShellView type includes staffing field", async () => {
    // Verify the shell view resolver exports a type with staffing
    const shellSource = await import("fs/promises").then((fs) =>
      fs.readFile(SHELL_VIEW_RESOLVER_PATH, "utf-8"),
    );
    expect(shellSource).toContain("staffing:");
    expect(shellSource).toContain("bridgeConnected:");
    expect(shellSource).toContain("assignmentCount:");
    expect(shellSource).toContain("hasConflicts:");
  });
});

describe("Assignment Lifecycle in Workspace", () => {
  it("only pending and active statuses are shown by default (not released/completed)", async () => {
    // Verify the resolver filters to active statuses
    const resolverSource = await import("fs/promises").then((fs) =>
      fs.readFile(ASSIGNMENT_RESOLVER_PATH, "utf-8"),
    );
    expect(resolverSource).toContain('"pending", "active"');
  });

  it("released/completed assignments can be included with flag", async () => {
    const resolverSource = await import("fs/promises").then((fs) =>
      fs.readFile(ASSIGNMENT_RESOLVER_PATH, "utf-8"),
    );
    expect(resolverSource).toContain("includeReleased");
    expect(resolverSource).toContain('"released", "completed"');
  });

  it("conflict detection checks for over_allocated employees", async () => {
    const resolverSource = await import("fs/promises").then((fs) =>
      fs.readFile(ASSIGNMENT_RESOLVER_PATH, "utf-8"),
    );
    expect(resolverSource).toContain("over_allocated");
    expect(resolverSource).toContain("totalAlloc > 100");
  });
});
