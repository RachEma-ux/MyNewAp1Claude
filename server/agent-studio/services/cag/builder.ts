/**
 * CAG builder — RAC P1B.
 *
 * Pure function: takes a snapshot of (agent draft + skills + MCP tools)
 * already loaded by the resolver and produces a `CapabilityPackContent`
 * + a `CagSourceManifestEntry[]` for the store.
 *
 * Boundary: this file MUST NOT import the MCP dispatcher, the credential
 * resolver, the chat runtime, or the documents/embeddings/vectordb
 * stack. It is a pure transformation. P1E adds a script that lints this.
 */

import type { McpTool } from "../mcp/types";
import { hashJsonStable, aggregateManifestHash } from "./hashing";
import { classifyTool, isPackable } from "./risk-classifier";
import type { ClassifiedTool } from "./risk-classifier";
import { mapSkillsAndTools } from "./skill-tool-mapper";
import type { SkillRef } from "./skill-tool-mapper";
import type {
  CapabilityPackContent,
  CagSourceManifestEntry,
  ToolRiskClass,
} from "./types";

/** Snapshot of an MCP server's tools as the builder needs them. */
export interface BuilderMcpServerSnapshot {
  serverId: number;
  serverName: string;
  /** Snapshot version from `registry.RegistrySnapshot.version`. */
  snapshotVersion: number;
  tools: Array<McpTool & { riskClass?: ToolRiskClass; approvalRequired?: boolean }>;
}

export interface BuildPackInput {
  workspaceId: number;
  agentId: number;
  draftSnapshot: {
    agentDraftId: number;
    name: string;
    role: string | null;
    scope: string | null;
    mission: string | null;
  };
  skills: SkillRef[];
  /** Empty array if the agent has no MCP tools attached. */
  mcpServers: BuilderMcpServerSnapshot[];
}

export interface BuildPackOutput {
  content: CapabilityPackContent;
  sourceManifest: CagSourceManifestEntry[];
  /** Non-fatal observations. Quarantined-tool drops, etc. */
  warnings: string[];
}

/**
 * Build a capability pack. Caller is responsible for persisting via the
 * store (`createPack`). Idempotent at the builder level: same input →
 * same content + same source hashes (drives reuse in `createPack`).
 */
export function buildCapabilityPack(input: BuildPackInput): BuildPackOutput {
  const warnings: string[] = [];

  const allClassified = input.mcpServers.flatMap((srv) =>
    srv.tools.map((t) => ({
      ...classifyTool(t),
      serverId: srv.serverId,
      serverName: srv.serverName,
    })),
  );

  const packable: Array<ClassifiedTool & { serverId: number; serverName: string }> = [];
  for (const t of allClassified) {
    if (isPackable(t)) {
      packable.push(t);
    } else {
      warnings.push(
        `tool ${t.name} excluded (riskClass=${t.riskClass}); ` +
          (t.riskClass === "quarantined"
            ? "needs manifest classification"
            : "credential surface forbidden in CAG"),
      );
    }
  }

  const { skills, tools } = mapSkillsAndTools(input.skills, packable);

  const content: CapabilityPackContent = {
    identity: {
      agentId: input.agentId,
      agentDraftId: input.draftSnapshot.agentDraftId,
      name: input.draftSnapshot.name,
      role: input.draftSnapshot.role,
      scope: input.draftSnapshot.scope,
    },
    mission: input.draftSnapshot.mission,
    skills,
    tools,
    sources: buildSourcesArray(input),
  };

  const sourceManifest = buildSourceManifest(input);

  // Sanity: aggregate hash is computable; throw if manifest is malformed.
  // Not strictly necessary but flushes any bad shape early.
  aggregateManifestHash(sourceManifest);

  return { content, sourceManifest, warnings };
}

function buildSourcesArray(input: BuildPackInput): CapabilityPackContent["sources"] {
  const out: CapabilityPackContent["sources"] = [];
  out.push({ sourceType: "agent_draft", refId: String(input.draftSnapshot.agentDraftId) });
  for (const s of input.skills) {
    out.push({ sourceType: "skill", refId: String(s.id) });
  }
  for (const srv of input.mcpServers) {
    out.push({ sourceType: "mcp_snapshot", refId: String(srv.serverId) });
  }
  return out;
}

function buildSourceManifest(input: BuildPackInput): CagSourceManifestEntry[] {
  const entries: CagSourceManifestEntry[] = [];

  entries.push({
    sourceType: "agent_draft",
    refId: String(input.draftSnapshot.agentDraftId),
    hash: hashJsonStable({
      name: input.draftSnapshot.name,
      role: input.draftSnapshot.role,
      scope: input.draftSnapshot.scope,
      mission: input.draftSnapshot.mission,
    }),
  });

  for (const s of input.skills) {
    entries.push({
      sourceType: "skill",
      refId: String(s.id),
      hash: hashJsonStable({ name: s.name, description: s.description ?? null }),
    });
  }

  for (const srv of input.mcpServers) {
    entries.push({
      sourceType: "mcp_snapshot",
      refId: String(srv.serverId),
      // Hash spans (snapshotVersion, [tool names]) — same version + same
      // tool list = same hash. We deliberately don't hash inputSchema so
      // an MCP server changing its schema without changing its tool list
      // doesn't invalidate every pack. Schema changes will surface
      // through the `pack_validation_failed` path on next build.
      hash: hashJsonStable({
        version: srv.snapshotVersion,
        tools: srv.tools.map((t) => t.name).sort(),
      }),
      version: String(srv.snapshotVersion),
    });
  }

  return entries;
}
