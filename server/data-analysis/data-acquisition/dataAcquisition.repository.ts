/**
 * Data Acquisition repository.
 *
 * Thin Drizzle wrappers — no business logic. Service layer owns the
 * pipeline orchestration. All access goes through the canonical
 * `getDataAnalysisDb()` accessor (Phase-1 staged ownership).
 */

import { and, desc, eq, sql } from "drizzle-orm";

import { getDataAnalysisDb as getDb } from "../connection";
import {
  dataAcquisitionApiRecords,
  dataAcquisitionAuditEvents,
  dataAcquisitionBatches,
  dataAcquisitionCanonicalRecords,
  dataAcquisitionClassifications,
  dataAcquisitionDbRecords,
  dataAcquisitionDocuments,
  dataAcquisitionFormSubmissions,
  dataAcquisitionGitObjects,
  dataAcquisitionItems,
  dataAcquisitionMediaAssets,
  dataAcquisitionOutputRuns,
  dataAcquisitionProcessingRuns,
  dataAcquisitionQualityResults,
  dataAcquisitionRoutes,
  dataAcquisitionRuns,
  dataAcquisitionSensorReadings,
  dataAcquisitionSources,
  dataAcquisitionStreamEvents,
  dataAcquisitionWebPages,
  dataAcquisitionWebhookEvents,
  type InsertDataAcquisitionApiRecord,
  type InsertDataAcquisitionAuditEvent,
  type InsertDataAcquisitionBatch,
  type InsertDataAcquisitionCanonicalRecord,
  type InsertDataAcquisitionClassification,
  type InsertDataAcquisitionDbRecord,
  type InsertDataAcquisitionDocument,
  type InsertDataAcquisitionFormSubmission,
  type InsertDataAcquisitionGitObject,
  type InsertDataAcquisitionItem,
  type InsertDataAcquisitionMediaAsset,
  type InsertDataAcquisitionOutputRun,
  type InsertDataAcquisitionProcessingRun,
  type InsertDataAcquisitionQualityResult,
  type InsertDataAcquisitionRoute,
  type InsertDataAcquisitionRun,
  type InsertDataAcquisitionSensorReading,
  type InsertDataAcquisitionSource,
  type InsertDataAcquisitionStreamEvent,
  type InsertDataAcquisitionWebPage,
  type InsertDataAcquisitionWebhookEvent,
} from "../../../drizzle/schema";

function db() {
  const conn = getDb();
  if (!conn) throw new Error("Data Acquisition DB unavailable");
  return conn;
}

/* ── Sources ─────────────────────────────────────────────────────── */

export async function insertSource(values: InsertDataAcquisitionSource) {
  const [row] = await db().insert(dataAcquisitionSources).values(values).returning();
  return row;
}

export async function listSources(workspaceId?: number) {
  const q = db().select().from(dataAcquisitionSources);
  return workspaceId === undefined
    ? q.orderBy(desc(dataAcquisitionSources.createdAt))
    : q
        .where(eq(dataAcquisitionSources.workspaceId, workspaceId))
        .orderBy(desc(dataAcquisitionSources.createdAt));
}

export async function getSource(id: number) {
  const rows = await db()
    .select()
    .from(dataAcquisitionSources)
    .where(eq(dataAcquisitionSources.id, id))
    .limit(1);
  return rows[0];
}

export async function updateSourceRow(
  id: number,
  patch: Partial<InsertDataAcquisitionSource>,
) {
  const [row] = await db()
    .update(dataAcquisitionSources)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(dataAcquisitionSources.id, id))
    .returning();
  return row;
}

export async function disableSourceRow(id: number) {
  return updateSourceRow(id, { status: "disabled" });
}

/* ── Runs ────────────────────────────────────────────────────────── */

export async function insertRun(values: InsertDataAcquisitionRun) {
  const [row] = await db().insert(dataAcquisitionRuns).values(values).returning();
  return row;
}

export async function listRuns(workspaceId?: number, sourceId?: number) {
  const q = db().select().from(dataAcquisitionRuns);
  if (workspaceId !== undefined && sourceId !== undefined) {
    return q
      .where(
        and(
          eq(dataAcquisitionRuns.workspaceId, workspaceId),
          eq(dataAcquisitionRuns.sourceId, sourceId),
        ),
      )
      .orderBy(desc(dataAcquisitionRuns.id));
  }
  if (workspaceId !== undefined) {
    return q
      .where(eq(dataAcquisitionRuns.workspaceId, workspaceId))
      .orderBy(desc(dataAcquisitionRuns.id));
  }
  if (sourceId !== undefined) {
    return q
      .where(eq(dataAcquisitionRuns.sourceId, sourceId))
      .orderBy(desc(dataAcquisitionRuns.id));
  }
  return q.orderBy(desc(dataAcquisitionRuns.id));
}

export async function getRun(id: number) {
  const rows = await db()
    .select()
    .from(dataAcquisitionRuns)
    .where(eq(dataAcquisitionRuns.id, id))
    .limit(1);
  return rows[0];
}

export async function updateRunStatus(
  id: number,
  patch: Partial<InsertDataAcquisitionRun>,
) {
  const [row] = await db()
    .update(dataAcquisitionRuns)
    .set(patch)
    .where(eq(dataAcquisitionRuns.id, id))
    .returning();
  return row;
}

/* ── Items ───────────────────────────────────────────────────────── */

export async function insertItems(values: InsertDataAcquisitionItem[]) {
  if (values.length === 0) return [];
  return db().insert(dataAcquisitionItems).values(values).returning();
}

export async function listItems(workspaceId?: number, sourceId?: number) {
  const q = db().select().from(dataAcquisitionItems);
  if (workspaceId !== undefined && sourceId !== undefined) {
    return q
      .where(
        and(
          eq(dataAcquisitionItems.workspaceId, workspaceId),
          eq(dataAcquisitionItems.sourceId, sourceId),
        ),
      )
      .orderBy(desc(dataAcquisitionItems.id));
  }
  if (workspaceId !== undefined) {
    return q
      .where(eq(dataAcquisitionItems.workspaceId, workspaceId))
      .orderBy(desc(dataAcquisitionItems.id));
  }
  return q.orderBy(desc(dataAcquisitionItems.id));
}

export async function getItem(id: number) {
  const rows = await db()
    .select()
    .from(dataAcquisitionItems)
    .where(eq(dataAcquisitionItems.id, id))
    .limit(1);
  return rows[0];
}

export async function updateItemStatus(id: number, status: string) {
  await db()
    .update(dataAcquisitionItems)
    .set({ status, updatedAt: new Date() })
    .where(eq(dataAcquisitionItems.id, id));
}

/* ── Classifications ─────────────────────────────────────────────── */

export async function insertClassification(
  values: InsertDataAcquisitionClassification,
) {
  const [row] = await db()
    .insert(dataAcquisitionClassifications)
    .values(values)
    .returning();
  return row;
}

export async function listClassifications(itemId?: number) {
  const q = db().select().from(dataAcquisitionClassifications);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionClassifications.id))
    : q
        .where(eq(dataAcquisitionClassifications.itemId, itemId))
        .orderBy(desc(dataAcquisitionClassifications.id));
}

/* ── Routes ──────────────────────────────────────────────────────── */

export async function insertRoute(values: InsertDataAcquisitionRoute) {
  const [row] = await db().insert(dataAcquisitionRoutes).values(values).returning();
  return row;
}

export async function listRoutes(itemId?: number) {
  const q = db().select().from(dataAcquisitionRoutes);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionRoutes.id))
    : q
        .where(eq(dataAcquisitionRoutes.itemId, itemId))
        .orderBy(desc(dataAcquisitionRoutes.id));
}

/* ── Processing runs ─────────────────────────────────────────────── */

export async function insertProcessingRun(
  values: InsertDataAcquisitionProcessingRun,
) {
  const [row] = await db()
    .insert(dataAcquisitionProcessingRuns)
    .values(values)
    .returning();
  return row;
}

export async function updateProcessingRun(
  id: number,
  patch: Partial<InsertDataAcquisitionProcessingRun>,
) {
  const [row] = await db()
    .update(dataAcquisitionProcessingRuns)
    .set(patch)
    .where(eq(dataAcquisitionProcessingRuns.id, id))
    .returning();
  return row;
}

export async function listProcessingRuns(itemId?: number) {
  const q = db().select().from(dataAcquisitionProcessingRuns);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionProcessingRuns.id))
    : q
        .where(eq(dataAcquisitionProcessingRuns.itemId, itemId))
        .orderBy(desc(dataAcquisitionProcessingRuns.id));
}

/* ── Quality ─────────────────────────────────────────────────────── */

export async function insertQuality(values: InsertDataAcquisitionQualityResult) {
  const [row] = await db()
    .insert(dataAcquisitionQualityResults)
    .values(values)
    .returning();
  return row;
}

/* ── Canonical records ───────────────────────────────────────────── */

export async function insertCanonicalRecord(
  values: InsertDataAcquisitionCanonicalRecord,
) {
  const [row] = await db()
    .insert(dataAcquisitionCanonicalRecords)
    .values(values)
    .returning();
  return row;
}

export async function getCanonicalRecord(id: number) {
  const rows = await db()
    .select()
    .from(dataAcquisitionCanonicalRecords)
    .where(eq(dataAcquisitionCanonicalRecords.id, id))
    .limit(1);
  return rows[0];
}

export async function listCanonicalRecords(workspaceId?: number) {
  const q = db().select().from(dataAcquisitionCanonicalRecords);
  return workspaceId === undefined
    ? q.orderBy(desc(dataAcquisitionCanonicalRecords.id))
    : q
        .where(eq(dataAcquisitionCanonicalRecords.workspaceId, workspaceId))
        .orderBy(desc(dataAcquisitionCanonicalRecords.id));
}

/* ── Output runs ─────────────────────────────────────────────────── */

export async function insertOutputRun(values: InsertDataAcquisitionOutputRun) {
  const [row] = await db()
    .insert(dataAcquisitionOutputRuns)
    .values(values)
    .returning();
  return row;
}

export async function listOutputRuns(workspaceId?: number) {
  const q = db().select().from(dataAcquisitionOutputRuns);
  return workspaceId === undefined
    ? q.orderBy(desc(dataAcquisitionOutputRuns.id))
    : q
        .where(eq(dataAcquisitionOutputRuns.workspaceId, workspaceId))
        .orderBy(desc(dataAcquisitionOutputRuns.id));
}

/* ── Document specialization ─────────────────────────────────────── */

export async function insertDocumentSpec(values: InsertDataAcquisitionDocument) {
  const [row] = await db()
    .insert(dataAcquisitionDocuments)
    .values(values)
    .returning();
  return row;
}

export async function getDocumentSpec(itemId: number) {
  const rows = await db()
    .select()
    .from(dataAcquisitionDocuments)
    .where(eq(dataAcquisitionDocuments.itemId, itemId))
    .limit(1);
  return rows[0];
}

/* ── Batches ─────────────────────────────────────────────────────── */

export async function insertBatch(values: InsertDataAcquisitionBatch) {
  const [row] = await db().insert(dataAcquisitionBatches).values(values).returning();
  return row;
}

export async function listBatches(workspaceId?: number) {
  const q = db().select().from(dataAcquisitionBatches);
  return workspaceId === undefined
    ? q.orderBy(desc(dataAcquisitionBatches.id))
    : q
        .where(eq(dataAcquisitionBatches.workspaceId, workspaceId))
        .orderBy(desc(dataAcquisitionBatches.id));
}

/* ── Specialization tables ───────────────────────────────────────── */

export async function insertSensorReading(values: InsertDataAcquisitionSensorReading) {
  const [row] = await db()
    .insert(dataAcquisitionSensorReadings)
    .values(values)
    .returning();
  return row;
}
export async function listSensorReadings(itemId?: number) {
  const q = db().select().from(dataAcquisitionSensorReadings);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionSensorReadings.id))
    : q
        .where(eq(dataAcquisitionSensorReadings.itemId, itemId))
        .orderBy(desc(dataAcquisitionSensorReadings.id));
}

export async function insertStreamEvent(values: InsertDataAcquisitionStreamEvent) {
  const [row] = await db()
    .insert(dataAcquisitionStreamEvents)
    .values(values)
    .returning();
  return row;
}
export async function listStreamEvents(itemId?: number) {
  const q = db().select().from(dataAcquisitionStreamEvents);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionStreamEvents.id))
    : q
        .where(eq(dataAcquisitionStreamEvents.itemId, itemId))
        .orderBy(desc(dataAcquisitionStreamEvents.id));
}

export async function insertApiRecord(values: InsertDataAcquisitionApiRecord) {
  const [row] = await db()
    .insert(dataAcquisitionApiRecords)
    .values(values)
    .returning();
  return row;
}
export async function listApiRecords(itemId?: number) {
  const q = db().select().from(dataAcquisitionApiRecords);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionApiRecords.id))
    : q
        .where(eq(dataAcquisitionApiRecords.itemId, itemId))
        .orderBy(desc(dataAcquisitionApiRecords.id));
}

export async function insertDbRecord(values: InsertDataAcquisitionDbRecord) {
  const [row] = await db()
    .insert(dataAcquisitionDbRecords)
    .values(values)
    .returning();
  return row;
}
export async function listDbRecords(itemId?: number) {
  const q = db().select().from(dataAcquisitionDbRecords);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionDbRecords.id))
    : q
        .where(eq(dataAcquisitionDbRecords.itemId, itemId))
        .orderBy(desc(dataAcquisitionDbRecords.id));
}

export async function insertMediaAsset(values: InsertDataAcquisitionMediaAsset) {
  const [row] = await db()
    .insert(dataAcquisitionMediaAssets)
    .values(values)
    .returning();
  return row;
}
export async function listMediaAssets(itemId?: number) {
  const q = db().select().from(dataAcquisitionMediaAssets);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionMediaAssets.id))
    : q
        .where(eq(dataAcquisitionMediaAssets.itemId, itemId))
        .orderBy(desc(dataAcquisitionMediaAssets.id));
}

export async function insertWebPage(values: InsertDataAcquisitionWebPage) {
  const [row] = await db().insert(dataAcquisitionWebPages).values(values).returning();
  return row;
}
export async function listWebPages(itemId?: number) {
  const q = db().select().from(dataAcquisitionWebPages);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionWebPages.id))
    : q
        .where(eq(dataAcquisitionWebPages.itemId, itemId))
        .orderBy(desc(dataAcquisitionWebPages.id));
}

export async function insertGitObject(values: InsertDataAcquisitionGitObject) {
  const [row] = await db()
    .insert(dataAcquisitionGitObjects)
    .values(values)
    .returning();
  return row;
}
export async function listGitObjects(itemId?: number) {
  const q = db().select().from(dataAcquisitionGitObjects);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionGitObjects.id))
    : q
        .where(eq(dataAcquisitionGitObjects.itemId, itemId))
        .orderBy(desc(dataAcquisitionGitObjects.id));
}

export async function insertFormSubmission(values: InsertDataAcquisitionFormSubmission) {
  const [row] = await db()
    .insert(dataAcquisitionFormSubmissions)
    .values(values)
    .returning();
  return row;
}
export async function listFormSubmissions(itemId?: number) {
  const q = db().select().from(dataAcquisitionFormSubmissions);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionFormSubmissions.id))
    : q
        .where(eq(dataAcquisitionFormSubmissions.itemId, itemId))
        .orderBy(desc(dataAcquisitionFormSubmissions.id));
}

export async function insertWebhookEvent(values: InsertDataAcquisitionWebhookEvent) {
  const [row] = await db()
    .insert(dataAcquisitionWebhookEvents)
    .values(values)
    .returning();
  return row;
}
export async function listWebhookEvents(itemId?: number) {
  const q = db().select().from(dataAcquisitionWebhookEvents);
  return itemId === undefined
    ? q.orderBy(desc(dataAcquisitionWebhookEvents.id))
    : q
        .where(eq(dataAcquisitionWebhookEvents.itemId, itemId))
        .orderBy(desc(dataAcquisitionWebhookEvents.id));
}

/* ── Audit ───────────────────────────────────────────────────────── */

export async function insertAudit(values: InsertDataAcquisitionAuditEvent) {
  const [row] = await db()
    .insert(dataAcquisitionAuditEvents)
    .values(values)
    .returning();
  return row;
}

/* ── Summary aggregates ──────────────────────────────────────────── */

export async function summaryCounts() {
  const conn = db();
  const [{ count: sourceCount }] = await conn.execute(
    sql`SELECT COUNT(*)::int AS count FROM data_acquisition_sources`,
  ) as unknown as Array<{ count: number }>;
  const [{ count: activeSourceCount }] = await conn.execute(
    sql`SELECT COUNT(*)::int AS count FROM data_acquisition_sources WHERE status = 'active'`,
  ) as unknown as Array<{ count: number }>;
  const [{ count: runCount }] = await conn.execute(
    sql`SELECT COUNT(*)::int AS count FROM data_acquisition_runs`,
  ) as unknown as Array<{ count: number }>;
  const [{ count: itemCount }] = await conn.execute(
    sql`SELECT COUNT(*)::int AS count FROM data_acquisition_items`,
  ) as unknown as Array<{ count: number }>;
  const [{ count: processedCount }] = await conn.execute(
    sql`SELECT COUNT(*)::int AS count FROM data_acquisition_items WHERE status = 'processed'`,
  ) as unknown as Array<{ count: number }>;
  const [{ count: failedProcessingCount }] = await conn.execute(
    sql`SELECT COUNT(*)::int AS count FROM data_acquisition_processing_runs WHERE status = 'failed'`,
  ) as unknown as Array<{ count: number }>;
  const [{ count: canonicalCount }] = await conn.execute(
    sql`SELECT COUNT(*)::int AS count FROM data_acquisition_canonical_records`,
  ) as unknown as Array<{ count: number }>;
  const [{ avg: avgConfidence }] = await conn.execute(
    sql`SELECT COALESCE(AVG(confidence_score), 0)::int AS avg FROM data_acquisition_quality_results`,
  ) as unknown as Array<{ avg: number }>;
  const [{ count: outputCount }] = await conn.execute(
    sql`SELECT COUNT(*)::int AS count FROM data_acquisition_output_runs`,
  ) as unknown as Array<{ count: number }>;

  return {
    sourceCount,
    activeSourceCount,
    runCount,
    itemCount,
    processedCount,
    failedProcessingCount,
    canonicalCount,
    avgConfidence,
    outputCount,
  };
}
