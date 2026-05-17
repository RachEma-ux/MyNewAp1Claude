/**
 * T-G.1.α — Institutional Memory Lens: first projector-backed node
 * type (`inst_workflow`) wired through the lens runner.
 *
 * Closes the gap between the closed-taxonomy contracts (10 mapped
 * types in `INSTITUTIONAL_MEMORY_SOURCE_MAPPING`) and the lens runner
 * (which previously only emitted the legacy agent/owner/domain trio).
 *
 * Acceptance for the α-slice:
 *   1. The legacy runner shape is preserved — callers that don't
 *      supply `workflows` continue to get the existing 3 typeKeys
 *      with no regression.
 *   2. When `workflows` is supplied, the snapshot emits one
 *      `inst_workflow` node per row with stable id + label + meta.
 *   3. Permission gate applies uniformly — when the viewer has no
 *      userId, `inst_workflow` nodes are emitted with `visible: false`
 *      and contribute to `hiddenNodeCount` (the load-bearing
 *      permission invariant the lens runner enforces for ALL node
 *      types).
 *   4. The new `inst_workflow` typeKey maps to the
 *      `INSTITUTIONAL_MEMORY_NODE_TYPES` taxonomy entry `workflow`.
 *   5. Node id prefix is unique (no collision with the existing
 *      agent:/user:/domain: prefixes).
 *
 * Source-scan integrity check at the bottom: the new typeKey, prefix,
 * and projector-mapped source table are all named in the source file
 * — protects against silent rename drift.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildInstitutionalMemoryLensSnapshot,
  type GraphLensDefinition,
  type InstitutionalMemoryLensAgentRow,
  type InstitutionalMemoryLensReadResult,
  type InstitutionalMemoryLensWorkflowRow,
  type LensRunnerViewerContext,
} from "../../server/agent-studio/services/graph-lens/public-api";

import {
  INSTITUTIONAL_MEMORY_NODE_TYPES,
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
} from "../../server/agent-studio/services/institutional-memory/public-api";

const NOW = new Date("2026-05-17T18:00:00Z");
const T = new Date("2026-05-17T00:00:00Z");

const VIEWER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(): GraphLensDefinition {
  return {
    id: "inst_test",
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
    description: "Recomputes the canonical KB index on a nightly cadence.",
    createdAt: T,
    ...overrides,
  };
}

describe("T-G.1.α — InstitutionalMemoryLens emits inst_workflow nodes", () => {
  it("legacy 3-typeKey runner shape preserved when workflows is undefined", () => {
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
    expect(typeKeys).toEqual(new Set(["inst_owner", "inst_domain", "inst_agent"]));
    expect(snap.nodes.find((n) => n.typeKey === "inst_workflow")).toBeUndefined();
  });

  it("legacy 3-typeKey shape preserved when workflows is empty array", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent()],
      workflows: [],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    expect(snap.nodes.find((n) => n.typeKey === "inst_workflow")).toBeUndefined();
    expect(snap.nodes.filter((n) => n.typeKey === "inst_agent").length).toBe(1);
  });

  it("emits one inst_workflow node per workflow row, with stable id + label + meta", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      workflows: [
        makeWorkflow({ id: 100, name: "first", description: "A" }),
        makeWorkflow({ id: 200, name: "second", description: null }),
      ],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const wfNodes = snap.nodes.filter((n) => n.typeKey === "inst_workflow");
    expect(wfNodes.length).toBe(2);
    expect(wfNodes[0]!.id).toBe("workflow:100");
    expect(wfNodes[0]!.label).toBe("first");
    expect(wfNodes[0]!.visible).toBe(true);
    expect(wfNodes[0]!.meta).toMatchObject({
      workflowId: 100,
      name: "first",
      description: "A",
      createdAt: T.toISOString(),
    });
    expect(wfNodes[1]!.id).toBe("workflow:200");
    expect(wfNodes[1]!.meta).toMatchObject({ workflowId: 200, description: null });
  });

  it("co-emits legacy agent/owner/domain nodes alongside new inst_workflow nodes", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 1, ownerId: 11, domain: "ops" })],
      workflows: [makeWorkflow({ id: 100 })],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const typeKeys = new Set(snap.nodes.map((n) => n.typeKey));
    expect(typeKeys).toEqual(
      new Set(["inst_owner", "inst_domain", "inst_agent", "inst_workflow"]),
    );
  });

  it("anonymous viewer gets visible:false inst_workflow nodes contributing to hiddenNodeCount", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 1, ownerId: 11, domain: "ops" })],
      workflows: [makeWorkflow({ id: 100 }), makeWorkflow({ id: 200 })],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read,
      now: NOW,
    });
    const wfNodes = snap.nodes.filter((n) => n.typeKey === "inst_workflow");
    expect(wfNodes.length).toBe(2);
    for (const n of wfNodes) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    // 1 inst_owner + 1 inst_domain + 1 inst_agent + 2 inst_workflow = 5 hidden
    expect(snap.hiddenNodeCount).toBe(5);
  });

  it("workflow id prefix `workflow:` does not collide with agent/user/domain prefixes", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 100, ownerId: 100, domain: "100" })],
      workflows: [makeWorkflow({ id: 100 })],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const ids = new Set(snap.nodes.map((n) => n.id));
    // 4 typeKeys × shared raw id 100 + 1 raw domain "100" → must remain 4 distinct ids
    expect(ids).toEqual(
      new Set(["agent:100", "user:100", "domain:100", "workflow:100"]),
    );
  });

  it("typeKey `inst_workflow` aligns with the closed taxonomy entry `workflow`", () => {
    // The runner uses the inst_-prefixed typeKey to namespace within the
    // graph-lens framework. The canonical taxonomy in
    // INSTITUTIONAL_MEMORY_NODE_TYPES uses the bare type name. The α-slice
    // asserts the bare name `workflow` IS in the closed taxonomy — proving
    // the prefix is purely a graph-lens namespacing convention, not a
    // taxonomy divergence.
    expect((INSTITUTIONAL_MEMORY_NODE_TYPES as readonly string[])).toContain(
      "workflow",
    );
    // And the mapping ladder points at the real SoT table.
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.workflow.sourceTable).toBe(
      "workflows",
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — protects against silent rename drift
// ──────────────────────────────────────────────────────────────────

describe("T-G.1.α source-scan integrity", () => {
  it("runner file names the new typeKey, prefix, and read shape", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/institutional-memory-lens-runner.ts",
      ),
      "utf-8",
    );
    expect(file).toContain('"inst_workflow"');
    expect(file).toContain('"workflow:"');
    expect(file).toContain("InstitutionalMemoryLensWorkflowRow");
    expect(file).toContain("workflows?:");
  });
});
