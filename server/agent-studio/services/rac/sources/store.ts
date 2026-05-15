/**
 * RAC Source Registry — DB CRUD (Phase 2).
 *
 * Pure I/O against ASDB. No business logic, no embedding dispatch, no
 * cross-module reads. Boundaries (will be enforced by P5+ symmetric
 * lint to `check-cag-boundary.ts`):
 *   - May import: drizzle tables, getAsDb, this package's types.
 *   - May NOT import: mcp/dispatcher, credential-resolver, secrets,
 *     documents/ / vectordb/ / embeddings/ — those belong to the
 *     P3 ingestion adapters and the P4 retrieval pipeline.
 *
 * D-EMB-5 fail-closed: `createSource` throws
 * `EmbeddingDefaultRequiredError` when the row has NULL embedding
 * refs AND the workspace has no default set. Silent vendor fallback
 * is forbidden.
 */

import { and, desc, eq } from "drizzle-orm";
import { getAsDb, getAsDbForWorkspace } from "../../../db/connection";
import {
  agsRacProfiles,
  agsRacSources,
  agsRacPolicies,
  agsRacWorkspaceEmbeddingDefault,
} from "../../../../../drizzle/tables/agent-studio";
import {
  EmbeddingDefaultRequiredError,
  type CreateProfileInput,
  type CreateSourceInput,
  type RacOwnerModule,
  type RacPolicy,
  type RacProfile,
  type RacSource,
  type RacSourceType,
  type RacWorkspaceEmbeddingDefault,
  type UpdateProfileInput,
  type UpdateSourceInput,
  type UpsertPolicyInput,
  type UpsertWorkspaceEmbeddingDefaultInput,
} from "./types";

// ── Row → domain mappers ───────────────────────────────────────────

function rowToProfile(row: typeof agsRacProfiles.$inferSelect): RacProfile {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    agentDraftId: row.agentDraftId,
    profileKey: row.profileKey,
    enabled: row.enabled,
    timeoutMs: row.timeoutMs,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToSource(row: typeof agsRacSources.$inferSelect): RacSource {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    profileId: row.profileId,
    sourceType: row.sourceType as RacSourceType,
    ownerModule: row.ownerModule as RacOwnerModule,
    externalRefId: row.externalRefId,
    displayName: row.displayName,
    enabled: row.enabled,
    priority: row.priority,
    embeddingProviderConnectionId: row.embeddingProviderConnectionId,
    embeddingModelRef: row.embeddingModelRef,
    embeddingModelDim: row.embeddingModelDim,
    embeddingModelVersion: row.embeddingModelVersion,
    embeddingModelPinnedAt: row.embeddingModelPinnedAt,
    chunkSizeOverride: row.chunkSizeOverride,
    chunkOverlapOverride: row.chunkOverlapOverride,
    metadataJson: row.metadataJson ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToPolicy(row: typeof agsRacPolicies.$inferSelect): RacPolicy {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    profileId: row.profileId,
    minScore: row.minScore,
    maxChunks: row.maxChunks,
    dedupeBy: row.dedupeBy,
    freshnessMaxAgeDays: row.freshnessMaxAgeDays,
    citationRequired: row.citationRequired,
    sourcePermissionFilter: row.sourcePermissionFilter,
    piiPolicy: row.piiPolicy as RacPolicy["piiPolicy"],
    licensePolicy: row.licensePolicy as RacPolicy["licensePolicy"],
    licenseBlocklist: Array.isArray(row.licenseBlocklist)
      ? (row.licenseBlocklist as string[]).filter((v): v is string => typeof v === "string")
      : null,
    timeoutMs: row.timeoutMs,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToWorkspaceDefault(
  row: typeof agsRacWorkspaceEmbeddingDefault.$inferSelect,
): RacWorkspaceEmbeddingDefault {
  return {
    workspaceId: row.workspaceId,
    embeddingProviderConnectionId: row.embeddingProviderConnectionId,
    embeddingModelRef: row.embeddingModelRef,
    embeddingModelDim: row.embeddingModelDim,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Profile CRUD ───────────────────────────────────────────────────

export async function createProfile(input: CreateProfileInput): Promise<RacProfile> {
  const db = getAsDbForWorkspace(input.workspaceId);
  if (!db) throw new Error("ASDB unavailable");
  const [row] = await db
    .insert(agsRacProfiles)
    .values({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      agentDraftId: input.agentDraftId,
      profileKey: input.profileKey ?? "default",
      enabled: input.enabled ?? true,
      timeoutMs: input.timeoutMs ?? null,
      notes: input.notes ?? null,
      createdBy: input.createdBy,
    })
    .returning();
  return rowToProfile(row);
}

export async function getProfile(profileId: number): Promise<RacProfile | null> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  const rows = await db
    .select()
    .from(agsRacProfiles)
    .where(eq(agsRacProfiles.id, profileId))
    .limit(1);
  return rows[0] ? rowToProfile(rows[0]) : null;
}

export async function listProfilesForDraft(
  agentDraftId: number,
): Promise<RacProfile[]> {
  // V1+ MR-3 sixty-fifth batch (PR-V1-135): Path B read consumer.
  // agsRacProfiles.workspaceId is non-null (workspace-scoped); route
  // the SELECT to the home region under Phase-2 via Path B.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new Error("ASDB unavailable");
  const { resolveWorkspaceIdForDraft } = await import(
    "../../region/draft-workspace-resolver"
  );
  const workspaceId = await resolveWorkspaceIdForDraft(lookupDb, agentDraftId);
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const rows = await db
    .select()
    .from(agsRacProfiles)
    .where(eq(agsRacProfiles.agentDraftId, agentDraftId))
    .orderBy(agsRacProfiles.profileKey);
  return rows.map(rowToProfile);
}

export async function updateProfile(input: UpdateProfileInput): Promise<RacProfile> {
  // V1+ MR-3 twentieth batch (PR-V1-88): split-handle pattern.
  // SELECT-by-id (Cat C bootstrap) discovers the workspaceId,
  // then the UPDATE routes via getAsDbForWorkspace. Phase-1 shim
  // still delegates to getAsDb() so single-region behavior is
  // preserved bit-for-bit; Phase-2 routes by region.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new Error("ASDB unavailable");
  const lookup = await lookupDb
    .select({ workspaceId: agsRacProfiles.workspaceId })
    .from(agsRacProfiles)
    .where(eq(agsRacProfiles.id, input.profileId))
    .limit(1);
  if (lookup.length === 0) {
    throw new Error(`profile ${input.profileId} not found`);
  }
  const db = getAsDbForWorkspace(lookup[0].workspaceId);
  if (!db) throw new Error("ASDB unavailable");
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.timeoutMs !== undefined) patch.timeoutMs = input.timeoutMs;
  if (input.notes !== undefined) patch.notes = input.notes;
  const [row] = await db
    .update(agsRacProfiles)
    .set(patch)
    .where(eq(agsRacProfiles.id, input.profileId))
    .returning();
  if (!row) throw new Error(`profile ${input.profileId} not found`);
  return rowToProfile(row);
}

// ── Source CRUD ────────────────────────────────────────────────────

/**
 * Create a source. Enforces D-EMB-5: when the source row supplies no
 * embedding refs, the workspace MUST have a default registered.
 */
export async function createSource(input: CreateSourceInput): Promise<RacSource> {
  const db = getAsDbForWorkspace(input.workspaceId);
  if (!db) throw new Error("ASDB unavailable");

  const hasOwnEmbedding =
    input.embeddingProviderConnectionId != null &&
    input.embeddingModelRef != null &&
    input.embeddingModelDim != null;

  if (!hasOwnEmbedding) {
    const fallback = await getWorkspaceEmbeddingDefault(input.workspaceId);
    if (!fallback) throw new EmbeddingDefaultRequiredError(input.workspaceId);
  }

  const [row] = await db
    .insert(agsRacSources)
    .values({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      sourceType: input.sourceType,
      ownerModule: input.ownerModule,
      externalRefId: input.externalRefId ?? null,
      displayName: input.displayName ?? null,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 50,
      embeddingProviderConnectionId: input.embeddingProviderConnectionId ?? null,
      embeddingModelRef: input.embeddingModelRef ?? null,
      embeddingModelDim: input.embeddingModelDim ?? null,
      embeddingModelVersion: input.embeddingModelVersion ?? null,
      embeddingModelPinnedAt: hasOwnEmbedding ? new Date() : null,
      chunkSizeOverride: input.chunkSizeOverride ?? null,
      chunkOverlapOverride: input.chunkOverlapOverride ?? null,
      metadataJson: input.metadataJson ?? null,
      createdBy: input.createdBy,
    })
    .returning();
  return rowToSource(row);
}

export async function getSource(sourceId: number): Promise<RacSource | null> {
  // V1+ MR-3 sixty-sixth batch (PR-V1-136): Path-A discovering-
  // helper read. SELECT-by-id with a pre-projection of workspaceId
  // routes the subsequent full-row SELECT to the home region under
  // Phase-2. Soft-fall-through when the row doesn't exist.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new Error("ASDB unavailable");
  const wsRows = await lookupDb
    .select({ workspaceId: agsRacSources.workspaceId })
    .from(agsRacSources)
    .where(eq(agsRacSources.id, sourceId))
    .limit(1);
  if (wsRows.length === 0) return null;
  const db = getAsDbForWorkspace(wsRows[0].workspaceId) ?? lookupDb;
  const rows = await db
    .select()
    .from(agsRacSources)
    .where(eq(agsRacSources.id, sourceId))
    .limit(1);
  return rows[0] ? rowToSource(rows[0]) : null;
}

export async function listSourcesForProfile(
  profileId: number,
): Promise<RacSource[]> {
  // V1+ MR-3 sixty-sixth batch (PR-V1-136): Path-A discovering-
  // helper read. agsRacProfiles.workspaceId is non-null; pull it
  // from the parent profile row, then route the SELECT on
  // agsRacSources to the home region under Phase-2.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new Error("ASDB unavailable");
  const wsRows = await lookupDb
    .select({ workspaceId: agsRacProfiles.workspaceId })
    .from(agsRacProfiles)
    .where(eq(agsRacProfiles.id, profileId))
    .limit(1);
  const db =
    wsRows.length > 0
      ? (getAsDbForWorkspace(wsRows[0].workspaceId) ?? lookupDb)
      : lookupDb;
  const rows = await db
    .select()
    .from(agsRacSources)
    .where(eq(agsRacSources.profileId, profileId))
    .orderBy(desc(agsRacSources.priority), agsRacSources.id);
  return rows.map(rowToSource);
}

export async function listSourcesForWorkspace(
  workspaceId: number,
  sourceType?: RacSourceType,
): Promise<RacSource[]> {
  const db = getAsDbForWorkspace(workspaceId);
  if (!db) throw new Error("ASDB unavailable");
  const where = sourceType
    ? and(
        eq(agsRacSources.workspaceId, workspaceId),
        eq(agsRacSources.sourceType, sourceType),
      )
    : eq(agsRacSources.workspaceId, workspaceId);
  const rows = await db
    .select()
    .from(agsRacSources)
    .where(where)
    .orderBy(desc(agsRacSources.priority), agsRacSources.id);
  return rows.map(rowToSource);
}

export async function updateSource(input: UpdateSourceInput): Promise<RacSource> {
  // V1+ MR-3 twentieth batch (PR-V1-88): split-handle pattern.
  // See updateProfile for the same pattern.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new Error("ASDB unavailable");
  const lookup = await lookupDb
    .select({ workspaceId: agsRacSources.workspaceId })
    .from(agsRacSources)
    .where(eq(agsRacSources.id, input.sourceId))
    .limit(1);
  if (lookup.length === 0) {
    throw new Error(`source ${input.sourceId} not found`);
  }
  const db = getAsDbForWorkspace(lookup[0].workspaceId);
  if (!db) throw new Error("ASDB unavailable");
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.embeddingProviderConnectionId !== undefined) {
    patch.embeddingProviderConnectionId = input.embeddingProviderConnectionId;
    patch.embeddingModelPinnedAt = new Date();
  }
  if (input.embeddingModelRef !== undefined) {
    patch.embeddingModelRef = input.embeddingModelRef;
    patch.embeddingModelPinnedAt = new Date();
  }
  if (input.embeddingModelDim !== undefined) {
    patch.embeddingModelDim = input.embeddingModelDim;
  }
  if (input.embeddingModelVersion !== undefined) {
    patch.embeddingModelVersion = input.embeddingModelVersion;
  }
  if (input.chunkSizeOverride !== undefined) {
    patch.chunkSizeOverride = input.chunkSizeOverride;
  }
  if (input.chunkOverlapOverride !== undefined) {
    patch.chunkOverlapOverride = input.chunkOverlapOverride;
  }
  if (input.metadataJson !== undefined) patch.metadataJson = input.metadataJson;

  const [row] = await db
    .update(agsRacSources)
    .set(patch)
    .where(eq(agsRacSources.id, input.sourceId))
    .returning();
  if (!row) throw new Error(`source ${input.sourceId} not found`);
  return rowToSource(row);
}

export async function deleteSource(sourceId: number): Promise<void> {
  // V1+ MR-3 twentieth batch (PR-V1-88): split-handle pattern for
  // a DELETE-only mutation. See updateProfile for the same shape.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new Error("ASDB unavailable");
  const lookup = await lookupDb
    .select({ workspaceId: agsRacSources.workspaceId })
    .from(agsRacSources)
    .where(eq(agsRacSources.id, sourceId))
    .limit(1);
  if (lookup.length === 0) return;
  const db = getAsDbForWorkspace(lookup[0].workspaceId);
  if (!db) throw new Error("ASDB unavailable");
  await db.delete(agsRacSources).where(eq(agsRacSources.id, sourceId));
}

// ── Policy upsert/read ────────────────────────────────────────────

export async function getPolicyForProfile(
  profileId: number,
): Promise<RacPolicy | null> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  const rows = await db
    .select()
    .from(agsRacPolicies)
    .where(eq(agsRacPolicies.profileId, profileId))
    .limit(1);
  return rows[0] ? rowToPolicy(rows[0]) : null;
}

export async function upsertPolicy(input: UpsertPolicyInput): Promise<RacPolicy> {
  const db = getAsDbForWorkspace(input.workspaceId);
  if (!db) throw new Error("ASDB unavailable");

  const existing = await getPolicyForProfile(input.profileId);
  if (existing) {
    const [row] = await db
      .update(agsRacPolicies)
      .set({
        minScore: input.minScore ?? null,
        maxChunks: input.maxChunks ?? null,
        dedupeBy: input.dedupeBy ?? null,
        freshnessMaxAgeDays: input.freshnessMaxAgeDays ?? null,
        citationRequired: input.citationRequired ?? null,
        sourcePermissionFilter: input.sourcePermissionFilter ?? null,
        piiPolicy: input.piiPolicy ?? null,
        licensePolicy: input.licensePolicy ?? null,
        licenseBlocklist: input.licenseBlocklist ?? null,
        timeoutMs: input.timeoutMs ?? null,
        updatedAt: new Date(),
      })
      .where(eq(agsRacPolicies.profileId, input.profileId))
      .returning();
    return rowToPolicy(row);
  }

  const [row] = await db
    .insert(agsRacPolicies)
    .values({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      minScore: input.minScore ?? null,
      maxChunks: input.maxChunks ?? null,
      dedupeBy: input.dedupeBy ?? null,
      freshnessMaxAgeDays: input.freshnessMaxAgeDays ?? null,
      citationRequired: input.citationRequired ?? null,
      sourcePermissionFilter: input.sourcePermissionFilter ?? null,
      piiPolicy: input.piiPolicy ?? null,
      licensePolicy: input.licensePolicy ?? null,
      licenseBlocklist: input.licenseBlocklist ?? null,
      timeoutMs: input.timeoutMs ?? null,
      createdBy: input.createdBy,
    })
    .returning();
  return rowToPolicy(row);
}

// ── Workspace embedding default upsert/read (D-EMB-4) ────────────

export async function getWorkspaceEmbeddingDefault(
  workspaceId: number,
): Promise<RacWorkspaceEmbeddingDefault | null> {
  const db = getAsDbForWorkspace(workspaceId);
  if (!db) throw new Error("ASDB unavailable");
  const rows = await db
    .select()
    .from(agsRacWorkspaceEmbeddingDefault)
    .where(eq(agsRacWorkspaceEmbeddingDefault.workspaceId, workspaceId))
    .limit(1);
  return rows[0] ? rowToWorkspaceDefault(rows[0]) : null;
}

export async function upsertWorkspaceEmbeddingDefault(
  input: UpsertWorkspaceEmbeddingDefaultInput,
): Promise<RacWorkspaceEmbeddingDefault> {
  const db = getAsDbForWorkspace(input.workspaceId);
  if (!db) throw new Error("ASDB unavailable");

  const existing = await getWorkspaceEmbeddingDefault(input.workspaceId);
  if (existing) {
    const [row] = await db
      .update(agsRacWorkspaceEmbeddingDefault)
      .set({
        embeddingProviderConnectionId: input.embeddingProviderConnectionId,
        embeddingModelRef: input.embeddingModelRef,
        embeddingModelDim: input.embeddingModelDim,
        updatedAt: new Date(),
      })
      .where(eq(agsRacWorkspaceEmbeddingDefault.workspaceId, input.workspaceId))
      .returning();
    return rowToWorkspaceDefault(row);
  }
  const [row] = await db
    .insert(agsRacWorkspaceEmbeddingDefault)
    .values({
      workspaceId: input.workspaceId,
      embeddingProviderConnectionId: input.embeddingProviderConnectionId,
      embeddingModelRef: input.embeddingModelRef,
      embeddingModelDim: input.embeddingModelDim,
      createdBy: input.createdBy,
    })
    .returning();
  return rowToWorkspaceDefault(row);
}
