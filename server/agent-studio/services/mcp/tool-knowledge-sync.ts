/**
 * MCP Tool Knowledge Sync — Retrofit P7.
 *
 * Mirrors live MCP registry tools into `agsMcpToolKnowledge` so:
 *   - Reviewers can see "what tools exist for this workspace"
 *     without inspecting in-memory state.
 *   - Phase 4 retrieval picks up tool knowledge through the same
 *     `RacSourceType="tool_knowledge"` adapter that wraps
 *     `agsKnowledgeUnits` (D-NKU-6 — same row shape, no parallel
 *     pipeline).
 *   - Phase 8's ProposedToolCall validator can resolve `schemaHash`
 *     by reading the mirror.
 *
 * MCP itself remains source of truth at runtime — the dispatcher
 * always re-validates against the live registry before invoking. The
 * mirror is downstream cache.
 *
 * Drift detection: every tool snapshot is canonicalized + hashed
 * (SHA-256). When a tool reappears with a different hash, the row's
 * `schemaHash` is updated and the existing knowledge unit is rewritten
 * (D-NKU-4 idempotent on contentHash). Tools that disappear from a
 * server's snapshot have `available=false` set; their unit rows stay
 * in place so historic traces still resolve.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection";
import {
  agsMcpToolKnowledge,
} from "../../../../drizzle/tables/agent-studio";
import { readRiskClass } from "../cag/risk-classifier";
import {
  insertUnit,
  recordProvenance,
} from "../ingestion";
import type { McpTool } from "./types";
// M1-c5 (cycle-5 audit closure §M1-c5) — single source of truth for
// the canonical MCP tool-schema hash. Pre-cycle-5 this logic was
// inlined here AND duplicated in proposed-tool-call.ts; both now
// delegate to tool-schema-hash.ts.
import {
  canonicalizeMcpToolSchema,
  hashMcpToolSchema,
} from "./tool-schema-hash";

// ── Pure helpers (re-exported for caller compatibility) ───────────────

/** @deprecated Use `canonicalizeMcpToolSchema` from `./tool-schema-hash`. */
export const canonicalizeToolSnapshot = canonicalizeMcpToolSchema;

/** @deprecated Use `hashMcpToolSchema` from `./tool-schema-hash`. */
export const computeSchemaHash = hashMcpToolSchema;

// ── Service contract ──────────────────────────────────────────────────

export interface SyncToolKnowledgeInput {
  workspaceId: number;
  /** Logical server id (MCP server canonical key, NOT the connection id). */
  mcpServerId: string;
  /** Live snapshot of the server's tools. */
  tools: ReadonlyArray<McpTool>;
  /** Source row id in agsRacSources for `tool_knowledge` units. */
  knowledgeSourceId: number;
  /** Actor recording the sync (for provenance). */
  actorId: number;
}

export interface SyncToolKnowledgeResult {
  workspaceId: number;
  mcpServerId: string;
  toolsAdded: number;
  toolsUpdated: number;
  toolsUnchanged: number;
  toolsMarkedUnavailable: number;
  /** Tool names whose schemaHash changed (caller may invalidate CAG packs). */
  changedToolNames: string[];
}

/**
 * Sync a single MCP server's live tool snapshot into the mirror.
 *
 * Idempotent on `(workspaceId, mcpServerId, toolName)` — the unique
 * index in the schema enforces this. Tools that already exist are
 * compared by `schemaHash`; identical hashes leave the row untouched
 * (no UPDATE → no `updatedAt` churn).
 *
 * Returns a summary of the diff so callers can:
 *   - log "N tools added, M changed" to the operator UI
 *   - invalidate CAG packs that reference changed tools
 *   - feed the runtime trace
 */
export async function syncToolKnowledge(
  input: SyncToolKnowledgeInput,
): Promise<SyncToolKnowledgeResult> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");

  // Existing rows for this server + workspace.
  const existing = await db
    .select()
    .from(agsMcpToolKnowledge)
    .where(
      and(
        eq(agsMcpToolKnowledge.workspaceId, input.workspaceId),
        eq(agsMcpToolKnowledge.mcpServerId, input.mcpServerId),
      ),
    );
  const existingByName = new Map(existing.map((r) => [r.toolName, r]));

  const liveNames = new Set(input.tools.map((t) => t.name));

  let toolsAdded = 0;
  let toolsUpdated = 0;
  let toolsUnchanged = 0;
  const changedToolNames: string[] = [];

  for (const tool of input.tools) {
    const snapshot = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };
    const schemaHash = computeSchemaHash(snapshot);
    const riskClass = readRiskClass({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    });

    const prior = existingByName.get(tool.name);
    if (!prior) {
      const unitId = await mirrorToolAsUnit({
        workspaceId: input.workspaceId,
        knowledgeSourceId: input.knowledgeSourceId,
        toolName: tool.name,
        description: tool.description ?? "",
        snapshot,
        actorId: input.actorId,
      });
      await db.insert(agsMcpToolKnowledge).values({
        workspaceId: input.workspaceId,
        mcpServerId: input.mcpServerId,
        toolName: tool.name,
        toolVersion: null,
        schemaSnapshot: snapshot,
        schemaHash,
        description: tool.description ?? null,
        riskClass,
        lastSeenAt: new Date(),
        available: true,
        knowledgeUnitId: unitId,
        approvalTtlSeconds: null,
      });
      toolsAdded += 1;
      continue;
    }

    if (prior.schemaHash === schemaHash && prior.available) {
      // Touch lastSeenAt only — no schema/desc/risk changes.
      await db
        .update(agsMcpToolKnowledge)
        .set({ lastSeenAt: new Date() })
        .where(eq(agsMcpToolKnowledge.id, prior.id));
      toolsUnchanged += 1;
      continue;
    }

    // Schema or availability changed → update + re-mirror unit.
    const unitId = await mirrorToolAsUnit({
      workspaceId: input.workspaceId,
      knowledgeSourceId: input.knowledgeSourceId,
      toolName: tool.name,
      description: tool.description ?? "",
      snapshot,
      actorId: input.actorId,
    });
    await db
      .update(agsMcpToolKnowledge)
      .set({
        schemaSnapshot: snapshot,
        schemaHash,
        description: tool.description ?? null,
        riskClass,
        lastSeenAt: new Date(),
        available: true,
        knowledgeUnitId: unitId,
        updatedAt: new Date(),
      })
      .where(eq(agsMcpToolKnowledge.id, prior.id));
    toolsUpdated += 1;
    if (prior.schemaHash !== schemaHash) changedToolNames.push(tool.name);
  }

  // Tools that disappeared from the live snapshot.
  const disappeared = existing
    .filter((r) => !liveNames.has(r.toolName) && r.available)
    .map((r) => r.id);
  let toolsMarkedUnavailable = 0;
  if (disappeared.length > 0) {
    await db
      .update(agsMcpToolKnowledge)
      .set({ available: false, updatedAt: new Date() })
      .where(inArray(agsMcpToolKnowledge.id, disappeared));
    toolsMarkedUnavailable = disappeared.length;
  }

  return {
    workspaceId: input.workspaceId,
    mcpServerId: input.mcpServerId,
    toolsAdded,
    toolsUpdated,
    toolsUnchanged,
    toolsMarkedUnavailable,
    changedToolNames,
  };
}

/**
 * Helper: write a tool's snapshot as a NormalizedKnowledgeUnit row so
 * the retrieval path picks it up via the `tool_knowledge` source type
 * (D-NKU-6).
 */
async function mirrorToolAsUnit(input: {
  workspaceId: number;
  knowledgeSourceId: number;
  toolName: string;
  description: string;
  snapshot: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  };
  actorId: number;
}): Promise<number> {
  const provenanceId = await recordProvenance({
    workspaceId: input.workspaceId,
    sourceConnectorKey: "mcp_registry",
    parserKey: "mcp_tool_snapshot",
    normalizerKey: "identity",
    rawArtifactHash: computeSchemaHash(input.snapshot),
    metadata: { actorId: input.actorId, toolName: input.toolName },
  });
  const contentText = renderToolKnowledgeContent(input);
  const result = await insertUnit({
    workspaceId: input.workspaceId,
    sourceId: input.knowledgeSourceId,
    unitType: "tool_knowledge",
    contentText,
    contentJson: input.snapshot,
    permissionContext: { inheritFromSource: true },
    freshnessState: "fresh",
    provenanceId,
  });
  return result.unitId;
}

/**
 * Render a tool's snapshot into the canonical text projection (D-NKU-3)
 * the retrieval planner indexes against. Format is a structured, human
 * readable summary — no schema JSON in the projection (D-TOOL-3 keeps
 * raw input schemas out of prompts).
 */
function renderToolKnowledgeContent(input: {
  toolName: string;
  description: string;
}): string {
  const description = input.description.trim() || "(no description provided)";
  return `Tool: ${input.toolName}\nDescription: ${description}`;
}
