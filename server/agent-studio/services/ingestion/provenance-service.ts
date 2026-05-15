/**
 * Provenance service — D-UI-2 mandatory context field #1.
 *
 * Persists the source connector + parser + normalizer + raw artifact
 * hash + ingestion job id triple per unit. Returns the `provenanceId`
 * the KnowledgeUnitService stores on the unit row (FK).
 *
 * Provenance rows are append-only; once written, they're never updated.
 * If a re-parse produces a unit with the same `contentHash` but a
 * different parser, that's a new provenance row (the parser changed,
 * the input didn't — both facts matter).
 */

import { eq } from "drizzle-orm";
import { getAsDb, getAsDbForWorkspace } from "../../db/connection";
import { agsProvenanceRecords } from "../../../../drizzle/tables/agent-studio";

export interface RecordProvenanceInput {
  workspaceId: number;
  sourceConnectorKey: string;
  parserKey: string;
  normalizerKey: string;
  rawArtifactHash: string;
  ingestionJobId?: number | null;
  metadata?: Record<string, unknown>;
}

export async function recordProvenance(
  input: RecordProvenanceInput,
): Promise<number> {
  // V1+ MR-3 fifth batch: workspaceId is required on
  // RecordProvenanceInput. Phase-1 shim delegates to default DB;
  // Phase-2 will route to the workspace's home region.
  const db = getAsDbForWorkspace(input.workspaceId);
  if (!db) throw new Error("ASDB unavailable");
  const [row] = await db
    .insert(agsProvenanceRecords)
    .values({
      workspaceId: input.workspaceId,
      sourceConnectorKey: input.sourceConnectorKey,
      parserKey: input.parserKey,
      normalizerKey: input.normalizerKey,
      rawArtifactHash: input.rawArtifactHash,
      ingestionJobId: input.ingestionJobId ?? null,
      metadataJson: input.metadata ?? null,
    })
    .returning({ id: agsProvenanceRecords.id });
  return row.id;
}

export async function getProvenance(
  provenanceId: number,
): Promise<typeof agsProvenanceRecords.$inferSelect | null> {
  // V1+ MR-3 sixty-ninth batch (PR-V1-139): Path-A read consumer.
  // agsProvenanceRecords.workspaceId is non-null; pre-projection
  // pulls it up, then the full-row SELECT routes via
  // getAsDbForWorkspace under Phase-2.
  const lookupDb = getAsDb();
  if (!lookupDb) return null;
  const wsRows = await lookupDb
    .select({ workspaceId: agsProvenanceRecords.workspaceId })
    .from(agsProvenanceRecords)
    .where(eq(agsProvenanceRecords.id, provenanceId))
    .limit(1);
  if (wsRows.length === 0) return null;
  const db = getAsDbForWorkspace(wsRows[0].workspaceId) ?? lookupDb;
  const rows = await db
    .select()
    .from(agsProvenanceRecords)
    .where(eq(agsProvenanceRecords.id, provenanceId))
    .limit(1);
  return rows[0] ?? null;
}
