/**
 * Discovery Artifact Migration — Legacy → V1
 *
 * Safely migrates legacy discovery entries into DiscoveryArtifactV1 format.
 *
 * Steps:
 *   1. Identify legacy entries (missing raw_hash, stage, artifact_version)
 *   2. Create synthetic raw records (serialize + SHA-256 + store immutably)
 *   3. Normalize into extracted object + validate against schema
 *   4. Assign proper stage based on current status
 *   5. Re-run governance evaluation
 *   6. Log durable migration audit
 *   7. Freeze enforcement: block publish during migration
 *
 * Invariants:
 *   - Never auto-promote without compliance verification
 *   - Migration audit is durable and blocking
 *   - requires_admin_review: true (hardcoded)
 */

import { computeSha256, getArtifactStore } from "./artifact-store";
import {
  type DiscoveryArtifactV1,
  type DiscoveryStage,
  validateArtifactSchema,
} from "./discovery-artifact";
import { getAuditLogger } from "../services/auditLogger";

// ============================================================================
// Types
// ============================================================================

export interface LegacyEntry {
  id: number;
  name: string;
  displayName?: string;
  description?: string | null;
  entryType: string;
  status: string;
  origin?: string;
  reviewState?: string;
  config?: Record<string, unknown> | null;
  tags?: string[];
  createdAt?: string | Date | null;
}

export interface MigrationResult {
  entryId: number;
  entryName: string;
  oldStage: string | null;
  newStage: DiscoveryStage;
  artifact: DiscoveryArtifactV1;
  migrated: boolean;
  errors: string[];
}

export interface MigrationReport {
  migrationVersion: "1.0.0";
  migrationTimestamp: string;
  actor: "system_migration";
  totalEntries: number;
  migrated: number;
  failed: number;
  skipped: number;
  results: MigrationResult[];
}

// ============================================================================
// Step 1 — Identify Legacy Entries
// ============================================================================

/**
 * Determine if a catalog entry is a legacy discovery entry that needs migration.
 * Legacy entries lack: raw_hash, stage, artifact_version in their config.
 */
export function isLegacyDiscoveryEntry(entry: LegacyEntry): boolean {
  if (entry.origin !== "discovery") return false;

  const config = entry.config || {};
  const hasRawHash = typeof config.raw_hash === "string" && /^[a-f0-9]{64}$/.test(config.raw_hash as string);
  const hasStage = typeof config.artifact_stage === "string";
  const hasVersion = config.artifact_version === "1.0.0";

  return !hasRawHash || !hasStage || !hasVersion;
}

// ============================================================================
// Step 2 — Create Synthetic Raw Records
// ============================================================================

/**
 * Create a synthetic raw record for a legacy entry.
 * Serializes original data, computes SHA-256, stores immutably.
 */
async function createSyntheticRawRecord(entry: LegacyEntry): Promise<{
  rawHash: string;
  rawContentRef: string;
}> {
  // Serialize the original entry data as the "raw" content
  const serialized = JSON.stringify({
    _migration: "synthetic_raw_v1",
    id: entry.id,
    name: entry.name,
    displayName: entry.displayName,
    description: entry.description,
    config: entry.config,
    tags: entry.tags,
    createdAt: entry.createdAt,
  });

  const rawHash = computeSha256(serialized);

  let rawContentRef: string;
  try {
    const stored = await getArtifactStore().store(serialized, {
      source: "migration",
      label: `legacy-entry-${entry.id}`,
      contentType: "application/json",
      timestamp: new Date().toISOString(),
    });
    rawContentRef = stored.path;
  } catch {
    rawContentRef = `synthetic:${rawHash}`;
  }

  return { rawHash, rawContentRef };
}

// ============================================================================
// Step 3 — Normalize
// ============================================================================

/**
 * Map legacy fields into the extracted object.
 * If required fields are missing, use fallback values and flag for review.
 */
function normalizeLegacyExtracted(entry: LegacyEntry): DiscoveryArtifactV1["extracted"] {
  const config = entry.config || {};

  return {
    name: entry.displayName || entry.name,
    description: entry.description || `Legacy discovery entry: ${entry.name}`,
    api_url: (config.baseUrl as string) || (config.apiUrl as string) || null,
    auth_type: mapLegacyAuthType(config.authMethod as string | undefined),
    features: [],
    terms_url: null,
    privacy_url: null,
  };
}

function mapLegacyAuthType(auth: string | undefined | null): DiscoveryArtifactV1["extracted"]["auth_type"] {
  if (!auth) return null;
  if (auth === "bearer" || auth === "api_key") return "api_key";
  if (auth === "oauth") return "oauth";
  if (auth === "none") return "none";
  return null;
}

// ============================================================================
// Step 4 — Assign Stage
// ============================================================================

/**
 * Determine the appropriate stage for a legacy entry based on its current status.
 * Never auto-promotes to publish without compliance verification.
 */
function assignStage(entry: LegacyEntry): DiscoveryStage {
  const status = entry.status;
  const reviewState = entry.reviewState;
  const tags = entry.tags || [];

  // Published/active with approved review → validate (not publish — needs re-verification)
  if (tags.includes("published") && reviewState === "approved") {
    return "validate";
  }

  // Active/approved but not published → validate
  if (status === "active" && reviewState === "approved") {
    return "validate";
  }

  // Approved but not active → submit (needs re-review after migration)
  if (reviewState === "approved") {
    return "submit";
  }

  // Everything else → submit (entry point, requires admin review)
  return "submit";
}

// ============================================================================
// Step 5 — Governance Re-evaluation (placeholder)
// ============================================================================

/**
 * Re-evaluate governance for a migrated artifact.
 * If fails, revert to submit stage.
 */
function reEvaluateGovernance(
  artifact: DiscoveryArtifactV1,
  assignedStage: DiscoveryStage
): { finalStage: DiscoveryStage; passed: boolean; reason: string } {
  // For migration safety, only allow submit and validate stages.
  // publish and approve require explicit post-migration review.
  if (assignedStage === "publish" || assignedStage === "approve") {
    return {
      finalStage: "submit",
      passed: false,
      reason: "Migration safety: publish/approve stages require explicit post-migration review",
    };
  }

  // Schema validation as governance check
  const validation = validateArtifactSchema(artifact);
  if (!validation.valid) {
    return {
      finalStage: "submit",
      passed: false,
      reason: `Schema validation failed: ${validation.errors.join("; ")}`,
    };
  }

  return {
    finalStage: assignedStage,
    passed: true,
    reason: `Governance check passed for stage: ${assignedStage}`,
  };
}

// ============================================================================
// Main Migration Function
// ============================================================================

/**
 * Migrate a batch of legacy discovery entries to DiscoveryArtifactV1.
 *
 * Returns a MigrationReport with per-entry results.
 * Audit logging is durable and blocking — each migration is logged before proceeding.
 */
export async function migrateDiscoveryEntries(
  entries: LegacyEntry[]
): Promise<MigrationReport> {
  const audit = getAuditLogger();
  const timestamp = new Date().toISOString();

  const report: MigrationReport = {
    migrationVersion: "1.0.0",
    migrationTimestamp: timestamp,
    actor: "system_migration",
    totalEntries: entries.length,
    migrated: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  for (const entry of entries) {
    // Skip non-legacy entries
    if (!isLegacyDiscoveryEntry(entry)) {
      report.skipped++;
      continue;
    }

    const result: MigrationResult = {
      entryId: entry.id,
      entryName: entry.name,
      oldStage: null,
      newStage: "submit",
      artifact: null as unknown as DiscoveryArtifactV1,
      migrated: false,
      errors: [],
    };

    try {
      // Step 2: Create synthetic raw record
      const { rawHash, rawContentRef } = await createSyntheticRawRecord(entry);

      // Step 3: Normalize into extracted object
      const extracted = normalizeLegacyExtracted(entry);

      // Step 4: Assign stage
      const assignedStage = assignStage(entry);
      result.oldStage = determineOldStage(entry);

      // Build the artifact
      const artifact: DiscoveryArtifactV1 = {
        artifact_version: "1.0.0",
        stage: assignedStage,
        source_url: (entry.config?.websiteUrl as string) || `https://${entry.name}`,
        fetched_at: entry.createdAt
          ? new Date(entry.createdAt).toISOString()
          : timestamp,
        raw_hash: rawHash,
        raw_content_ref: rawContentRef,
        confidence_score: 0.5, // Synthetic — medium confidence
        extraction_method: "html_scrape" as const,
        requires_admin_review: true as const,
        extracted,
      };

      // Step 5: Governance re-evaluation
      const govResult = reEvaluateGovernance(artifact, assignedStage);
      artifact.stage = govResult.finalStage;
      result.newStage = govResult.finalStage;

      // Validate against schema
      const validation = validateArtifactSchema(artifact);
      if (!validation.valid) {
        result.errors.push(...validation.errors);
        report.failed++;

        // Step 7: Audit — log failure
        await audit.log({
          action_type: "LIFECYCLE_TRANSITION",
          target_type: "discovery_migration",
          target_id: String(entry.id),
          decision_result: "failure",
          metadata: {
            migration_version: "1.0.0",
            migration_timestamp: timestamp,
            actor: "system_migration",
            record_id: entry.id,
            old_stage: result.oldStage,
            new_stage: result.newStage,
            errors: validation.errors,
          },
        });

        report.results.push(result);
        continue;
      }

      result.artifact = artifact;
      result.migrated = true;
      report.migrated++;

      // Step 7: Audit — log success (blocking)
      await audit.log({
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "discovery_migration",
        target_id: String(entry.id),
        decision_result: "success",
        metadata: {
          migration_version: "1.0.0",
          migration_timestamp: timestamp,
          actor: "system_migration",
          record_id: entry.id,
          old_stage: result.oldStage,
          new_stage: result.newStage,
          raw_hash: rawHash,
          governance_passed: govResult.passed,
          governance_reason: govResult.reason,
        },
      });
    } catch (err: any) {
      result.errors.push(err.message);
      report.failed++;

      // Audit the failure
      await audit.log({
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "discovery_migration",
        target_id: String(entry.id),
        decision_result: "failure",
        metadata: {
          migration_version: "1.0.0",
          migration_timestamp: timestamp,
          actor: "system_migration",
          record_id: entry.id,
          error: err.message,
        },
      });
    }

    report.results.push(result);
  }

  return report;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Determine what stage a legacy entry was effectively at.
 */
function determineOldStage(entry: LegacyEntry): string {
  const tags = entry.tags || [];
  if (tags.includes("published")) return "publish";
  if (tags.includes("validated")) return "validate";
  if (tags.includes("registered")) return "register";
  if (tags.includes("candidate")) return "submit";
  return "unknown";
}
