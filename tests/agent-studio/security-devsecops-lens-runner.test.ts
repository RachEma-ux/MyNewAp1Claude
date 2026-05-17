/**
 * Security/DevSecOps lens runner — 10th real `LensRunnerFn` (T-G.3.5).
 * Brings lens-stack coverage to 10/10.
 *
 * Mirrors code-intelligence-lens-runner.test.ts shape line-for-
 * line with the security-graph specifics added: the
 * **approver-only** permission gate is the only structural
 * difference from code_intelligence (which is workspace_members).
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  buildSecurityDevSecOpsLensSnapshot,
  clampSecurityDevSecOpsLensLimit,
  createSecurityDevSecOpsLensRunner,
  isSecurityDevSecOpsNodeVisibleToViewer,
  maybeInstallSecurityDevSecOpsLensRunner,
  SECURITY_DEVSECOPS_LENS_ABSOLUTE_LIMIT,
  SECURITY_DEVSECOPS_LENS_DEFAULT_LIMIT,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  runLens,
  type GraphLensDefinition,
  type SecurityDevSecOpsLensReadFn,
  type SecurityDevSecOpsLensReadResult,
  type LensRunnerViewerContext,
} from "../../server/agent-studio/services/graph-lens/public-api";

beforeEach(() => {
  __resetLensRunnerRegistryForTests();
});

const NOW = new Date("2026-05-17T12:00:00Z");

// Approver viewer (has role)
const VIEWER_APPROVER: LensRunnerViewerContext & { role?: string } = {
  workspaceId: 1,
  userId: 42,
  role: "approver",
};
const VIEWER_SECURITY: LensRunnerViewerContext & { role?: string } = {
  workspaceId: 1,
  userId: 42,
  role: "security",
};
const VIEWER_ADMIN: LensRunnerViewerContext & { role?: string } = {
  workspaceId: 1,
  userId: 42,
  role: "admin",
};
// Non-approver viewer (has userId but no qualifying role)
const VIEWER_NON_APPROVER: LensRunnerViewerContext & { role?: string } = {
  workspaceId: 1,
  userId: 42,
  role: "viewer",
};
// Anonymous (no userId)
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(overrides: Partial<GraphLensDefinition> = {}): GraphLensDefinition {
  return {
    id: "security_devsecops_x",
    kind: "security_devsecops",
    label: "Security DevSecOps",
    layout: "dependency_path",
    governanceScope: "approver_only",
    description: "test lens",
    ...overrides,
  };
}

function makeRead(
  overrides: Partial<SecurityDevSecOpsLensReadResult> = {},
): SecurityDevSecOpsLensReadResult {
  return {
    ingestionId: "nvd::2026-05-17T00:00:00Z",
    sourceKey: "nvd",
    nodes: [
      { id: "cve:CVE-2026-0001", typeKey: "cve", name: "CVE-2026-0001" },
      { id: "package:npm:foo:1.2.3", typeKey: "package", name: "foo@1.2.3" },
    ],
    edges: [
      {
        id: "cve:CVE-2026-0001::affects_package::package:npm:foo:1.2.3",
        sourceId: "cve:CVE-2026-0001",
        edgeTypeKey: "affects_package",
        targetId: "package:npm:foo:1.2.3",
      },
    ],
    truncated: false,
    ...overrides,
  };
}

describe("T-G.3.5 — Security/DevSecOps lens runner", () => {
  describe("clampSecurityDevSecOpsLensLimit", () => {
    it("DEFAULT when undefined / zero / negative", () => {
      expect(clampSecurityDevSecOpsLensLimit(undefined)).toBe(
        SECURITY_DEVSECOPS_LENS_DEFAULT_LIMIT,
      );
      expect(clampSecurityDevSecOpsLensLimit(0)).toBe(
        SECURITY_DEVSECOPS_LENS_DEFAULT_LIMIT,
      );
      expect(clampSecurityDevSecOpsLensLimit(-5)).toBe(
        SECURITY_DEVSECOPS_LENS_DEFAULT_LIMIT,
      );
    });
    it("caps at ABSOLUTE", () => {
      expect(
        clampSecurityDevSecOpsLensLimit(
          SECURITY_DEVSECOPS_LENS_ABSOLUTE_LIMIT * 2,
        ),
      ).toBe(SECURITY_DEVSECOPS_LENS_ABSOLUTE_LIMIT);
    });
    it("passes through within range", () => {
      expect(clampSecurityDevSecOpsLensLimit(50)).toBe(50);
    });
  });

  describe("isSecurityDevSecOpsNodeVisibleToViewer (approver_only gate)", () => {
    it("admin → visible", () => {
      expect(isSecurityDevSecOpsNodeVisibleToViewer(VIEWER_ADMIN)).toBe(true);
    });
    it("approver → visible", () => {
      expect(isSecurityDevSecOpsNodeVisibleToViewer(VIEWER_APPROVER)).toBe(true);
    });
    it("security → visible", () => {
      expect(isSecurityDevSecOpsNodeVisibleToViewer(VIEWER_SECURITY)).toBe(true);
    });
    it("non-approver viewer with role 'viewer' → HIDDEN", () => {
      expect(isSecurityDevSecOpsNodeVisibleToViewer(VIEWER_NON_APPROVER)).toBe(false);
    });
    it("anonymous (userId null) → HIDDEN", () => {
      expect(isSecurityDevSecOpsNodeVisibleToViewer(VIEWER_ANON)).toBe(false);
    });
    it("authenticated viewer with no role at all → HIDDEN", () => {
      const v: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
      expect(isSecurityDevSecOpsNodeVisibleToViewer(v)).toBe(false);
    });
  });

  describe("buildSecurityDevSecOpsLensSnapshot", () => {
    it("approver sees ingestion-anchor + 2 nodes + 1 edge", () => {
      const snap = buildSecurityDevSecOpsLensSnapshot({
        def: makeDef(),
        viewer: VIEWER_APPROVER,
        read: makeRead(),
        now: NOW,
      });
      expect(snap.nodes).toHaveLength(3); // 1 ingestion + 2 read nodes
      expect(snap.edges).toHaveLength(1);
      expect(snap.kind).toBe("security_devsecops");
      expect(snap.layout).toBe("dependency_path");
    });

    it("non-approver viewer sees all nodes as hidden + hiddenNodeCount populated", () => {
      const snap = buildSecurityDevSecOpsLensSnapshot({
        def: makeDef(),
        viewer: VIEWER_NON_APPROVER,
        read: makeRead(),
        now: NOW,
      });
      expect(snap.nodes.every((n) => n.visible === false)).toBe(true);
      expect(snap.hiddenNodeCount).toBe(3);
      expect(snap.edges.every((e) => e.visible === false)).toBe(true);
    });

    it("preserves closed-taxonomy typeKeys verbatim (cve / package / affects_package)", () => {
      const snap = buildSecurityDevSecOpsLensSnapshot({
        def: makeDef(),
        viewer: VIEWER_APPROVER,
        read: makeRead(),
        now: NOW,
      });
      const typeKeys = snap.nodes.map((n) => n.typeKey);
      expect(typeKeys).toContain("cve");
      expect(typeKeys).toContain("package");
      expect(typeKeys).toContain("security_graph_ingestion");
      expect(snap.edges[0]?.typeKey).toBe("affects_package");
    });

    it("skips synthetic ingestion node when read has no ingestionId", () => {
      const snap = buildSecurityDevSecOpsLensSnapshot({
        def: makeDef(),
        viewer: VIEWER_APPROVER,
        read: makeRead({ ingestionId: null, sourceKey: null, nodes: [], edges: [] }),
        now: NOW,
      });
      expect(snap.nodes).toHaveLength(0);
    });

    it("propagates the read's truncated flag", () => {
      const snap = buildSecurityDevSecOpsLensSnapshot({
        def: makeDef(),
        viewer: VIEWER_APPROVER,
        read: makeRead({ truncated: true }),
        now: NOW,
      });
      expect(snap.truncated).toBe(true);
    });
  });

  describe("createSecurityDevSecOpsLensRunner", () => {
    it("invokes the read fn with the clamped limit", async () => {
      const calls: Array<{ limit: number }> = [];
      const read: SecurityDevSecOpsLensReadFn = async (params) => {
        calls.push({ limit: params.limit });
        return makeRead();
      };
      const runner = createSecurityDevSecOpsLensRunner({ read, now: () => NOW });
      const snap = await runner(makeDef(), { ...VIEWER_APPROVER, limit: 50 });
      expect(calls).toEqual([{ limit: 50 }]);
      expect(snap.producedAt).toEqual(NOW);
    });

    it("uses default limit when viewer.limit is undefined", async () => {
      const calls: Array<{ limit: number }> = [];
      const read: SecurityDevSecOpsLensReadFn = async (params) => {
        calls.push({ limit: params.limit });
        return makeRead();
      };
      const runner = createSecurityDevSecOpsLensRunner({ read, now: () => NOW });
      await runner(makeDef(), VIEWER_APPROVER);
      expect(calls[0]?.limit).toBe(SECURITY_DEVSECOPS_LENS_DEFAULT_LIMIT);
    });
  });

  describe("maybeInstallSecurityDevSecOpsLensRunner", () => {
    it("envflag off → not installed", () => {
      const read: SecurityDevSecOpsLensReadFn = async () => makeRead();
      const result = maybeInstallSecurityDevSecOpsLensRunner({
        env: {},
        read,
      });
      expect(result.installed).toBe(false);
      expect(getLensRunner("security_devsecops")).toBeUndefined();
    });

    it("envflag on → installed + runnable via runLens for approver", async () => {
      const read: SecurityDevSecOpsLensReadFn = async () => makeRead();
      const result = maybeInstallSecurityDevSecOpsLensRunner({
        env: { AGS_GRAPH_LENS_SECURITY_DEVSECOPS_RUNNER_INSTALL: "on" },
        read,
        now: () => NOW,
      });
      expect(result.installed).toBe(true);
      expect(getLensRunner("security_devsecops")).toBeDefined();
      const snap = await runLens(makeDef(), VIEWER_APPROVER);
      expect(snap).not.toBeNull();
      expect(snap?.kind).toBe("security_devsecops");
      // Approver sees real labels
      expect(snap?.nodes.some((n) => n.visible)).toBe(true);
    });
  });
});
