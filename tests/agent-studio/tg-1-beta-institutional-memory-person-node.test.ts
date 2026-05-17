/**
 * T-G.1.β — Institutional Memory Lens: second projector-backed node
 * type (`inst_person`) wired through the lens runner.
 *
 * Replication of the α-shell pattern (T-G.1.α, `inst_workflow`).
 * Same acceptance shape:
 *   1. Legacy runner shape preserved — callers that don't supply
 *      `persons` continue to get the existing emit set.
 *   2. When `persons` is supplied, the snapshot emits one
 *      `inst_person` node per row with stable id + label + meta.
 *   3. Label fallback ladder: name → email → user-${id} (never empty).
 *   4. Permission gate applies uniformly — anonymous viewer gets
 *      visible:false nodes contributing to hiddenNodeCount.
 *   5. typeKey `inst_person` aligns with the closed taxonomy entry
 *      `person`, mapped to `users` per
 *      `INSTITUTIONAL_MEMORY_SOURCE_MAPPING.person`.
 *   6. Node id prefix `person:` is unique vs the existing 4
 *      prefixes (agent:/user:/domain:/workflow:).
 *
 * The α-shell coexistence test (legacy 3 + inst_workflow + inst_person
 * co-emit) covers the cross-type stability.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildInstitutionalMemoryLensSnapshot,
  type GraphLensDefinition,
  type InstitutionalMemoryLensAgentRow,
  type InstitutionalMemoryLensPersonRow,
  type InstitutionalMemoryLensReadResult,
  type InstitutionalMemoryLensWorkflowRow,
  type LensRunnerViewerContext,
} from "../../server/agent-studio/services/graph-lens/public-api";

import {
  INSTITUTIONAL_MEMORY_NODE_TYPES,
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
} from "../../server/agent-studio/services/institutional-memory/public-api";

const NOW = new Date("2026-05-17T19:00:00Z");
const T = new Date("2026-05-17T00:00:00Z");

const VIEWER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(): GraphLensDefinition {
  return {
    id: "inst_test_beta",
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

function makePerson(
  overrides: Partial<InstitutionalMemoryLensPersonRow> = {},
): InstitutionalMemoryLensPersonRow {
  return {
    id: 500,
    name: "Alice Operator",
    email: "alice@example.com",
    role: "admin",
    createdAt: T,
    ...overrides,
  };
}

describe("T-G.1.β — InstitutionalMemoryLens emits inst_person nodes", () => {
  it("legacy runner shape preserved when persons is undefined", () => {
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
    expect(typeKeys.has("inst_person")).toBe(false);
    expect(typeKeys).toEqual(new Set(["inst_owner", "inst_domain", "inst_agent"]));
  });

  it("legacy shape preserved when persons is empty array", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent()],
      persons: [],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    expect(snap.nodes.find((n) => n.typeKey === "inst_person")).toBeUndefined();
    expect(snap.nodes.filter((n) => n.typeKey === "inst_agent").length).toBe(1);
  });

  it("emits one inst_person per row with stable id + label + meta", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      persons: [
        makePerson({ id: 500, name: "Alice" }),
        makePerson({ id: 501, name: "Bob", role: "user" }),
      ],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const persons = snap.nodes.filter((n) => n.typeKey === "inst_person");
    expect(persons.length).toBe(2);
    expect(persons[0]!.id).toBe("person:500");
    expect(persons[0]!.label).toBe("Alice");
    expect(persons[0]!.visible).toBe(true);
    expect(persons[0]!.meta).toMatchObject({
      personId: 500,
      name: "Alice",
      email: "alice@example.com",
      role: "admin",
      createdAt: T.toISOString(),
    });
    expect(persons[1]!.id).toBe("person:501");
    expect(persons[1]!.label).toBe("Bob");
  });

  it("label fallback ladder: name → email → user-${id}", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      persons: [
        makePerson({ id: 600, name: "HasName", email: "x@y.com" }),
        makePerson({ id: 601, name: null, email: "fallback@y.com" }),
        makePerson({ id: 602, name: null, email: null }),
      ],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const labels = snap.nodes
      .filter((n) => n.typeKey === "inst_person")
      .map((n) => n.label);
    expect(labels).toEqual(["HasName", "fallback@y.com", "user-602"]);
  });

  it("co-emits inst_person alongside legacy 3 + inst_workflow", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 1, ownerId: 11, domain: "ops" })],
      workflows: [makeWorkflow({ id: 100 })],
      persons: [makePerson({ id: 500 })],
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
      new Set([
        "inst_owner",
        "inst_domain",
        "inst_agent",
        "inst_workflow",
        "inst_person",
      ]),
    );
  });

  it("anonymous viewer gets visible:false inst_person contributing to hiddenNodeCount", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 1, ownerId: 11, domain: "ops" })],
      persons: [makePerson({ id: 500 }), makePerson({ id: 501 })],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read,
      now: NOW,
    });
    const persons = snap.nodes.filter((n) => n.typeKey === "inst_person");
    expect(persons.length).toBe(2);
    for (const n of persons) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    // 1 inst_owner + 1 inst_domain + 1 inst_agent + 2 inst_person = 5 hidden
    expect(snap.hiddenNodeCount).toBe(5);
  });

  it("person id prefix `person:` does not collide with existing 4 prefixes", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 700, ownerId: 700, domain: "700" })],
      workflows: [makeWorkflow({ id: 700 })],
      persons: [makePerson({ id: 700 })],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const ids = new Set(snap.nodes.map((n) => n.id));
    // 5 typeKeys × shared raw id 700 + domain "700" → 5 distinct ids
    expect(ids).toEqual(
      new Set([
        "agent:700",
        "user:700",
        "domain:700",
        "workflow:700",
        "person:700",
      ]),
    );
  });

  it("typeKey `inst_person` aligns with closed taxonomy + source mapping", () => {
    expect((INSTITUTIONAL_MEMORY_NODE_TYPES as readonly string[])).toContain(
      "person",
    );
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.person.sourceTable).toBe(
      "users",
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — protects against silent rename drift
// ──────────────────────────────────────────────────────────────────

describe("T-G.1.β source-scan integrity", () => {
  it("runner file names the new typeKey, prefix, and read shape", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/institutional-memory-lens-runner.ts",
      ),
      "utf-8",
    );
    expect(file).toContain('"inst_person"');
    expect(file).toContain('"person:"');
    expect(file).toContain("InstitutionalMemoryLensPersonRow");
    expect(file).toContain("persons?:");
  });
});
