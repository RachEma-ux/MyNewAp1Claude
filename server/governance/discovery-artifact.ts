/**
 * Discovery Artifact — Governance v1 Normalization + Integrity Layer
 *
 * Implements RFC-DA-001 (Stage Contract Specification).
 *
 * Pipeline: External Website → Raw Capture (ingest) → Normalization (submit)
 *           → Admin Review → validate → approve → publish
 *
 * Guarantees:
 *   - Raw HTML stored via ArtifactStore (content-addressed, write-once)
 *   - Deterministic normalization (pure function over inputs)
 *   - Strict JSON Schema validation (no additionalProperties)
 *   - Integrity hash for tamper detection
 *   - requires_admin_review: true — hardcoded invariant, never scored
 *   - Raw website content NEVER enters scorecard
 *   - Unknown stage throws — no fallback
 */

import { computeSha256, getArtifactStore } from "./artifact-store";
import type { DiscoverResult } from "../routers/discover-provider";

// Load schema at runtime to avoid tsconfig resolveJsonModule requirement
// eslint-disable-next-line @typescript-eslint/no-var-requires
const discoveryArtifactSchema = require("../../schemas/discovery-artifact.schema.json");

// ============================================================================
// Stage Definition — RFC-DA-001
// ============================================================================

export const DISCOVERY_STAGES = ["ingest", "submit", "validate", "approve", "publish"] as const;
export type DiscoveryStage = (typeof DISCOVERY_STAGES)[number];

/**
 * Validate a discovery stage string. Throws on unknown — no fallback.
 */
export function assertValidDiscoveryStage(stage: string): asserts stage is DiscoveryStage {
  if (!(DISCOVERY_STAGES as readonly string[]).includes(stage)) {
    throw new Error(
      `[DiscoveryArtifact] Unknown stage "${stage}" — no fallback allowed. ` +
      `Valid stages: ${DISCOVERY_STAGES.join(", ")}`
    );
  }
}

// ============================================================================
// Types — DiscoveryArtifactV1 (matches JSON Schema)
// ============================================================================

export interface DiscoveryArtifactV1 {
  artifact_version: "1.0.0";
  stage: DiscoveryStage;
  source_url: string;
  fetched_at: string;
  raw_hash: string;
  raw_content_ref: string;
  confidence_score: number;
  extraction_method: "html_scrape" | "api" | "llm_parse";
  requires_admin_review: true;
  extracted: {
    name: string;
    description: string;
    api_url: string | null;
    auth_type: "oauth" | "api_key" | "none" | null;
    features: string[];
    terms_url: string | null;
    privacy_url: string | null;
  };
}

/** Subset returned to the client — no raw_content_ref */
export interface DiscoveryArtifactSummary {
  artifactId: string;
  raw_hash: string;
  confidence_score: number;
  requires_admin_review: true;
  extraction_method: string;
  stage: DiscoveryStage;
}

// ============================================================================
// Schema Validation
// ============================================================================

/** Validation errors from schema check */
export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate an artifact against the DiscoveryArtifact JSON Schema v1.
 * Strict mode — rejects non-conforming artifacts, no additionalProperties.
 */
export function validateArtifactSchema(artifact: unknown): SchemaValidationResult {
  const errors: string[] = [];

  if (!artifact || typeof artifact !== "object") {
    return { valid: false, errors: ["Artifact must be a non-null object"] };
  }

  const obj = artifact as Record<string, unknown>;
  const schema = discoveryArtifactSchema;

  // Check required fields
  for (const field of schema.required) {
    if (!(field in obj) || obj[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // artifact_version must be "1.0.0"
  if (obj.artifact_version !== "1.0.0") {
    errors.push(`artifact_version must be "1.0.0", got "${obj.artifact_version}"`);
  }

  // stage must be in enum
  const validStages = schema.properties.stage.enum;
  if (typeof obj.stage !== "string" || !validStages.includes(obj.stage)) {
    errors.push(`stage must be one of [${validStages.join(", ")}], got "${obj.stage}"`);
  }

  // source_url must be a string
  if (typeof obj.source_url !== "string" || obj.source_url.length === 0) {
    errors.push("source_url must be a non-empty string");
  }

  // fetched_at must be a date-time string
  if (typeof obj.fetched_at !== "string") {
    errors.push("fetched_at must be a date-time string");
  }

  // raw_hash must be 64 hex chars
  if (typeof obj.raw_hash !== "string" || !/^[a-f0-9]{64}$/.test(obj.raw_hash)) {
    errors.push("raw_hash must be a 64-character hex string (SHA-256)");
  }

  // raw_content_ref must be >= 10 chars
  if (typeof obj.raw_content_ref !== "string" || obj.raw_content_ref.length < 10) {
    errors.push("raw_content_ref must be a string with minLength 10");
  }

  // confidence_score must be 0..1
  if (typeof obj.confidence_score !== "number" || obj.confidence_score < 0 || obj.confidence_score > 1) {
    errors.push("confidence_score must be a number between 0 and 1");
  }

  // extraction_method must be in enum
  const validMethods = schema.properties.extraction_method.enum;
  if (typeof obj.extraction_method !== "string" || !validMethods.includes(obj.extraction_method)) {
    errors.push(`extraction_method must be one of [${validMethods.join(", ")}], got "${obj.extraction_method}"`);
  }

  // requires_admin_review must be exactly true
  if (obj.requires_admin_review !== true) {
    errors.push("requires_admin_review must be true (const)");
  }

  // Validate extracted object
  if (!obj.extracted || typeof obj.extracted !== "object") {
    errors.push("extracted must be a non-null object");
  } else {
    const ext = obj.extracted as Record<string, unknown>;
    if (typeof ext.name !== "string" || ext.name.length < 1) {
      errors.push("extracted.name must be a non-empty string");
    }
    if (typeof ext.description !== "string" || ext.description.length < 1) {
      errors.push("extracted.description must be a non-empty string");
    }
    if (ext.api_url !== null && typeof ext.api_url !== "string") {
      errors.push("extracted.api_url must be a string or null");
    }
    const validAuthTypes = ["oauth", "api_key", "none", null];
    if (!validAuthTypes.includes(ext.auth_type as any)) {
      errors.push(`extracted.auth_type must be one of [oauth, api_key, none, null], got "${ext.auth_type}"`);
    }
    if (ext.features !== undefined && !Array.isArray(ext.features)) {
      errors.push("extracted.features must be an array of strings");
    }

    // No additional properties
    const allowedExtracted = ["name", "description", "api_url", "auth_type", "features", "terms_url", "privacy_url"];
    for (const key of Object.keys(ext)) {
      if (!allowedExtracted.includes(key)) {
        errors.push(`extracted has unexpected property: ${key}`);
      }
    }
  }

  // No additional properties on top level
  const allowedTopLevel = Object.keys(schema.properties);
  for (const key of Object.keys(obj)) {
    if (!allowedTopLevel.includes(key)) {
      errors.push(`Unexpected top-level property: ${key}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Normalizer
// ============================================================================

/**
 * Normalize a DiscoverResult + raw body into a DiscoveryArtifactV1.
 *
 * This is a deterministic transformation — same inputs produce same output
 * (except for fetched_at timestamp and artifact store side-effects).
 *
 * The artifact starts at stage "ingest" (raw capture complete).
 * After normalization validates, it is promoted to "submit".
 *
 * Raw website content is stored immutably but NEVER enters scorecard.
 */
export async function normalizeDiscovery(
  result: DiscoverResult,
  rawBody: string | null,
  sourceUrl: string
): Promise<DiscoveryArtifactV1> {
  // 1. Store raw body immutably (content-addressed, write-once)
  let rawHash: string;
  let rawContentRef: string;

  if (rawBody) {
    rawHash = computeSha256(rawBody);
    try {
      const stored = await getArtifactStore().store(rawBody, {
        source: "discovery",
        label: result.domain,
        contentType: "text/html",
        timestamp: new Date().toISOString(),
      });
      rawContentRef = stored.path;
    } catch (err) {
      rawContentRef = `hash://${rawHash}`;
      console.warn(`[DiscoveryArtifact] Raw snapshot store failed: ${err}`);
    }
  } else {
    // Registry fast-path or no raw body
    rawHash = computeSha256(`no-raw-body:${result.domain}:${sourceUrl}`);
    rawContentRef = `synthetic:${rawHash}`;
  }

  // 2. Map extraction method to schema enum
  let extractionMethod: DiscoveryArtifactV1["extraction_method"];
  if (result.source === "registry") {
    extractionMethod = "api";
  } else if (result.api.candidates.some((c) => c.probeType === "openai-shape-best-effort")) {
    extractionMethod = "api";
  } else {
    extractionMethod = "html_scrape";
  }

  // 3. Normalize confidence score to 0..1 range
  const rawConfidence = result.api.candidates.length > 0
    ? result.api.candidates.reduce((max, c) => Math.max(max, c.confidence), 0)
    : 0;
  const confidenceScore = Math.min(1, Math.max(0, rawConfidence / 100));

  // 4. Map auth type
  let authType: DiscoveryArtifactV1["extracted"]["auth_type"] = null;
  const detectedAuth = result.techDocs?.authMethod ?? result.authType ?? null;
  if (detectedAuth) {
    if (detectedAuth === "bearer" || detectedAuth === "api_key") {
      authType = "api_key";
    } else if (detectedAuth === "oauth") {
      authType = "oauth";
    } else if (detectedAuth === "none") {
      authType = "none";
    }
  }

  // 5. Build extracted fields — name and description are required
  const name = result.name || result.domain;
  const description = result.description || `Provider discovered from ${result.domain}`;

  // 6. Construct the artifact at "submit" stage (ingest is implicit — raw already stored)
  const artifact: DiscoveryArtifactV1 = {
    artifact_version: "1.0.0",
    stage: "submit",
    source_url: sourceUrl,
    fetched_at: new Date().toISOString(),
    raw_hash: rawHash,
    raw_content_ref: rawContentRef,
    confidence_score: confidenceScore,
    extraction_method: extractionMethod,
    requires_admin_review: true,
    extracted: {
      name,
      description,
      api_url: result.api.bestUrl,
      auth_type: authType,
      features: [],
      terms_url: null,
      privacy_url: null,
    },
  };

  // 7. Validate against schema — reject non-conforming artifacts
  const validation = validateArtifactSchema(artifact);
  if (!validation.valid) {
    throw new Error(
      `[DiscoveryArtifact] Schema validation failed: ${validation.errors.join("; ")}`
    );
  }

  return artifact;
}

// ============================================================================
// Integrity
// ============================================================================

/**
 * Compute integrity hash for a V1 artifact.
 */
export function computeArtifactIntegrity(artifact: DiscoveryArtifactV1): string {
  return computeSha256(JSON.stringify(artifact));
}

/**
 * Verify artifact integrity against a known hash.
 */
export function verifyArtifactIntegrity(artifact: DiscoveryArtifactV1, expectedHash: string): boolean {
  return computeArtifactIntegrity(artifact) === expectedHash;
}

// ============================================================================
// Summary (client-safe)
// ============================================================================

/**
 * Extract a client-safe summary from a full artifact.
 * The raw_content_ref is excluded — raw data never leaves the server.
 */
export function toArtifactSummary(artifact: DiscoveryArtifactV1): DiscoveryArtifactSummary {
  const hash8 = artifact.raw_hash.slice(0, 8);
  return {
    artifactId: `DA-${Date.now()}-${hash8}`,
    raw_hash: artifact.raw_hash,
    confidence_score: artifact.confidence_score,
    requires_admin_review: artifact.requires_admin_review,
    extraction_method: artifact.extraction_method,
    stage: artifact.stage,
  };
}

// ============================================================================
// Stage Transition
// ============================================================================

/**
 * Validate a stage transition for a discovery artifact.
 * Enforces sequential progression: ingest → submit → validate → approve → publish.
 * Freeze MUST be checked before calling this.
 */
export function validateStageTransition(
  currentStage: DiscoveryStage,
  targetStage: DiscoveryStage
): { valid: boolean; reason: string } {
  assertValidDiscoveryStage(currentStage);
  assertValidDiscoveryStage(targetStage);

  const currentIdx = DISCOVERY_STAGES.indexOf(currentStage);
  const targetIdx = DISCOVERY_STAGES.indexOf(targetStage);

  if (targetIdx <= currentIdx) {
    return {
      valid: false,
      reason: `Backward transition not allowed: ${currentStage} → ${targetStage}`,
    };
  }

  if (targetIdx - currentIdx !== 1) {
    const nextStage = DISCOVERY_STAGES[currentIdx + 1];
    return {
      valid: false,
      reason: `Stage skipping prohibited: ${currentStage} → ${targetStage} (must go through ${nextStage})`,
    };
  }

  // Admin review required before validate
  if (targetStage === "validate") {
    return { valid: true, reason: `Transition allowed: ${currentStage} → ${targetStage} (admin review required)` };
  }

  return { valid: true, reason: `Transition allowed: ${currentStage} → ${targetStage}` };
}

// Export schema for tests
export { discoveryArtifactSchema };
