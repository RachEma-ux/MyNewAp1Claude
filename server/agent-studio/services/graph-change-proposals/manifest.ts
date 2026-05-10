/**
 * Graph Change Proposals Service — Module Manifest.
 *
 * Phase 11.5. Governs graph-shaped mutations (create / update / deprecate
 * nodes, create / update / remove edges, entity merge / split, observation /
 * provenance / projection corrections) via a proposal + decision pair.
 *
 * Boundary: agents cannot directly mutate Neo4j; all mutations route
 * through this service's lifecycle.
 *
 * ADRs:
 *   - agent-studio-entity-resolution.md
 *   - agent-studio-graph-provenance-lineage.md
 *   - agent-studio-note-promotion-binding-semantics.md (§4)
 */

export const graphChangeProposalsManifest = {
  key: "agentStudioGraphChangeProposals",
  name: "Agent Studio Graph Change Proposals — Governed Graph Mutations",
  version: "1.0.0",
  runtime: {
    mode: "embedded" as const,
    required: false,
    dependsOn: ["agentStudio"],
  },
  database: {
    kind: "shared" as const,
    schema: "asdb",
  },
  routerKey: "agentStudioGraphChangeProposals",
  permissions: {
    keys: [
      "graphChangeProposals.read",
      "graphChangeProposals.write",
      "graphChangeProposals.approve",
    ],
  },
  governanceActions: [
    {
      key: "graphChangeProposals.submit",
      description: "Submit a governed graph mutation proposal",
    },
    {
      key: "graphChangeProposals.approve",
      description: "Approve a pending graph change proposal",
    },
    {
      key: "graphChangeProposals.reject",
      description: "Reject a pending graph change proposal",
    },
    {
      key: "graphChangeProposals.withdraw",
      description: "Withdraw a proposal previously submitted by the actor",
    },
  ],
  events: {
    emits: [
      "graphChangeProposal.submitted",
      "graphChangeProposal.approved",
      "graphChangeProposal.rejected",
      "graphChangeProposal.withdrawn",
    ],
  },
  ports: {
    provided: [
      "graphChangeProposal.submit",
      "graphChangeProposal.approve",
      "graphChangeProposal.reject",
      "graphChangeProposal.withdraw",
    ],
    consumed: ["governance.evaluate", "graph.projection.enqueue"],
  },
  communication: {
    modes: ["port", "event"] as const,
  },
  publicApi: {
    path: "server/agent-studio/services/graph-change-proposals/public-api.ts",
  },
} as const;

export type GraphChangeProposalsManifest = typeof graphChangeProposalsManifest;
