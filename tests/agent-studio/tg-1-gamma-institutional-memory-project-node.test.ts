/**
 * T-G.1.γ — Institutional Memory Lens: third projector-backed node
 * type (`inst_project`) wired through the lens runner.
 *
 * Replication of the α-shell pattern. Same acceptance shape:
 *   1. Legacy runner shape preserved when `projects` is undefined or [].
 *   2. When supplied, emits one `inst_project` per row with stable
 *      id + label + meta.
 *   3. Permission gate applies uniformly to inst_project.
 *   4. typeKey aligns with closed taxonomy entry `project` mapped to
 *      `workspaces` per source-mapping.
 *   5. Node id prefix `project:` is unique vs the existing 5 prefixes
 *      (agent: / user: / domain: / workflow: / person:).
 *
 * Note: the third PR adds `inst_project` alongside whatever the
 * branch base has. As of this writing the β branch (`inst_person`)
 * is still in CI; this γ branch ships independently off main and
 * tests against just the α (`inst_workflow`) baseline. If both β
 * and γ land via separate PRs, the merge order will resolve cleanly
 * since each only touches additive lines.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildInstitutionalMemoryLensSnapshot,
  type GraphLensDefinition,
  type InstitutionalMemoryLensAgentRow,
  type InstitutionalMemoryLensProjectRow,
  type InstitutionalMemoryLensReadResult,
  type InstitutionalMemoryLensWorkflowRow,
  type LensRunnerViewerContext,
} from "../../server/agent-studio/services/graph-lens/public-api";

import {
  INSTITUTIONAL_MEMORY_NODE_TYPES,
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
} from "../../server/agent-studio/services/institutional-memory/public-api";

const NOW = new Date("2026-05-17T19:30:00Z");
const T = new Date("2026-05-17T00:00:00Z");

const VIEWER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(): GraphLensDefinition {
  return {
    id: "inst_test_gamma",
    kind: "institutional_memory",
    label: "Institutional Memory",
    layout: "force_directed",
    governanceScope: "workspace_members",
  };
}

function makeAgent(
  overrides: Partial<InstitutionalMemoryLensAgentRow> = {},
): InstitutionalMemoryLensAgentRow {
  return {
    id: 1,
    name: "agent-one",
    internalKey: "agent_one",
    ownerId: 11,
    domain: "ops",
    visibility: "workspace",
    lifecycleState: "active",
    agentClass: "primary",
    createdAt: T,
    ...overrides,
  };
}

function makeWorkflow(
  overrides: Partial<InstitutionalMemoryLensWorkflowRow> = {},
): InstitutionalMemoryLensWorkflowRow {
  return {
    id: 100,
    name: "Nightly KB rebuild",
    description: null,
    createdAt: T,
    ...overrides,
  };
}

function makeProject(
  overrides: Partial<InstitutionalMemoryLensProjectRow> = {},
): InstitutionalMemoryLensProjectRow {
  return {
    id: 800,
    name: "Q3 Migration",
    purposeType: "product",
    status: "active",
    ownerId: 11,
    createdAt: T,
    ...overrides,
  };
}

describe("T-G.1.γ — InstitutionalMemoryLens emits inst_project nodes", () => {
  it("legacy runner shape preserved when projects is undefined", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent()],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const typeKeys = new Set(snap.nodes.map((n) => n.typeKey));
    expect(typeKeys.has("inst_project")).toBe(false);
  });

  it("legacy shape preserved when projects is empty array", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent()],
      projects: [],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    expect(snap.nodes.find((n) => n.typeKey === "inst_project")).toBeUndefined();
  });

  it("emits one inst_project per row with stable id + label + meta", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      projects: [
        makeProject({ id: 800, name: "Q3 Migration" }),
        makeProject({
          id: 801,
          name: "Q4 Hardening",
          purposeType: null,
          status: "draft",
        }),
      ],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const projects = snap.nodes.filter((n) => n.typeKey === "inst_project");
    expect(projects.length).toBe(2);
    expect(projects[0]!.id).toBe("project:800");
    expect(projects[0]!.label).toBe("Q3 Migration");
    expect(projects[0]!.visible).toBe(true);
    expect(projects[0]!.meta).toMatchObject({
      projectId: 800,
      name: "Q3 Migration",
      purposeType: "product",
      status: "active",
      ownerId: 11,
      createdAt: T.toISOString(),
    });
    expect(projects[1]!.id).toBe("project:801");
    expect(projects[1]!.meta).toMatchObject({
      purposeType: null,
      status: "draft",
    });
  });

  it("co-emits with legacy + workflow (proves prefix uniqueness with shared raw id)", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 900, ownerId: 900, domain: "900" })],
      workflows: [makeWorkflow({ id: 900 })],
      projects: [makeProject({ id: 900 })],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const ids = new Set(snap.nodes.map((n) => n.id));
    // 5 distinct typeKeys × shared raw id 900 + domain "900" → 5 ids
    expect(ids).toEqual(
      new Set([
        "agent:900",
        "user:900",
        "domain:900",
        "workflow:900",
        "project:900",
      ]),
    );
  });

  it("anonymous viewer gets visible:false inst_project contributing to hiddenNodeCount", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 1, ownerId: 11, domain: "ops" })],
      projects: [makeProject({ id: 800 }), makeProject({ id: 801 })],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read,
      now: NOW,
    });
    const projects = snap.nodes.filter((n) => n.typeKey === "inst_project");
    expect(projects.length).toBe(2);
    for (const n of projects) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    // 1 inst_owner + 1 inst_domain + 1 inst_agent + 2 inst_project = 5 hidden
    expect(snap.hiddenNodeCount).toBe(5);
  });

  it("typeKey `inst_project` aligns with closed taxonomy + source mapping", () => {
    expect((INSTITUTIONAL_MEMORY_NODE_TYPES as readonly string[])).toContain(
      "project",
    );
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.project.sourceTable).toBe(
      "workspaces",
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — protects against silent rename drift
// ──────────────────────────────────────────────────────────────────

describe("T-G.1.γ source-scan integrity", () => {
  it("runner file names the new typeKey, prefix, and read shape", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/institutional-memory-lens-runner.ts",
      ),
      "utf-8",
    );
    expect(file).toContain('"inst_project"');
    expect(file).toContain('"project:"');
    expect(file).toContain("InstitutionalMemoryLensProjectRow");
    expect(file).toContain("projects?:");
  });
});
