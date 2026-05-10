/**
 * Graph Skill Pack Service — Module Manifest.
 *
 * Phase 12.5. Versioned, source-note-referenced procedural graph capability
 * bundles for Graph Agent Lite + Advanced.
 *
 * ADR: agent-studio-graph-skill-packs.md
 */

export const graphSkillManifest = {
  key: "agentStudioGraphSkill",
  name: "Agent Studio Graph Skill Packs",
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
  permissions: {
    keys: ["graph_skill.read", "graph_skill.write", "graph_skill.admin"],
  },
  governanceActions: [
    {
      key: "graph_skill.pack.publish",
      description: "Publish a new Graph Skill Pack version",
    },
    {
      key: "graph_skill.template.execute",
      description: "Execute a Cypher query template",
    },
  ],
  events: {
    emits: [
      "graph_skill.pack.published",
      "graph_skill.template.executed",
    ],
  },
  ports: {
    provided: [
      "graph_skill.pack.list",
      "graph_skill.pack.eligibility",
      "graph_skill.template.execute",
    ],
    consumed: ["graph.repository.read"],
  },
  communication: {
    modes: ["port", "event"] as const,
  },
  publicApi: {
    path: "server/agent-studio/services/graph-skill/public-api.ts",
  },
} as const;

export type GraphSkillManifest = typeof graphSkillManifest;
