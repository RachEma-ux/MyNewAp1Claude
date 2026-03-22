/**
 * Real DB Test Harness — manages test lifecycle against a live PostgreSQL database.
 *
 * Usage:
 *   - Tests using this harness require DATABASE_URL to be set.
 *   - `hasDb` can be used with `describe.runIf(hasDb)` to skip when no DB is available.
 *   - `createTestEntry()` creates a real catalog_entry and tracks it for cleanup.
 *   - `cleanup()` deletes all tracked records in reverse dependency order.
 *
 * The harness does NOT create or migrate tables — the DB must already have
 * the schema applied (via `npm run db:push` or drizzle-kit migrate).
 */

import { eq, and, inArray } from "drizzle-orm";
import {
  catalogEntries,
  catalogEntryVersions,
  publishBundles,
  catalogAuditEvents,
  executionRuns,
  catalogEntryClassifications,
} from "../../../../drizzle/schema";

// ============================================================================
// DB availability check
// ============================================================================

export const hasDb = !!process.env.DATABASE_URL;

let _db: any = null;

export function getTestDb() {
  if (!_db) {
    // Use the same getDb() from the app — it initializes from DATABASE_URL
    const { getDb } = require("../../../../server/db/connection");
    _db = getDb();
  }
  return _db;
}

// ============================================================================
// Test record tracker — for guaranteed cleanup
// ============================================================================

const trackedEntryIds: number[] = [];
const trackedBundleIds: number[] = [];
const trackedAuditIds: number[] = [];
const trackedRunIds: number[] = [];

export function trackEntry(id: number) {
  trackedEntryIds.push(id);
}
export function trackBundle(id: number) {
  trackedBundleIds.push(id);
}
export function trackAudit(id: number) {
  trackedAuditIds.push(id);
}
export function trackRun(id: number) {
  trackedRunIds.push(id);
}

/**
 * Delete all tracked test records in reverse-dependency order.
 * Call this in afterEach / afterAll.
 */
export async function cleanup() {
  const db = getTestDb();
  if (!db) return;

  // 1. Execution runs (references catalog_entries)
  if (trackedRunIds.length > 0) {
    await db.delete(executionRuns).where(inArray(executionRuns.id, trackedRunIds));
    trackedRunIds.length = 0;
  }

  // 2. Classifications (references catalog_entries)
  if (trackedEntryIds.length > 0) {
    await db.delete(catalogEntryClassifications)
      .where(inArray(catalogEntryClassifications.catalogEntryId, trackedEntryIds));
  }

  // 3. Audit events (references catalog_entries)
  if (trackedAuditIds.length > 0) {
    await db.delete(catalogAuditEvents).where(inArray(catalogAuditEvents.id, trackedAuditIds));
    trackedAuditIds.length = 0;
  }
  // Also clean up audits linked to tracked entries
  if (trackedEntryIds.length > 0) {
    await db.delete(catalogAuditEvents)
      .where(inArray(catalogAuditEvents.catalogEntryId, trackedEntryIds));
  }

  // 4. Publish bundles (references catalog_entries)
  if (trackedBundleIds.length > 0) {
    await db.delete(publishBundles).where(inArray(publishBundles.id, trackedBundleIds));
    trackedBundleIds.length = 0;
  }
  // Also clean up bundles linked to tracked entries
  if (trackedEntryIds.length > 0) {
    await db.delete(publishBundles)
      .where(inArray(publishBundles.catalogEntryId, trackedEntryIds));
  }

  // 5. Entry versions (references catalog_entries)
  if (trackedEntryIds.length > 0) {
    await db.delete(catalogEntryVersions)
      .where(inArray(catalogEntryVersions.catalogEntryId, trackedEntryIds));
  }

  // 6. Catalog entries themselves
  if (trackedEntryIds.length > 0) {
    await db.delete(catalogEntries).where(inArray(catalogEntries.id, trackedEntryIds));
    trackedEntryIds.length = 0;
  }
}

// ============================================================================
// Test factory helpers — create REAL DB records
// ============================================================================

let _counter = 0;
function testUniqueName(prefix: string) {
  _counter++;
  return `__test_${prefix}_${Date.now()}_${_counter}`;
}

/**
 * Create a real catalog entry in the database.
 * Returns the inserted record with all DB-generated fields.
 */
export async function createTestEntry(overrides: Partial<{
  name: string;
  displayName: string;
  entryType: string;
  sourceType: string;
  sourceId: number;
  status: string;
  reviewState: string;
  tags: string[];
  config: Record<string, unknown>;
  scope: string;
  origin: string;
  category: string;
  createdBy: number;
}> = {}) {
  const { createCatalogEntry } = await import("../../../../server/db/catalog");

  const entry = await createCatalogEntry({
    name: overrides.name ?? testUniqueName("entry"),
    displayName: overrides.displayName ?? "Test Entry",
    description: "DB integration test entry",
    entryType: overrides.entryType ?? "agent",
    sourceType: overrides.sourceType ?? "agent",
    sourceId: overrides.sourceId ?? null,
    scope: overrides.scope ?? "app",
    status: overrides.status ?? "draft",
    origin: overrides.origin ?? "admin",
    reviewState: overrides.reviewState ?? "needs_review",
    config: overrides.config ?? {},
    tags: overrides.tags ?? ["candidate"],
    category: overrides.category ?? null,
    subCategory: null,
    capabilities: null,
    createdBy: overrides.createdBy ?? 1,
  });

  trackEntry(entry.id);
  return entry;
}

/**
 * Create a real publish bundle for a catalog entry.
 */
export async function createTestBundle(catalogEntryId: number, overrides: Partial<{
  versionLabel: string;
  snapshot: Record<string, unknown>;
  snapshotHash: string;
  publishedBy: number;
  policyDecision: string;
}> = {}) {
  const { createPublishBundle } = await import("../../../../server/db/catalog");
  const { createHash } = await import("crypto");

  const snapshot = overrides.snapshot ?? { config: {}, name: "test-snapshot" };
  const hash = overrides.snapshotHash ?? createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

  const bundle = await createPublishBundle({
    catalogEntryId,
    versionLabel: overrides.versionLabel ?? `v1.0.0-test-${Date.now()}`,
    snapshot,
    snapshotHash: hash,
    publishedBy: overrides.publishedBy ?? 1,
    policyDecision: overrides.policyDecision ?? "pass",
  });

  trackBundle(bundle.id);
  return bundle;
}

/**
 * Transition a catalog entry through a full lifecycle to make it available.
 * draft → approved → tagged published → activated
 */
export async function makeEntryAvailable(entryId: number) {
  const { updateCatalogEntry, approveCatalogEntry } = await import("../../../../server/db/catalog");

  // Approve
  await approveCatalogEntry(entryId, 1);

  // Add published tag
  await updateCatalogEntry(entryId, {
    tags: ["candidate", "registered", "published"],
  }, 1);

  // Activate
  await updateCatalogEntry(entryId, {
    status: "active",
  }, 1);

  // Create a publish bundle
  const bundle = await createTestBundle(entryId);

  // Re-read the entry
  const { getCatalogEntryById } = await import("../../../../server/db/catalog");
  const entry = await getCatalogEntryById(entryId);
  return { entry: entry!, bundle };
}
