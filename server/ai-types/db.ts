import { eq, and, desc } from "drizzle-orm";
import { isNull } from "drizzle-orm";
import { createHash } from "crypto";
import {
  catalogEntries,
  catalogEntryVersions,
  publishBundles,
  catalogAuditEvents,
  taxonomyNodes,
  taxonomyInferenceRules,
  catalogEntryClassifications,
  type CatalogEntry,
  type InsertCatalogEntry,
  type CatalogEntryVersion,
  type InsertCatalogEntryVersion,
  type PublishBundle,
  type InsertPublishBundle,
  type CatalogAuditEvent,
  type InsertCatalogAuditEvent,
  type ExecutionRun,
  type InsertExecutionRun,
  type TaxonomyNode,
  type InsertTaxonomyNode,
  type CatalogEntryClassification,
  executionRuns,
} from "../../drizzle/schema";
import { AXES_MAP, type AxisDef, type AxisNode, type EntryType } from "../../shared/catalog-taxonomy";
import { getDb } from "../db/connection";

// ============================================================================
// Catalog Entry Operations
// ============================================================================

export async function getCatalogEntries(filter?: {
  entryType?: string;
  status?: string;
  scope?: string;
  origin?: string;
  reviewState?: string;
  category?: string;
  sourceType?: string;
}): Promise<CatalogEntry[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [];
  if (filter?.entryType) conditions.push(eq(catalogEntries.entryType, filter.entryType));
  if (filter?.status) conditions.push(eq(catalogEntries.status, filter.status));
  if (filter?.scope) conditions.push(eq(catalogEntries.scope, filter.scope));
  if (filter?.origin) conditions.push(eq(catalogEntries.origin, filter.origin));
  if (filter?.reviewState) conditions.push(eq(catalogEntries.reviewState, filter.reviewState));
  if (filter?.category) conditions.push(eq(catalogEntries.category, filter.category));
  if (filter?.sourceType) conditions.push(eq(catalogEntries.sourceType, filter.sourceType));

  const query = db.select().from(catalogEntries);
  const filtered = conditions.length > 0 ? query.where(and(...conditions)) : query;
  return await filtered.orderBy(desc(catalogEntries.updatedAt));
}

export async function getCatalogEntryById(id: number): Promise<CatalogEntry | null> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const results = await db.select().from(catalogEntries).where(eq(catalogEntries.id, id));
  return results[0] ?? null;
}

export async function createCatalogEntry(data: InsertCatalogEntry): Promise<CatalogEntry> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [entry] = await db.insert(catalogEntries).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  const configHash = createHash("sha256").update(JSON.stringify(data.config ?? {})).digest("hex");
  await db.insert(catalogEntryVersions).values({
    catalogEntryId: entry.id,
    version: 1,
    config: data.config ?? {},
    configHash,
    changeNotes: "Initial creation",
    changedBy: data.createdBy,
  });

  return entry;
}

export async function updateCatalogEntry(
  id: number,
  data: Partial<Pick<InsertCatalogEntry, "name" | "displayName" | "description" | "config" | "tags" | "status" | "providerId" | "origin" | "reviewState" | "approvedBy" | "approvedAt" | "category" | "subCategory" | "capabilities">>,
  updatedBy: number
): Promise<CatalogEntry> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(catalogEntries).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(catalogEntries.id, id));

  // Create a version record for every state change (invariant I6)
  const [current] = await db.select().from(catalogEntries).where(eq(catalogEntries.id, id));
  const snapshotConfig = data.config ?? current?.config ?? {};
  const changedFields = Object.keys(data).join(", ");

  const existingVersions = await db.select()
    .from(catalogEntryVersions)
    .where(eq(catalogEntryVersions.catalogEntryId, id))
    .orderBy(desc(catalogEntryVersions.version))
    .limit(1);

  const nextVersion = (existingVersions[0]?.version ?? 0) + 1;
  const configHash = createHash("sha256").update(JSON.stringify(snapshotConfig)).digest("hex");

  await db.insert(catalogEntryVersions).values({
    catalogEntryId: id,
    version: nextVersion,
    config: snapshotConfig,
    configHash,
    changeNotes: `Updated: ${changedFields}`,
    changedBy: updatedBy,
  });

  const [updated] = await db.select().from(catalogEntries).where(eq(catalogEntries.id, id));
  return updated;
}

export async function approveCatalogEntry(id: number, approvedByUserId: number): Promise<CatalogEntry> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(catalogEntries).set({
    reviewState: "approved",
    approvedBy: approvedByUserId,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(catalogEntries.id, id));

  // Create version record for approval (invariant I6)
  const [updated] = await db.select().from(catalogEntries).where(eq(catalogEntries.id, id));
  const snapshotConfig = updated?.config ?? {};

  const existingVersions = await db.select()
    .from(catalogEntryVersions)
    .where(eq(catalogEntryVersions.catalogEntryId, id))
    .orderBy(desc(catalogEntryVersions.version))
    .limit(1);

  const nextVersion = (existingVersions[0]?.version ?? 0) + 1;
  const configHash = createHash("sha256").update(JSON.stringify(snapshotConfig)).digest("hex");

  await db.insert(catalogEntryVersions).values({
    catalogEntryId: id,
    version: nextVersion,
    config: snapshotConfig,
    configHash,
    changeNotes: "Review approved",
    changedBy: approvedByUserId,
  });

  return updated;
}

export async function deleteCatalogEntry(id: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Clean up all referencing tables before deleting the entry
  await db.delete(catalogEntryClassifications).where(eq(catalogEntryClassifications.catalogEntryId, id));
  await db.delete(executionRuns).where(eq(executionRuns.catalogEntryId, id));
  await db.delete(catalogEntryVersions).where(eq(catalogEntryVersions.catalogEntryId, id));
  await db.delete(publishBundles).where(eq(publishBundles.catalogEntryId, id));
  await db.delete(catalogEntries).where(eq(catalogEntries.id, id));
}

export async function getCatalogEntryVersions(catalogEntryId: number): Promise<CatalogEntryVersion[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return await db.select()
    .from(catalogEntryVersions)
    .where(eq(catalogEntryVersions.catalogEntryId, catalogEntryId))
    .orderBy(desc(catalogEntryVersions.version));
}

// ============================================================================
// Publish Bundle Operations
// ============================================================================

export async function getPublishBundles(filter?: {
  catalogEntryId?: number;
  status?: string;
}): Promise<PublishBundle[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [];
  if (filter?.catalogEntryId) conditions.push(eq(publishBundles.catalogEntryId, filter.catalogEntryId));
  if (filter?.status) conditions.push(eq(publishBundles.status, filter.status));

  const query = db.select().from(publishBundles);
  const filtered = conditions.length > 0 ? query.where(and(...conditions)) : query;
  return await filtered.orderBy(desc(publishBundles.publishedAt));
}

export async function createPublishBundle(data: {
  catalogEntryId: number;
  versionLabel: string;
  snapshot: any;
  snapshotHash: string;
  publishedBy: number;
  policyDecision?: string;
  policyViolations?: any;
}): Promise<PublishBundle> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(publishBundles).set({ status: "superseded" })
    .where(and(
      eq(publishBundles.catalogEntryId, data.catalogEntryId),
      eq(publishBundles.status, "active"),
    ));

  const [bundle] = await db.insert(publishBundles).values({
    catalogEntryId: data.catalogEntryId,
    versionLabel: data.versionLabel,
    snapshot: data.snapshot,
    snapshotHash: data.snapshotHash,
    status: "active",
    publishedBy: data.publishedBy,
    policyDecision: data.policyDecision ?? null,
    policyViolations: data.policyViolations ?? null,
  }).returning();

  return bundle;
}

export async function recallPublishBundle(bundleId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(publishBundles).set({ status: "recalled" })
    .where(eq(publishBundles.id, bundleId));
}

export async function getActiveBundles(): Promise<PublishBundle[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(publishBundles)
    .where(eq(publishBundles.status, "active"))
    .orderBy(desc(publishBundles.publishedAt));
}

export async function getBundleByHash(hash: string): Promise<PublishBundle | null> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [bundle] = await db.select().from(publishBundles)
    .where(eq(publishBundles.snapshotHash, hash))
    .limit(1);
  return bundle ?? null;
}

export async function getActiveBundleForEntry(catalogEntryId: number): Promise<PublishBundle | null> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [bundle] = await db.select().from(publishBundles)
    .where(and(
      eq(publishBundles.catalogEntryId, catalogEntryId),
      eq(publishBundles.status, "active"),
    ))
    .orderBy(desc(publishBundles.publishedAt))
    .limit(1);
  return bundle ?? null;
}

// ============================================================================
// Catalog Audit Events
// ============================================================================

export async function createCatalogAuditEvent(data: InsertCatalogAuditEvent): Promise<CatalogAuditEvent> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [event] = await db.insert(catalogAuditEvents).values({
    ...data,
    timestamp: new Date(),
  }).returning();
  return event;
}

export async function getCatalogAuditEvents(filter?: {
  catalogEntryId?: number;
  eventType?: string;
  limit?: number;
}): Promise<CatalogAuditEvent[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [];
  if (filter?.catalogEntryId) conditions.push(eq(catalogAuditEvents.catalogEntryId, filter.catalogEntryId));
  if (filter?.eventType) conditions.push(eq(catalogAuditEvents.eventType, filter.eventType));

  const query = db.select().from(catalogAuditEvents);
  const filtered = conditions.length > 0 ? query.where(and(...conditions)) : query;
  const ordered = filtered.orderBy(desc(catalogAuditEvents.timestamp));
  return filter?.limit ? await ordered.limit(filter.limit) : await ordered;
}

export async function createExecutionRun(data: InsertExecutionRun): Promise<ExecutionRun> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db.insert(executionRuns).values({
    ...data,
    startedAt: data.startedAt ?? new Date(),
  }).returning();

  return run;
}

export async function updateExecutionRun(
  id: number,
  data: Partial<Omit<InsertExecutionRun, "catalogEntryId">>
): Promise<ExecutionRun> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db
    .update(executionRuns)
    .set(data)
    .where(eq(executionRuns.id, id))
    .returning();

  return run;
}

export async function getExecutionRunById(id: number): Promise<ExecutionRun | null> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db.select().from(executionRuns).where(eq(executionRuns.id, id)).limit(1);
  return run ?? null;
}

export async function listExecutionRuns(filter: {
  catalogEntryId: number;
  conversationId?: number;
  limit?: number;
}): Promise<ExecutionRun[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(executionRuns.catalogEntryId, filter.catalogEntryId)];
  if (filter.conversationId) {
    conditions.push(eq(executionRuns.conversationId, filter.conversationId));
  }

  return await db
    .select()
    .from(executionRuns)
    .where(and(...conditions))
    .orderBy(desc(executionRuns.startedAt))
    .limit(filter.limit ?? 20);
}

// ============================================================================
// Taxonomy Operations
// ============================================================================

export async function getTaxonomyNodes(filter?: {
  entryType?: string;
  level?: string;
}): Promise<TaxonomyNode[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [];
  if (filter?.entryType) conditions.push(eq(taxonomyNodes.entryType, filter.entryType));
  if (filter?.level) conditions.push(eq(taxonomyNodes.level, filter.level));

  const query = db.select().from(taxonomyNodes);
  const filtered = conditions.length > 0 ? query.where(and(...conditions)) : query;
  return await filtered.orderBy(taxonomyNodes.sortOrder);
}

export async function getTaxonomyTree(entryType: string): Promise<TaxonomyNode[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(taxonomyNodes)
    .where(eq(taxonomyNodes.entryType, entryType))
    .orderBy(taxonomyNodes.sortOrder);
}

export async function getTaxonomyChildren(parentId: number): Promise<TaxonomyNode[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(taxonomyNodes)
    .where(eq(taxonomyNodes.parentId, parentId))
    .orderBy(taxonomyNodes.sortOrder);
}

export async function getEntryClassifications(catalogEntryId: number): Promise<TaxonomyNode[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select({ node: taxonomyNodes })
    .from(catalogEntryClassifications)
    .innerJoin(taxonomyNodes, eq(catalogEntryClassifications.taxonomyNodeId, taxonomyNodes.id))
    .where(eq(catalogEntryClassifications.catalogEntryId, catalogEntryId))
    .orderBy(taxonomyNodes.sortOrder);

  return rows.map(r => r.node);
}

export async function setEntryClassifications(catalogEntryId: number, nodeIds: number[]): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(catalogEntryClassifications)
    .where(eq(catalogEntryClassifications.catalogEntryId, catalogEntryId));

  if (nodeIds.length > 0) {
    await db.insert(catalogEntryClassifications).values(
      nodeIds.map(nodeId => ({ catalogEntryId, taxonomyNodeId: nodeId }))
    );
  }
}

export async function seedTaxonomy(): Promise<{ created: number; skipped: number }> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  let created = 0;
  let skipped = 0;

  for (const [entryType, axes] of Object.entries(AXES_MAP)) {
    for (let axisIdx = 0; axisIdx < axes.length; axisIdx++) {
      const axis = axes[axisIdx];

      const axisNode = await upsertTaxonomyNode({
        parentId: null,
        entryType,
        level: "axis",
        key: axis.key,
        label: axis.label,
        description: axis.description ?? null,
        sortOrder: axisIdx,
      });
      if (axisNode.wasCreated) created++; else skipped++;

      for (let childIdx = 0; childIdx < axis.children.length; childIdx++) {
        const child = axis.children[childIdx];

        if (child.children && child.children.length > 0) {
          const subNode = await upsertTaxonomyNode({
            parentId: axisNode.id,
            entryType,
            level: "subcategory",
            key: child.key,
            label: child.label,
            description: child.description ?? null,
            sortOrder: childIdx,
          });
          if (subNode.wasCreated) created++; else skipped++;

          for (let classIdx = 0; classIdx < child.children.length; classIdx++) {
            const cls = child.children[classIdx];
            const classNode = await upsertTaxonomyNode({
              parentId: subNode.id,
              entryType,
              level: "class",
              key: cls.key,
              label: cls.label,
              description: cls.description ?? null,
              sortOrder: classIdx,
            });
            if (classNode.wasCreated) created++; else skipped++;
          }
        } else {
          const classNode = await upsertTaxonomyNode({
            parentId: axisNode.id,
            entryType,
            level: "class",
            key: child.key,
            label: child.label,
            description: child.description ?? null,
            sortOrder: childIdx,
          });
          if (classNode.wasCreated) created++; else skipped++;
        }
      }
    }
  }

  return { created, skipped };
}

async function upsertTaxonomyNode(data: {
  parentId: number | null;
  entryType: string;
  level: string;
  key: string;
  label: string;
  description: string | null;
  sortOrder: number;
}): Promise<{ id: number; wasCreated: boolean }> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [
    eq(taxonomyNodes.entryType, data.entryType),
    eq(taxonomyNodes.key, data.key),
  ];
  if (data.parentId !== null) {
    conditions.push(eq(taxonomyNodes.parentId, data.parentId));
  } else {
    conditions.push(isNull(taxonomyNodes.parentId));
  }

  const existing = await db.select().from(taxonomyNodes)
    .where(and(...conditions))
    .limit(1);

  if (existing.length > 0) {
    await db.update(taxonomyNodes).set({
      label: data.label,
      description: data.description,
      sortOrder: data.sortOrder,
      updatedAt: new Date(),
    }).where(eq(taxonomyNodes.id, existing[0].id));
    return { id: existing[0].id, wasCreated: false };
  }

  const [node] = await db.insert(taxonomyNodes).values({
    parentId: data.parentId,
    entryType: data.entryType,
    level: data.level,
    key: data.key,
    label: data.label,
    description: data.description,
    sortOrder: data.sortOrder,
  }).returning();

  return { id: node.id, wasCreated: true };
}
