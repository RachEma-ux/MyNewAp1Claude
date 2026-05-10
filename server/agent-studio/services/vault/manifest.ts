/**
 * Vault Service — Module Manifest.
 *
 * MVP 1. Mirrors KGRA Agent manifest shape.
 *
 * ADRs:
 *   - agent-studio-markdown-profile.md
 *   - agent-studio-note-metadata-domain-model.md
 *   - agent-studio-shared-vault-editing-locks.md
 */

export const vaultManifest = {
  key: "agentStudioVault",
  name: "Agent Studio Vault — Markdown Knowledge Workspace",
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
  routerKey: "agentStudioVault",
  permissions: {
    keys: ["vault.read", "vault.write", "vault.admin"],
  },
  governanceActions: [
    {
      key: "vault.note.promote",
      description: "Promote a note version to a runtime asset",
    },
    {
      key: "vault.member.add",
      description: "Add a member to a vault",
    },
  ],
  routes: [
    {
      path: "/agent-studio/vault",
      label: "Vault",
    },
  ],
  navigation: [
    {
      group: "agent-studio",
      label: "Vault",
      order: 40,
    },
  ],
  events: {
    emits: [
      "vault.created",
      "vault.note.created",
      "vault.note.updated",
      "vault.note.deleted",
      "vault.note.conflict",
      "vault.wikilink.changed",
    ],
  },
  ports: {
    provided: [
      "vault.note.create",
      "vault.note.read",
      "vault.note.update",
      "vault.search",
    ],
    consumed: [
      "graph.projection.enqueue",
    ],
  },
  communication: {
    modes: ["port", "event"] as const,
  },
  publicApi: {
    path: "server/agent-studio/services/vault/public-api.ts",
  },
} as const;

export type VaultManifest = typeof vaultManifest;
