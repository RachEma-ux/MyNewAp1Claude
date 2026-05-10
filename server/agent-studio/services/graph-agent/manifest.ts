/**
 * Graph Agent Lite — Module Manifest.
 *
 * Phase 13. Mirrors `server/kgra-agent/manifest.ts` shape exactly.
 * Sibling module — NOT a replacement for KGRA Agent.
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md
 */

export const graphAgentManifest = {
  key: "graphAgent",
  name: "Graph Agent Lite — Vault-aware GraphRAG Agent",
  version: "1.0.0",
  runtime: {
    mode: "worker" as const,
    required: false,
    dependsOn: ["agentStudio", "openrouter", "mcp"],
  },
  database: {
    kind: "shared" as const,
    schema: "asdb",
  },
  routerKey: "graphAgent",
  permissions: {
    keys: ["graph_agent.read", "graph_agent.run"],
  },
  governanceActions: [
    {
      key: "graph_agent.run.execute",
      description: "Run a Graph Agent Lite query against the vault graph",
    },
    {
      key: "graph_agent.run.explain",
      description: "Retrieve Why-This-Answer explanation for a previous run",
    },
  ],
  routes: [
    {
      path: "/agent-studio/graph-agent",
      label: "Graph Agent",
    },
  ],
  navigation: [
    {
      group: "agent-studio",
      label: "Graph Agent",
      order: 50,
    },
  ],
  events: {
    emits: [
      "graph_agent.run.started",
      "graph_agent.run.completed",
      "graph_agent.run.failed",
      "graph_agent.proposal.created",
    ],
  },
  ports: {
    provided: ["graph_agent.run", "graph_agent.explain"],
    consumed: [
      "openrouter.execute",
      "mcp.dispatch",
      "graph.repository.read",
      "runtime.trace.write",
    ],
  },
  communication: {
    modes: ["port", "event"] as const,
  },
  publicApi: {
    path: "server/agent-studio/services/graph-agent/public-api.ts",
  },
} as const;

export type GraphAgentManifest = typeof graphAgentManifest;
