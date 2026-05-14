/**
 * CAG store — DB CRUD for `ags_cag_capability_packs`.
 *
 * Pure I/O layer. No business logic, no validation, no rendering.
 * Imports allowed:
 *   - drizzle table imports
 *   - getAsDb (ASDB connection)
 *   - hashing utilities (same package)
 *   - types (same package)
 *
 * Imports forbidden (P1E boundary check will enforce):
 *   - server/agent-studio/services/mcp/dispatcher.ts (live tool execution)
 *   - server/provider-connections/internal/credential-resolver.ts
 *   - server/secrets/encryption.ts
 *   - server/documents/* / server/embeddings/* / server/vectordb/*
 */

import { createHash } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getAsDb, getAsDbForWorkspace } from "../../db/connection";
import {
  agsCagCapabilityPacks,
} from "../../../../drizzle/tables/agent-studio";
import {
  aggregateManifestHash,
  hashMapsEqual,
  manifestToHashMap,
} from "./hashing";
import { appendPackEvent } from "./events";
import type {
  CagCapabilityPack,
  CreatePackInput,
  CreatePackResult,
} from "./types";

function rowToPack(row: typeof agsCagCapabilityPacks.$inferSelect): CagCapabilityPack {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    agentDraftId: row.agentDraftId,
    catalogEntryId: row.catalogEntryId ?? null,
    packType: row.packType,
    packVersion: row.packVersion,
    status: row.status as CagCapabilityPack["status"],
    contentJson: (row.contentJson ?? {}) as Record<string, unknown>,
    compressedPrompt: row.compressedPrompt ?? null,
    tokenEstimate: row.tokenEstimate ?? null,
    sourceManifestJson: (row.sourceManifestJson ?? { entries: [] }) as CagCapabilityPack["sourceManifestJson"],
    sourceHashesJson: (row.sourceHashesJson ?? {}) as Record<string, string>,
    injectionPolicyJson: (row.injectionPolicyJson ?? null) as Record<string, unknown> | null,
    riskSummaryJson: (row.riskSummaryJson ?? null) as Record<string, unknown> | null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
    // Retrofit P5 — compile + governance metadata (D-CAG-RECON-2).
    contentHash: row.contentHash ?? null,
    compiledHash: row.compiledHash ?? null,
    tokenBudgetEstimate: row.tokenBudgetEstimate ?? null,
    tokenBudgetActual: row.tokenBudgetActual ?? null,
    compileResult: (row.compileResult ?? null) as CagCapabilityPack["compileResult"],
    compileWarnings: (row.compileWarnings ?? []) as string[],
    governanceVerdict: (row.governanceVerdict ?? null) as CagCapabilityPack["governanceVerdict"],
    governanceBlockers: (row.governanceBlockers ?? []) as string[],
    useCount: row.useCount ?? 0,
  };
}

/**
 * Create a new pack OR return the existing latest pack if its
 * `sourceHashesJson` matches the new manifest exactly. Idempotent.
 *
 * The `pack_version` column is the unique key alongside `agent_draft_id`;
 * a new version is computed as `latest.packVersion + 1`. The first pack
 * for a draft starts at version 1.
 */
export async function createPack(input: CreatePackInput): Promise<CreatePackResult> {
  const db = getAsDbForWorkspace(input.workspaceId);
  if (!db) throw new Error("ASDB unavailable");

  const newHashMap = manifestToHashMap(input.sourceManifest);

  const latest = await getLatestPack(input.agentDraftId);
  if (latest && latest.status === "fresh" && hashMapsEqual(latest.sourceHashesJson, newHashMap)) {
    return { pack: latest, reused: true };
  }

  const nextVersion = (latest?.packVersion ?? 0) + 1;

  // Retrofit P5 (D-CAG-RECON-3/4): compute contentHash if the caller
  // didn't pre-compute it; compiledHash is caller-supplied (renderer
  // produces it). tokenBudgetEstimate defaults to tokenEstimate to
  // preserve back-compat semantics for callers that haven't migrated.
  const contentHash =
    input.contentHash ??
    createHash("sha256")
      .update(JSON.stringify(input.contentJson))
      .digest("hex");

  const inserted = await db
    .insert(agsCagCapabilityPacks)
    .values({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      agentDraftId: input.agentDraftId,
      catalogEntryId: input.catalogEntryId ?? null,
      packType: input.packType ?? "capability_v1",
      packVersion: nextVersion,
      status: "fresh",
      contentJson: input.contentJson,
      compressedPrompt: input.compressedPrompt ?? null,
      tokenEstimate: input.tokenEstimate ?? null,
      sourceManifestJson: { entries: input.sourceManifest } as Record<string, unknown>,
      sourceHashesJson: newHashMap,
      injectionPolicyJson: input.injectionPolicy ?? null,
      riskSummaryJson: input.riskSummary ?? null,
      contentHash,
      compiledHash: input.compiledHash ?? null,
      tokenBudgetEstimate:
        input.tokenBudgetEstimate ?? input.tokenEstimate ?? null,
      tokenBudgetActual: null,
      compileResult: input.compileResult ?? "ok",
      compileWarnings: input.compileWarnings ?? [],
      governanceVerdict: input.governanceVerdict ?? "cleared",
      governanceBlockers: input.governanceBlockers ?? [],
      useCount: 0,
      createdBy: input.createdBy,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();

  const pack = rowToPack(inserted[0]);

  await appendPackEvent({
    workspaceId: pack.workspaceId,
    agentDraftId: pack.agentDraftId,
    packId: pack.id,
    eventType: "pack_created",
    eventSeverity: "info",
    newHash: aggregateManifestHash(input.sourceManifest),
    actorType: "system",
    packVersion: pack.packVersion,
    createdBy: input.createdBy,
  });

  return { pack, reused: false };
}

/**
 * Return the most recent pack (by packVersion DESC) for a draft, or null.
 */
export async function getLatestPack(agentDraftId: number): Promise<CagCapabilityPack | null> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");

  const rows = await db
    .select()
    .from(agsCagCapabilityPacks)
    .where(eq(agsCagCapabilityPacks.agentDraftId, agentDraftId))
    .orderBy(desc(agsCagCapabilityPacks.packVersion))
    .limit(1);

  return rows[0] ? rowToPack(rows[0]) : null;
}

/**
 * Return all packs for a draft, newest first. Includes archived/stale.
 */
export async function listPacks(agentDraftId: number): Promise<CagCapabilityPack[]> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");

  const rows = await db
    .select()
    .from(agsCagCapabilityPacks)
    .where(eq(agsCagCapabilityPacks.agentDraftId, agentDraftId))
    .orderBy(desc(agsCagCapabilityPacks.packVersion));

  return rows.map(rowToPack);
}

/**
 * Lookup a pack by id, scoped by workspace for isolation. Returns null
 * if the pack doesn't exist OR exists in a different workspace.
 */
export async function getPackById(
  workspaceId: number,
  packId: number,
): Promise<CagCapabilityPack | null> {
  const db = getAsDbForWorkspace(workspaceId);
  if (!db) throw new Error("ASDB unavailable");

  const rows = await db
    .select()
    .from(agsCagCapabilityPacks)
    .where(
      and(
        eq(agsCagCapabilityPacks.id, packId),
        eq(agsCagCapabilityPacks.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  return rows[0] ? rowToPack(rows[0]) : null;
}

/**
 * Mark a pack stale. Idempotent — already-stale packs are no-op
 * (no event written), already-archived packs throw `pack_archived`.
 */
export async function markPackStale(
  packId: number,
  reason: string,
  actorId: number,
): Promise<void> {
  // V1+ MR-3 eighteenth batch (PR-V1-80): "discovering-helper"
  // pattern. The SELECT-by-id legitimately uses getAsDb() because
  // workspaceId isn't known yet (intentional Category C bootstrap
  // lookup). After the row is loaded, the workspace-routed handle
  // takes over for the UPDATE — preserves the Phase-2 invariant
  // that mutations route by region without requiring callers to
  // plumb workspaceId.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new Error("ASDB unavailable");

  const rows = await lookupDb
    .select()
    .from(agsCagCapabilityPacks)
    .where(eq(agsCagCapabilityPacks.id, packId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error(`Pack ${packId} not found`);
  if (row.status === "archived") throw new Error("pack_archived");
  if (row.status === "stale") return;

  const db = getAsDbForWorkspace(row.workspaceId);
  if (!db) throw new Error("ASDB unavailable");

  await db
    .update(agsCagCapabilityPacks)
    .set({
      status: "stale",
      updatedAt: new Date(),
    })
    .where(eq(agsCagCapabilityPacks.id, packId));

  await appendPackEvent({
    workspaceId: row.workspaceId,
    agentDraftId: row.agentDraftId,
    packId,
    eventType: "pack_marked_stale",
    eventSeverity: "warn",
    reason,
    actorType: "system",
    packVersion: row.packVersion,
    createdBy: actorId,
  });
}

/**
 * List packs in a workspace + agent. Used by `agentStudio.cag.listPacks`
 * preview API in P1D. Workspace-scoped — never returns cross-workspace data.
 */
export async function listPacksForAgent(
  workspaceId: number,
  agentId: number,
): Promise<CagCapabilityPack[]> {
  const db = getAsDbForWorkspace(workspaceId);
  if (!db) throw new Error("ASDB unavailable");

  const rows = await db
    .select()
    .from(agsCagCapabilityPacks)
    .where(
      and(
        eq(agsCagCapabilityPacks.workspaceId, workspaceId),
        eq(agsCagCapabilityPacks.agentId, agentId),
      ),
    )
    .orderBy(desc(agsCagCapabilityPacks.packVersion));

  return rows.map(rowToPack);
}

/**
 * Retrofit P5 (D-CAG-RECON-2 useCount + lastUsedAt): mark a pack as
 * loaded by the runtime. Atomic increment on `useCount`; sets
 * `lastUsedAt = now`. Idempotent at the row level (each call always
 * advances the counter; idempotency is at the per-message-trace level
 * via the runtime trace's `cagPackId`).
 *
 * Returns the updated useCount; callers that emit `pack_loaded` events
 * forward this through the event payload so reviewers can see how
 * heavily a pack is exercised.
 */
export async function markPackUsed(packId: number): Promise<number> {
  // V1+ MR-3 nineteenth batch (PR-V1-87): split-handle pattern for
  // an UPDATE-only mutation that takes only packId. We first SELECT
  // the row's workspaceId (Cat C bootstrap lookup; workspaceId is
  // not in scope without a read), then route the UPDATE via
  // getAsDbForWorkspace(workspaceId). In single-region Phase-1 both
  // handles delegate to the same getAsDb() — bit-for-bit identical;
  // in Phase-2 the UPDATE routes to the workspace-region pool.
  // Extra cost: one round-trip SELECT per call. Acceptable for the
  // load-bearing observability path where multi-region correctness
  // matters more than nanosecond latency.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new Error("ASDB unavailable");
  const lookup = await lookupDb
    .select({ workspaceId: agsCagCapabilityPacks.workspaceId })
    .from(agsCagCapabilityPacks)
    .where(eq(agsCagCapabilityPacks.id, packId))
    .limit(1);
  if (lookup.length === 0) return 0;
  const db = getAsDbForWorkspace(lookup[0].workspaceId);
  if (!db) throw new Error("ASDB unavailable");
  const [row] = await db
    .update(agsCagCapabilityPacks)
    .set({
      useCount: sql`${agsCagCapabilityPacks.useCount} + 1`,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agsCagCapabilityPacks.id, packId))
    .returning({ useCount: agsCagCapabilityPacks.useCount });
  return row?.useCount ?? 0;
}

/**
 * Retrofit P5 (D-CAG-RECON-2): record the runtime-observed token
 * budget AFTER the model accepts the prompt. Separate from the
 * compile-time estimate so reviewers can see how accurate the
 * renderer's projection was.
 */
export async function recordPackTokenActual(
  packId: number,
  tokensActual: number,
): Promise<void> {
  // V1+ MR-3 nineteenth batch (PR-V1-87): split-handle pattern
  // (same shape as markPackUsed above).
  const lookupDb = getAsDb();
  if (!lookupDb) throw new Error("ASDB unavailable");
  const lookup = await lookupDb
    .select({ workspaceId: agsCagCapabilityPacks.workspaceId })
    .from(agsCagCapabilityPacks)
    .where(eq(agsCagCapabilityPacks.id, packId))
    .limit(1);
  if (lookup.length === 0) return;
  const db = getAsDbForWorkspace(lookup[0].workspaceId);
  if (!db) throw new Error("ASDB unavailable");
  await db
    .update(agsCagCapabilityPacks)
    .set({
      tokenBudgetActual: tokensActual,
      updatedAt: new Date(),
    })
    .where(eq(agsCagCapabilityPacks.id, packId));
}
