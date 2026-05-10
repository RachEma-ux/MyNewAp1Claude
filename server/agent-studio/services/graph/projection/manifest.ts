/**
 * Graph Projection Service — Module Manifest.
 *
 * Phase 1.7 / 7.5. Consumes domain events from vault / promotion / runtime
 * trace services and projects to Neo4j CE via GraphRepository.
 *
 * ADR: agent-studio-graph-projection-sync.md
 */

export const graphProjectionManifest = {
  key: "agentStudioGraphProjection",
  name: "Agent Studio Graph Projection — Postgres → Neo4j CE Sync",
  version: "1.0.0",
  runtime: {
    mode: "worker" as const,
    required: false,
    dependsOn: ["agentStudio"],
  },
  database: {
    kind: "shared" as const,
    schema: "asdb",
  },
  permissions: {
    keys: ["graph_projection.read", "graph_projection.admin"],
  },
  governanceActions: [
    {
      key: "graph_projection.rebuild",
      description: "Trigger a full projection rebuild from Postgres source-of-truth",
    },
    {
      key: "graph_projection.snapshot",
      description: "Take a projection snapshot",
    },
  ],
  events: {
    emits: [
      "graph_projection.sync.completed",
      "graph_projection.sync.failed",
      "graph_projection.drift.detected",
      "graph_projection.rebuild.completed",
    ],
    consumes: [
      "vault.note.created",
      "vault.note.updated",
      "vault.wikilink.changed",
      "promotion.approved",
      "runtime_trace.created",
      "decision_trace.created",
    ],
  },
  ports: {
    provided: ["graph.projection.enqueue", "graph.projection.rebuild"],
    consumed: ["graph.repository.write"],
  },
  communication: {
    modes: ["port", "event"] as const,
  },
  publicApi: {
    path: "server/agent-studio/services/graph/projection/public-api.ts",
  },
} as const;

export type GraphProjectionManifest = typeof graphProjectionManifest;
