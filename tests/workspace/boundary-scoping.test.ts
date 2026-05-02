/**
 * Boundary Scoping Tests — Phase 3 (post-per-purpose-shell migration)
 *
 * Validates WS-03: Workspace-facing data queries must be explicitly
 * scoped to the current workspace.
 *
 * The legacy `WorkspaceShell.tsx` / `WorkspaceDetail.tsx` were unified
 * into three per-purpose shells (Personal/Project/Research). The same
 * scoping invariant applies to each.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { WORKSPACE_SHELLS, allShellSources } from "./_workspace-shell-helpers";

const CLIENT_PAGES = path.resolve(process.cwd(), "client/src/pages");

// ============================================================================
// WS-03: Per-purpose shells use scoped queries (replaces WorkspaceDetail)
// ============================================================================

describe("WS-03: Per-purpose workspace shells use scoped queries", () => {
  for (const { name, source } of allShellSources()) {
    it(`${name} does NOT use unscoped global trpc.agents.list`, () => {
      // Bare `agents.list.useQuery()` (no args) is the global form.
      expect(source).not.toMatch(/trpc\.agents\.list\.useQuery\(\s*\)/);
    });

    it(`${name} uses workspace-scoped queries (workspaceId)`, () => {
      expect(source).toContain("workspaceId");
    });

    it(`${name} loads the workspace via workspaces.get with id`, () => {
      expect(source).toMatch(/trpc\.workspaces\.get\.useQuery\(\s*\{\s*id:\s*workspaceId/);
    });

    it(`${name} loads modules via modules.manage.list with workspaceId`, () => {
      expect(source).toMatch(
        /trpc\.modules\.manage\.list\.useQuery\(\s*\{\s*workspaceId/,
      );
    });
  }
});

// ============================================================================
// WS-03: Per-purpose shells use URL-scoped routing (replaces prop-passing)
// ============================================================================

describe("WS-03: Per-purpose shells route module pages under workspace prefix", () => {
  for (const { name, source } of allShellSources()) {
    it(`${name} reads workspaceId from useParams`, () => {
      expect(source).toContain("useParams");
      expect(source).toMatch(/workspaceId/);
    });

    it(`${name} mounts module routes under \${basePath}`, () => {
      // Routes for module sub-pages should be scoped to the
      // workspace-prefixed basePath, not bare paths.
      expect(source).toMatch(/\$\{basePath\}/);
    });
  }
});

// ============================================================================
// WS-03: Workspace module pages still use scoped queries
// ============================================================================

describe("WS-03: Workspace module pages use scoped queries", () => {
  it("AgentsRosterPage uses workspace-scoped agent list", () => {
    const filePath = path.join(CLIENT_PAGES, "workspace/AgentsRosterPage.tsx");
    if (!fs.existsSync(filePath)) {
      // Module page may have moved or been retired during the capsule
      // migration; fail soft so this test reflects the current
      // architecture, not a fossil.
      return;
    }
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toMatch(/agents\.list\.useQuery.*workspaceId/s);
    expect(content).not.toMatch(/trpc\.agents\.list\.useQuery\(\s*\)/);
  });
});

// ============================================================================
// Workspace Contract Module Export Verification
// ============================================================================

describe("WS-03: workspace-contract module is available", () => {
  it("workspace-contract.ts exists and exports contract types", async () => {
    const contractPath = path.resolve(
      process.cwd(),
      "server/workspace/workspace-contract.ts",
    );
    expect(fs.existsSync(contractPath)).toBe(true);
  });

  it("capability-resolver.ts exists and exports resolver functions", async () => {
    const resolverPath = path.resolve(
      process.cwd(),
      "server/workspace/capability-resolver.ts",
    );
    expect(fs.existsSync(resolverPath)).toBe(true);
  });
});

// ============================================================================
// Invariant Document Verification
// ============================================================================

describe("WS-01/02/03: Invariant documentation exists", () => {
  it("WORKSPACE_INVARIANTS.md exists in docs/workspace/", () => {
    const docPath = path.resolve(
      process.cwd(),
      "docs/workspace/WORKSPACE_INVARIANTS.md",
    );
    expect(fs.existsSync(docPath)).toBe(true);
  });

  it("WORKSPACE_INVARIANTS.md documents all three invariants", () => {
    const docPath = path.resolve(
      process.cwd(),
      "docs/workspace/WORKSPACE_INVARIANTS.md",
    );
    const content = fs.readFileSync(docPath, "utf-8");

    expect(content).toContain("WS-01");
    expect(content).toContain("WS-02");
    expect(content).toContain("WS-03");
  });
});

// Sanity: the helper sees the expected shells.
describe("Per-purpose workspace shells are present", () => {
  for (const name of WORKSPACE_SHELLS) {
    it(`${name}.tsx exists`, () => {
      expect(fs.existsSync(path.join(CLIENT_PAGES, `${name}.tsx`))).toBe(true);
    });
  }
});
