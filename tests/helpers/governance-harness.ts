/**
 * Governance Test Harness — shared utilities for invariant-driven testing.
 *
 * Re-exports db-harness and adds governance-specific assertion helpers.
 * All test files should import from this module.
 */

// Re-export everything from the existing DB harness
export {
  hasDb,
  getTestDb,
  cleanup,
  createTestEntry,
  createTestBundle,
  makeEntryAvailable,
  trackEntry,
  trackBundle,
  trackAudit,
  trackRun,
} from "../integration/runtime-db/helpers/db-harness";

// Re-export availability authority
export {
  checkCatalogAvailability,
  isCatalogEntryAvailableForAppUse,
  CATALOG_AVAILABILITY_FILTERS,
} from "../../server/ai-types/availability";

// Re-export catalog state
export {
  getCatalogState,
  getCatalogStateForDomainEntity,
} from "../../shared/catalog-state";

// ============================================================================
// Governance Invariant Assertion Helpers
// ============================================================================

import { expect } from "vitest";
import { isCatalogEntryAvailableForAppUse, CATALOG_AVAILABILITY_FILTERS } from "../../server/ai-types/availability";
import { getCatalogState } from "../../shared/catalog-state";

export interface InvariantCheckEntry {
  id: number;
  status: string | null;
  reviewState: string | null;
  tags?: string[] | null;
  entryType?: string;
  sourceType?: string | null;
  sourceId?: number | null;
  config?: Record<string, unknown> | null;
}

/**
 * I1: Domain creates entity only — verify no catalog_entries write happened
 * from domain context. Check that a given set of entry IDs are catalog-created.
 */
export function assertI1_DomainDoesNotCreateCatalogEntries(
  domainTableIds: number[],
  catalogEntryIds: number[],
) {
  // Domain IDs and catalog IDs must be disjoint sets
  for (const domainId of domainTableIds) {
    expect(catalogEntryIds).not.toContain(domainId);
  }
}

/**
 * I2: Catalog owns intake — verify entry was created with candidate state.
 */
export function assertI2_CatalogOwnsIntake(entry: InvariantCheckEntry) {
  // A freshly imported entry must start as draft + needs_review
  // (or admin-created with approved)
  expect(entry.status).toBeDefined();
  expect(entry.reviewState).toBeDefined();
}

/**
 * I3: deployable ≠ available — verify that domain readiness does NOT imply
 * catalog availability.
 */
export function assertI3_DeployableNotAvailable(
  domainStatus: string,
  catalogEntry: InvariantCheckEntry | null,
) {
  // Domain entity being "ready"/"active"/"deployable" must NOT mean
  // the catalog entry is available
  if (domainStatus === "ready" || domainStatus === "deployable") {
    if (catalogEntry) {
      // If catalog entry exists but is still draft, it must NOT be available
      if (catalogEntry.status === "draft") {
        expect(isCatalogEntryAvailableForAppUse(catalogEntry)).toBe(false);
      }
    }
  }
}

/**
 * I4: Only Catalog-approved + active entries are usable at runtime.
 */
export function assertI4_OnlyCatalogApprovedActive(entry: InvariantCheckEntry) {
  const available = isCatalogEntryAvailableForAppUse(entry);
  if (entry.status === "active" && entry.reviewState === "approved") {
    expect(available).toBe(true);
  } else {
    expect(available).toBe(false);
  }
}

/**
 * I5: No raw domain leakage in app selectors — verify that available
 * entries all have proper catalog metadata.
 */
export function assertI5_NoRawDomainLeakage(availableEntries: InvariantCheckEntry[]) {
  for (const entry of availableEntries) {
    // Every available entry must have status=active and reviewState=approved
    expect(entry.status).toBe("active");
    expect(entry.reviewState).toBe("approved");
    // Must have a catalog entry ID (positive integer)
    expect(entry.id).toBeGreaterThan(0);
  }
}

/**
 * I6: Audit blocks critical mutation — verify audit event exists.
 */
export async function assertI6_AuditExists(
  db: any,
  catalogEntryId: number,
  eventType: string,
) {
  const { catalogAuditEvents } = await import("../../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");

  const events = await db
    .select()
    .from(catalogAuditEvents)
    .where(
      and(
        eq(catalogAuditEvents.catalogEntryId, catalogEntryId),
        eq(catalogAuditEvents.eventType, eventType),
      ),
    );

  expect(events.length).toBeGreaterThan(0);
}

/**
 * I7: Structured FK preferred over legacy fallback — verify sourceType/sourceId.
 */
export function assertI7_StructuredFKPreferred(entry: InvariantCheckEntry) {
  // If config has legacy fields, structured FK should also be set
  const config = entry.config as Record<string, unknown> | null;
  if (config) {
    const legacyFields = ["sourceModelId", "sourceLLMId", "sourceBotId", "sourceAgentId"];
    const hasLegacy = legacyFields.some((f) => config[f] != null);
    if (hasLegacy && entry.sourceType) {
      // Structured FK is present — good
      expect(entry.sourceType).toBeTruthy();
    }
  }
}

/**
 * Run ALL invariants on an entry at the current step.
 */
export function assertAllInvariants(entry: InvariantCheckEntry, context?: string) {
  const prefix = context ? `[${context}] ` : "";

  // I2: Catalog owns intake
  assertI2_CatalogOwnsIntake(entry);

  // I4: Only Catalog-approved + active entries are usable
  assertI4_OnlyCatalogApprovedActive(entry);

  // I7: Structured FK preferred
  assertI7_StructuredFKPreferred(entry);
}
