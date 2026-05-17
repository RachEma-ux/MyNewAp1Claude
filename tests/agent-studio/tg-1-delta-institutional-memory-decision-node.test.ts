/**
 * T-G.1.δ — Institutional Memory Lens: fourth projector-backed node
 * type (`inst_decision`) wired through the lens runner.
 *
 * Replication of the α-shell pattern. Same acceptance shape:
 *   1. Legacy runner shape preserved when `decisions` is undefined or [].
 *   2. When supplied, emits one `inst_decision` per row with stable
 *      id + label + meta.
 *   3. Permission gate applies uniformly to inst_decision.
 *   4. typeKey aligns with closed taxonomy entry `decision` mapped to
 *      `ags_approval_steps` per source-mapping.
 *   5. Node id prefix `decision:` is unique vs the existing 5 prefixes
 *      (agent: / user: / domain: / workflow: / person:).
 *
 * Note: the δ branch ships independently off main and tests against
 * the α (`inst_workflow`) + β (`inst_person`) baseline. If γ
 * (`inst_project`) merges first, this branch picks up its NODE_PREFIX
 * via additive merge — the prefix-uniqueness test still passes since
 * `decision:` is distinct from `project:`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildInstitutionalMemoryLensSnapshot,
  type GraphLensDefinition,
  type InstitutionalMemoryLensAgentRow,
  type InstitutionalMemoryLensDecisionRow,
  type InstitutionalMemoryLensReadResult,
  type InstitutionalMemoryLensWorkflowRow,
  type LensRunnerViewerContext,
} from "../../server/agent-studio/services/graph-lens/public-api";

import {
  INSTITUTIONAL_MEMORY_NODE_TYPES,
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
} from "../../server/agent-studio/services/institutional-memory/public-api";

const NOW = new Date("2026-05-17T20:00:00Z");
const T = new Date("2026-05-17T00:00:00Z");
const T_DECIDED = new Date("2026-05-17T12:34:56Z");

const VIEWER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(): GraphLensDefinition {
  return {
    id: "inst_test_delta",
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

function makeDecision(
  overrides: Partial<InstitutionalMemoryLensDecisionRow> = {},
): InstitutionalMemoryLensDecisionRow {
  return {
    id: 5000,
    publishRequestId: 200,
    stepOrder: 1,
    approverRole: "reviewer",
    state: "approved",
    decidedBy: 42,
    decisionNote: "LGTM",
    decidedAt: T_DECIDED,
    createdAt: T,
    ...overrides,
  };
}

describe("T-G.1.δ — InstitutionalMemoryLens emits inst_decision nodes", () => {
  it("legacy runner shape preserved when decisions is undefined", () => {
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
    expect(typeKeys.has("inst_decision")).toBe(false);
  });

  it("legacy shape preserved when decisions is empty array", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent()],
      decisions: [],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    expect(snap.nodes.find((n) => n.typeKey === "inst_decision")).toBeUndefined();
  });

  it("emits one inst_decision per row with stable id + label + meta", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      decisions: [
        makeDecision({
          id: 5000,
          state: "approved",
          approverRole: "reviewer",
          stepOrder: 1,
        }),
        makeDecision({
          id: 5001,
          state: "rejected",
          approverRole: "owner",
          stepOrder: 2,
          decidedBy: null,
          decisionNote: null,
          decidedAt: null,
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
    const decisions = snap.nodes.filter((n) => n.typeKey === "inst_decision");
    expect(decisions.length).toBe(2);
    expect(decisions[0]!.id).toBe("decision:5000");
    expect(decisions[0]!.label).toBe("approved: reviewer (step 1)");
    expect(decisions[0]!.visible).toBe(true);
    expect(decisions[0]!.meta).toMatchObject({
      decisionId: 5000,
      publishRequestId: 200,
      stepOrder: 1,
      approverRole: "reviewer",
      state: "approved",
      decidedBy: 42,
      decisionNote: "LGTM",
      decidedAt: T_DECIDED.toISOString(),
      createdAt: T.toISOString(),
    });
    expect(decisions[1]!.id).toBe("decision:5001");
    expect(decisions[1]!.label).toBe("rejected: owner (step 2)");
    expect(decisions[1]!.meta).toMatchObject({
      decisionId: 5001,
      state: "rejected",
      decidedBy: null,
      decisionNote: null,
      decidedAt: null,
    });
  });

  it("decidedAt null vs Date serialization", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      decisions: [
        makeDecision({ id: 6000, decidedAt: null }),
        makeDecision({ id: 6001, decidedAt: T_DECIDED }),
      ],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const decisions = snap.nodes.filter((n) => n.typeKey === "inst_decision");
    expect(decisions[0]!.meta).toMatchObject({ decidedAt: null });
    expect(decisions[1]!.meta).toMatchObject({
      decidedAt: T_DECIDED.toISOString(),
    });
  });

  it("co-emits with legacy + workflow (proves prefix uniqueness with shared raw id)", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 900, ownerId: 900, domain: "900" })],
      workflows: [makeWorkflow({ id: 900 })],
      decisions: [makeDecision({ id: 900 })],
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
        "decision:900",
      ]),
    );
  });

  it("anonymous viewer gets visible:false inst_decision contributing to hiddenNodeCount", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 1, ownerId: 11, domain: "ops" })],
      decisions: [makeDecision({ id: 5000 }), makeDecision({ id: 5001 })],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read,
      now: NOW,
    });
    const decisions = snap.nodes.filter((n) => n.typeKey === "inst_decision");
    expect(decisions.length).toBe(2);
    for (const n of decisions) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    // 1 inst_owner + 1 inst_domain + 1 inst_agent + 2 inst_decision = 5 hidden
    expect(snap.hiddenNodeCount).toBe(5);
  });

  it("typeKey `inst_decision` aligns with closed taxonomy + source mapping", () => {
    expect((INSTITUTIONAL_MEMORY_NODE_TYPES as readonly string[])).toContain(
      "decision",
    );
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.decision.sourceTable).toBe(
      "ags_approval_steps",
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — protects against silent rename drift
// ──────────────────────────────────────────────────────────────────

describe("T-G.1.δ source-scan integrity", () => {
  it("runner file names the new typeKey, prefix, and read shape", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/institutional-memory-lens-runner.ts",
      ),
      "utf-8",
    );
    expect(file).toContain('"inst_decision"');
    expect(file).toContain('"decision:"');
    expect(file).toContain("InstitutionalMemoryLensDecisionRow");
    expect(file).toContain("decisions?:");
  });
});
