/**
 * Behavior tests for the institutional-memory lens saturation
 * (closes PR #1404 items 17, 18, 19).
 *
 * Item 17 — 3 truly-remaining node types (team, policy, governance_record)
 *           get runner handlers + read shapes.
 * Item 18 — ASDB reader saturation: every read field the runner
 *           consumes is now populated (agents / workflows / persons /
 *           projects / decisions / outcomes / timelineEvents /
 *           documents / teams / policies / governanceRecords).
 * Item 19 — Cross-node edges: person→agent (owns_agent), person→workflow
 *           (owns_workflow), project→workflow (contains_workflow),
 *           project→document (contains_document), agent→outcome
 *           (produced_outcome), person→team (member_of), team→project
 *           (works_on), governance_record→policy (enforces),
 *           decision→governance_record (audits).
 */

import { describe, expect, it } from "vitest";
import {
  buildInstitutionalMemoryLensSnapshot,
  type InstitutionalMemoryLensReadResult,
} from "../../server/agent-studio/services/graph-lens/runners/institutional-memory-lens-runner";
import type { GraphLensDefinition } from "../../server/agent-studio/services/graph-lens/contracts";
import type { LensRunnerViewerContext } from "../../server/agent-studio/services/graph-lens/runner-contract";

const def: GraphLensDefinition = {
  id: 1,
  kind: "institutional_memory" as never,
  layout: "force_directed" as never,
  workspaceId: 1,
  archivedAt: null,
} as unknown as GraphLensDefinition;

const viewer: LensRunnerViewerContext = {
  userId: 42,
  workspaceId: 1,
} as unknown as LensRunnerViewerContext;

const NOW = new Date("2026-05-20T00:00:00Z");

function buildSnapshot(read: Partial<InstitutionalMemoryLensReadResult>) {
  const full: InstitutionalMemoryLensReadResult = {
    agents: [],
    truncated: false,
    ...read,
  };
  return buildInstitutionalMemoryLensSnapshot({
    def,
    viewer,
    read: full,
    now: NOW,
  });
}

describe("institutional-memory lens saturation", () => {
  describe("item 17 — new node types", () => {
    it("team rows produce inst_team nodes labelled by workspace name", () => {
      const snap = buildSnapshot({
        teams: [
          {
            workspaceId: 7,
            workspaceName: "Platform",
            memberUserIds: [10, 20, 30],
          },
        ],
      });
      const team = snap.nodes.find((n) => n.typeKey === "inst_team");
      expect(team).toBeTruthy();
      expect(team?.id).toBe("team:7");
      expect(team?.label).toBe("Platform team");
      expect((team?.meta as Record<string, unknown>).memberCount).toBe(3);
      expect((team?.meta as Record<string, unknown>).memberUserIds).toEqual([10, 20, 30]);
    });

    it("policy rows produce inst_policy nodes deduped by policyKey", () => {
      const snap = buildSnapshot({
        policies: [
          { policyKey: "security", enforcementCount: 5 },
          { policyKey: "compliance", enforcementCount: 2 },
        ],
      });
      const policies = snap.nodes.filter((n) => n.typeKey === "inst_policy");
      expect(policies).toHaveLength(2);
      expect(policies.map((p) => p.id).sort()).toEqual(["policy:compliance", "policy:security"]);
    });

    it("governance_record rows produce inst_governance_record nodes with state-in-label", () => {
      const snap = buildSnapshot({
        governanceRecords: [
          {
            id: 100,
            approverRole: "security",
            state: "approved",
            decidedBy: 7,
            decisionNote: "ok",
            decidedAt: new Date("2026-05-19T00:00:00Z"),
            createdAt: new Date("2026-05-18T00:00:00Z"),
          },
        ],
      });
      const gr = snap.nodes.find((n) => n.typeKey === "inst_governance_record");
      expect(gr).toBeTruthy();
      expect(gr?.id).toBe("governance_record:100");
      expect(gr?.label).toContain("approved");
      expect(gr?.label).toContain("security");
    });
  });

  describe("item 19 — cross-node edges", () => {
    const fullRead: InstitutionalMemoryLensReadResult = {
      agents: [
        {
          id: 1,
          name: "Agent A",
          internalKey: "a",
          ownerId: 10,
          domain: "ml",
          visibility: "public",
          lifecycleState: "active",
          agentClass: "task",
          createdAt: NOW,
        },
      ],
      persons: [
        { id: 10, name: "Alice", email: null, role: "user", createdAt: NOW },
        { id: 11, name: "Bob", email: null, role: "user", createdAt: NOW },
      ],
      workflows: [
        {
          id: 100,
          name: "Daily ETL",
          description: null,
          createdAt: NOW,
          userId: 11,
          workspaceId: 7,
        },
      ],
      projects: [
        {
          id: 7,
          name: "Platform",
          purposeType: null,
          status: "active",
          ownerId: 10,
          createdAt: NOW,
        },
      ],
      documents: [
        {
          id: 50,
          vaultId: 1,
          title: "Roadmap",
          slug: "roadmap",
          governanceStatus: "active",
          currentVersionId: 1,
          createdByUserId: 10,
          createdAt: NOW,
          updatedAt: NOW,
          projectId: 7,
        },
      ],
      outcomes: [
        {
          id: 200,
          agentId: 1,
          agentKey: "a",
          environment: "prod",
          status: "succeeded",
          summary: null,
          durationMs: 100,
          finishedAt: NOW,
          createdAt: NOW,
        },
      ],
      teams: [
        { workspaceId: 7, workspaceName: "Platform", memberUserIds: [10, 11] },
      ],
      policies: [{ policyKey: "security", enforcementCount: 1 }],
      governanceRecords: [
        {
          id: 300,
          approverRole: "security",
          state: "approved",
          decidedBy: 10,
          decisionNote: null,
          decidedAt: NOW,
          createdAt: NOW,
        },
      ],
      decisions: [
        {
          id: 300,
          publishRequestId: 1,
          stepOrder: 1,
          approverRole: "security",
          state: "approved",
          decidedBy: 10,
          decisionNote: null,
          decidedAt: NOW,
          createdAt: NOW,
        },
      ],
      truncated: false,
    };

    it("owns_agent: person 10 → agent 1 (via agents.ownerId)", () => {
      const snap = buildSnapshot(fullRead);
      const e = snap.edges.find((edge) => edge.typeKey === "owns_agent");
      expect(e?.sourceNodeId).toBe("person:10");
      expect(e?.targetNodeId).toBe("agent:1");
    });

    it("owns_workflow: person 11 → workflow 100 (via workflows.userId)", () => {
      const snap = buildSnapshot(fullRead);
      const e = snap.edges.find((edge) => edge.typeKey === "owns_workflow");
      expect(e?.sourceNodeId).toBe("person:11");
      expect(e?.targetNodeId).toBe("workflow:100");
    });

    it("contains_workflow: project 7 → workflow 100 (via workflows.workspaceId)", () => {
      const snap = buildSnapshot(fullRead);
      const e = snap.edges.find((edge) => edge.typeKey === "contains_workflow");
      expect(e?.sourceNodeId).toBe("project:7");
      expect(e?.targetNodeId).toBe("workflow:100");
    });

    it("contains_document: project 7 → document 50 (via document.projectId)", () => {
      const snap = buildSnapshot(fullRead);
      const e = snap.edges.find((edge) => edge.typeKey === "contains_document");
      expect(e?.sourceNodeId).toBe("project:7");
      expect(e?.targetNodeId).toBe("document:50");
    });

    it("produced_outcome: agent 1 → outcome 200 (via outcome.agentId)", () => {
      const snap = buildSnapshot(fullRead);
      const e = snap.edges.find((edge) => edge.typeKey === "produced_outcome");
      expect(e?.sourceNodeId).toBe("agent:1");
      expect(e?.targetNodeId).toBe("outcome:200");
    });

    it("member_of: person 10 + 11 → team 7", () => {
      const snap = buildSnapshot(fullRead);
      const members = snap.edges
        .filter((edge) => edge.typeKey === "member_of")
        .map((edge) => `${edge.sourceNodeId}->${edge.targetNodeId}`)
        .sort();
      expect(members).toEqual(["person:10->team:7", "person:11->team:7"]);
    });

    it("works_on: team 7 → project 7", () => {
      const snap = buildSnapshot(fullRead);
      const e = snap.edges.find((edge) => edge.typeKey === "works_on");
      expect(e?.sourceNodeId).toBe("team:7");
      expect(e?.targetNodeId).toBe("project:7");
    });

    it("enforces: governance_record 300 → policy security", () => {
      const snap = buildSnapshot(fullRead);
      const e = snap.edges.find((edge) => edge.typeKey === "enforces");
      expect(e?.sourceNodeId).toBe("governance_record:300");
      expect(e?.targetNodeId).toBe("policy:security");
    });

    it("audits: decision 300 → governance_record 300", () => {
      const snap = buildSnapshot(fullRead);
      const e = snap.edges.find((edge) => edge.typeKey === "audits");
      expect(e?.sourceNodeId).toBe("decision:300");
      expect(e?.targetNodeId).toBe("governance_record:300");
    });

    it("no dangling edges: every cross-edge target exists in the node set", () => {
      const snap = buildSnapshot(fullRead);
      const nodeIds = new Set(snap.nodes.map((n) => n.id));
      for (const edge of snap.edges) {
        expect(nodeIds.has(edge.sourceNodeId)).toBe(true);
        expect(nodeIds.has(edge.targetNodeId)).toBe(true);
      }
    });
  });

  describe("legacy invariants preserved", () => {
    it("owned_by + belongs_to_domain edges from the original slice still emit", () => {
      const snap = buildSnapshot({
        agents: [
          {
            id: 1,
            name: "Agent A",
            internalKey: "a",
            ownerId: 99,
            domain: "ml",
            visibility: null,
            lifecycleState: "active",
            agentClass: null,
            createdAt: NOW,
          },
        ],
      });
      const types = snap.edges.map((e) => e.typeKey).sort();
      expect(types).toContain("owned_by");
      expect(types).toContain("belongs_to_domain");
    });

    it("hidden viewer (no userId) hides every new type's nodes too", () => {
      const anonViewer = { ...viewer, userId: null } as unknown as LensRunnerViewerContext;
      const snap = buildInstitutionalMemoryLensSnapshot({
        def,
        viewer: anonViewer,
        read: {
          agents: [],
          teams: [
            { workspaceId: 7, workspaceName: "Platform", memberUserIds: [] },
          ],
          policies: [{ policyKey: "p", enforcementCount: 1 }],
          governanceRecords: [
            {
              id: 1,
              approverRole: "p",
              state: "approved",
              decidedBy: null,
              decisionNote: null,
              decidedAt: null,
              createdAt: NOW,
            },
          ],
          truncated: false,
        },
        now: NOW,
      });
      for (const n of snap.nodes) {
        expect(n.visible).toBe(false);
      }
      expect(snap.hiddenNodeCount).toBe(3);
    });
  });

  describe("coverage (item 17)", () => {
    it("contracts module re-exports surface a closed taxonomy", async () => {
      const mod = await import(
        "../../server/agent-studio/services/institutional-memory/contracts"
      );
      expect(mod.INSTITUTIONAL_MEMORY_NODE_TYPES).toContain("team");
      expect(mod.INSTITUTIONAL_MEMORY_NODE_TYPES).toContain("policy");
      expect(mod.INSTITUTIONAL_MEMORY_NODE_TYPES).toContain("governance_record");
    });

    it("policy + governance_record now point at a real existing table", async () => {
      const { INSTITUTIONAL_MEMORY_SOURCE_MAPPING } = await import(
        "../../server/agent-studio/services/institutional-memory/contracts"
      );
      expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.policy.sourceTable).toBe(
        "ags_approval_steps",
      );
      expect(
        INSTITUTIONAL_MEMORY_SOURCE_MAPPING.governance_record.sourceTable,
      ).toBe("ags_approval_steps");
    });
  });
});
