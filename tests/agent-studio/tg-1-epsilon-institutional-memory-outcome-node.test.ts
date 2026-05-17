/**
 * T-G.1.ε — Institutional Memory Lens: fifth projector-backed node
 * type (`inst_outcome`) wired through the lens runner.
 *
 * Replication of the α-shell pattern. Same acceptance shape:
 *   1. Legacy runner shape preserved when `outcomes` is undefined or [].
 *   2. When supplied, emits one `inst_outcome` per row with stable
 *      id + label + meta.
 *   3. Permission gate applies uniformly to inst_outcome.
 *   4. typeKey aligns with closed taxonomy entry `outcome` mapped to
 *      `ags_runtime_runs` per source-mapping.
 *   5. Node id prefix `outcome:` is unique vs the existing prefixes.
 *
 * Note: this ε branch ships independently off main and tests against
 * the α (`inst_workflow`) + β (`inst_person`) + γ (`inst_project`)
 * baseline; δ (`inst_decision`) is concurrent in PR #1406 and merges
 * additively.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildInstitutionalMemoryLensSnapshot,
  type GraphLensDefinition,
  type InstitutionalMemoryLensAgentRow,
  type InstitutionalMemoryLensOutcomeRow,
  type InstitutionalMemoryLensReadResult,
  type InstitutionalMemoryLensWorkflowRow,
  type LensRunnerViewerContext,
} from "../../server/agent-studio/services/graph-lens/public-api";

import {
  INSTITUTIONAL_MEMORY_NODE_TYPES,
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
} from "../../server/agent-studio/services/institutional-memory/public-api";

const NOW = new Date("2026-05-17T21:00:00Z");
const T = new Date("2026-05-17T00:00:00Z");
const T_FINISHED = new Date("2026-05-17T01:23:45Z");

const VIEWER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(): GraphLensDefinition {
  return {
    id: "inst_test_epsilon",
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

function makeOutcome(
  overrides: Partial<InstitutionalMemoryLensOutcomeRow> = {},
): InstitutionalMemoryLensOutcomeRow {
  return {
    id: 7000,
    agentId: 1,
    agentKey: "agent_one",
    environment: "production",
    status: "succeeded",
    summary: "All steps green",
    durationMs: 4321,
    finishedAt: T_FINISHED,
    createdAt: T,
    ...overrides,
  };
}

describe("T-G.1.ε — InstitutionalMemoryLens emits inst_outcome nodes", () => {
  it("legacy runner shape preserved when outcomes is undefined", () => {
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
    expect(typeKeys.has("inst_outcome")).toBe(false);
  });

  it("legacy shape preserved when outcomes is empty array", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent()],
      outcomes: [],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    expect(snap.nodes.find((n) => n.typeKey === "inst_outcome")).toBeUndefined();
  });

  it("emits one inst_outcome per row with stable id + label + meta", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      outcomes: [
        makeOutcome({
          id: 7000,
          agentId: 1,
          agentKey: "agent_one",
          environment: "production",
          status: "succeeded",
        }),
        makeOutcome({
          id: 7001,
          agentId: 2,
          agentKey: "agent_two",
          environment: "draft",
          status: "failed",
          summary: null,
          durationMs: null,
          finishedAt: null,
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
    const outcomes = snap.nodes.filter((n) => n.typeKey === "inst_outcome");
    expect(outcomes.length).toBe(2);
    expect(outcomes[0]!.id).toBe("outcome:7000");
    expect(outcomes[0]!.label).toBe("succeeded: agent_one (production)");
    expect(outcomes[0]!.visible).toBe(true);
    expect(outcomes[0]!.meta).toMatchObject({
      outcomeId: 7000,
      agentId: 1,
      agentKey: "agent_one",
      environment: "production",
      status: "succeeded",
      summary: "All steps green",
      durationMs: 4321,
      finishedAt: T_FINISHED.toISOString(),
      createdAt: T.toISOString(),
    });
    expect(outcomes[1]!.id).toBe("outcome:7001");
    expect(outcomes[1]!.label).toBe("failed: agent_two (draft)");
    expect(outcomes[1]!.meta).toMatchObject({
      outcomeId: 7001,
      status: "failed",
      summary: null,
      durationMs: null,
      finishedAt: null,
    });
  });

  it("finishedAt null vs Date serialization", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      outcomes: [
        makeOutcome({ id: 8000, finishedAt: null }),
        makeOutcome({ id: 8001, finishedAt: T_FINISHED }),
      ],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const outcomes = snap.nodes.filter((n) => n.typeKey === "inst_outcome");
    expect(outcomes[0]!.meta).toMatchObject({ finishedAt: null });
    expect(outcomes[1]!.meta).toMatchObject({
      finishedAt: T_FINISHED.toISOString(),
    });
  });

  it("co-emits with legacy + workflow (proves prefix uniqueness with shared raw id)", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 900, ownerId: 900, domain: "900" })],
      workflows: [makeWorkflow({ id: 900 })],
      outcomes: [makeOutcome({ id: 900 })],
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
        "outcome:900",
      ]),
    );
  });

  it("anonymous viewer gets visible:false inst_outcome contributing to hiddenNodeCount", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 1, ownerId: 11, domain: "ops" })],
      outcomes: [makeOutcome({ id: 7000 }), makeOutcome({ id: 7001 })],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read,
      now: NOW,
    });
    const outcomes = snap.nodes.filter((n) => n.typeKey === "inst_outcome");
    expect(outcomes.length).toBe(2);
    for (const n of outcomes) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    // 1 inst_owner + 1 inst_domain + 1 inst_agent + 2 inst_outcome = 5 hidden
    expect(snap.hiddenNodeCount).toBe(5);
  });

  it("typeKey `inst_outcome` aligns with closed taxonomy + source mapping", () => {
    expect((INSTITUTIONAL_MEMORY_NODE_TYPES as readonly string[])).toContain(
      "outcome",
    );
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.outcome.sourceTable).toBe(
      "ags_runtime_runs",
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — protects against silent rename drift
// ──────────────────────────────────────────────────────────────────

describe("T-G.1.ε source-scan integrity", () => {
  it("runner file names the new typeKey, prefix, and read shape", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/institutional-memory-lens-runner.ts",
      ),
      "utf-8",
    );
    expect(file).toContain('"inst_outcome"');
    expect(file).toContain('"outcome:"');
    expect(file).toContain("InstitutionalMemoryLensOutcomeRow");
    expect(file).toContain("outcomes?:");
  });
});
