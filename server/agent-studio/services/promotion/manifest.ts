/**
 * Promotion Service — Module Manifest.
 *
 * Phase 11. Note → CAG / Graph Skill / Tool Knowledge / Workflow / Policy /
 * Evaluation Case / Runtime Investigation / Graph Entity / Knowledge Unit /
 * Temporal Observation. Hooks into existing approval scaffolding.
 *
 * ADR: agent-studio-note-promotion-binding-semantics.md
 */

export const promotionManifest = {
  key: "agentStudioPromotion",
  name: "Agent Studio Promotion — Note → Runtime Asset Workflows",
  version: "1.0.0",
  runtime: {
    mode: "embedded" as const,
    required: false,
    dependsOn: ["agentStudio", "agentStudioVault"],
  },
  database: {
    kind: "shared" as const,
    schema: "asdb",
  },
  routerKey: "agentStudioPromotion",
  permissions: {
    keys: ["promotion.read", "promotion.write", "promotion.approve"],
  },
  governanceActions: [
    {
      key: "promotion.submit",
      description: "Submit a note version for promotion to a runtime asset",
    },
    {
      key: "promotion.approve",
      description: "Approve a pending promotion",
    },
    {
      key: "promotion.reject",
      description: "Reject a pending promotion",
    },
    {
      key: "promotion.rollback",
      description: "Roll back to a previous active version",
    },
  ],
  events: {
    emits: [
      "promotion.submitted",
      "promotion.approved",
      "promotion.rejected",
      "promotion.rolled_back",
    ],
  },
  ports: {
    provided: [
      "promotion.submit",
      "promotion.approve",
      "promotion.reject",
      "promotion.rollback",
    ],
    consumed: [
      "governance.evaluate",
      "graph.projection.enqueue",
    ],
  },
  communication: {
    modes: ["port", "event"] as const,
  },
  publicApi: {
    path: "server/agent-studio/services/promotion/public-api.ts",
  },
} as const;

export type PromotionManifest = typeof promotionManifest;
