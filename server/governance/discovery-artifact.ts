/**
 * Discovery Artifact — Normalization + Integrity Layer
 *
 * Transforms raw DiscoverResult data into a structured, content-addressed
 * artifact with immutable raw snapshot storage.
 *
 * Guarantees:
 *   - Raw HTML stored via ArtifactStore (content-addressed, write-once)
 *   - Deterministic normalization (pure function over inputs)
 *   - Integrity hash for tamper detection
 *   - requiresAdminReview: true — hardcoded invariant
 */

import { computeSha256, getArtifactStore } from "./artifact-store";
import type { DiscoverResult } from "../routers/discover-provider";

// ============================================================================
// Types
// ============================================================================

export interface DiscoveryArtifact {
  artifactId: string;
  sourceUrl: string;
  domain: string;
  rawSnapshotHash: string;
  rawSnapshotRef: string;
  extractionMethod: "registry" | "api-probe" | "html-scrape" | "mixed";
  confidenceScore: number;
  requiresAdminReview: true;
  normalizedAt: string;

  // Normalized fields (from DiscoverResult)
  providerName: string | null;
  providerDescription: string | null;
  apiUrl: string | null;
  apiCandidateCount: number;
  docsUrl: string | null;
  authMethod: string | null;
  registrySlug: string | null;

  // Discovery metadata
  discoveryStatus: "ok" | "partial" | "failed";
  failureReason: string | null;
  warnings: string[];
  timingsMs: Record<string, number>;

  // Integrity
  integrityHash: string;
}

/** Subset returned to the client — no raw snapshot ref */
export interface DiscoveryArtifactSummary {
  artifactId: string;
  rawSnapshotHash: string;
  confidenceScore: number;
  requiresAdminReview: true;
  extractionMethod: string;
}

// ============================================================================
// Normalizer
// ============================================================================

/**
 * Normalize a DiscoverResult + optional raw body into a DiscoveryArtifact.
 * This is a deterministic transformation — same inputs always produce same output
 * (except for timestamps and artifact store side-effects).
 */
export async function normalizeDiscovery(
  result: DiscoverResult,
  rawBody: string | null,
  sourceUrl: string
): Promise<DiscoveryArtifact> {
  // 1. Store raw body in artifact store (content-addressed, write-once)
  let rawSnapshotHash: string;
  let rawSnapshotRef: string;

  if (rawBody) {
    rawSnapshotHash = computeSha256(rawBody);
    try {
      const stored = await getArtifactStore().store(rawBody, {
        source: "discovery",
        label: result.domain,
        contentType: "text/html",
        timestamp: new Date().toISOString(),
      });
      rawSnapshotRef = stored.path;
    } catch (err) {
      // Store failed — use hash as ref, don't block pipeline
      rawSnapshotRef = `hash://${rawSnapshotHash}`;
      console.warn(`[DiscoveryArtifact] Raw snapshot store failed: ${err}`);
    }
  } else {
    // Registry fast-path or no raw body available
    rawSnapshotHash = computeSha256(`no-raw-body:${result.domain}:${sourceUrl}`);
    rawSnapshotRef = "none";
  }

  // 2. Map extraction method
  let extractionMethod: DiscoveryArtifact["extractionMethod"];
  if (result.source === "registry") {
    extractionMethod = "registry";
  } else if (result.api.candidates.some((c) => c.probeType === "openai-shape-best-effort")) {
    extractionMethod = rawBody ? "mixed" : "api-probe";
  } else {
    extractionMethod = "html-scrape";
  }

  // 3. Extract confidence score from best candidate
  const confidenceScore = result.api.candidates.length > 0
    ? result.api.candidates.reduce((max, c) => Math.max(max, c.confidence), 0)
    : 0;

  // 4. Extract auth method
  const authMethod = result.techDocs?.authMethod
    ?? result.authType
    ?? null;

  // 5. Build the artifact (without integrityHash first)
  const now = new Date().toISOString();
  const hash8 = rawSnapshotHash.slice(0, 8);
  const artifactId = `DA-${Date.now()}-${hash8}`;

  const artifact: Omit<DiscoveryArtifact, "integrityHash"> = {
    artifactId,
    sourceUrl,
    domain: result.domain,
    rawSnapshotHash,
    rawSnapshotRef,
    extractionMethod,
    confidenceScore,
    requiresAdminReview: true,
    normalizedAt: now,

    providerName: result.name,
    providerDescription: result.description,
    apiUrl: result.api.bestUrl,
    apiCandidateCount: result.api.candidates.length,
    docsUrl: result.docsUrl,
    authMethod,
    registrySlug: result.registrySlug ?? null,

    discoveryStatus: result.status,
    failureReason: result.failureReason ?? null,
    warnings: result.warnings,
    timingsMs: result.debug.timingsMs as Record<string, number>,
  };

  // 6. Compute integrity hash over the full artifact content
  const integrityHash = computeSha256(JSON.stringify(artifact));

  return { ...artifact, integrityHash } as DiscoveryArtifact;
}

// ============================================================================
// Integrity Verification
// ============================================================================

/**
 * Verify that an artifact has not been tampered with.
 * Recomputes the integrity hash excluding the integrityHash field.
 */
export function verifyArtifactIntegrity(artifact: DiscoveryArtifact): boolean {
  const { integrityHash, ...rest } = artifact;
  const expected = computeSha256(JSON.stringify(rest));
  return expected === integrityHash;
}

/**
 * Extract a client-safe summary from a full artifact.
 */
export function toArtifactSummary(artifact: DiscoveryArtifact): DiscoveryArtifactSummary {
  return {
    artifactId: artifact.artifactId,
    rawSnapshotHash: artifact.rawSnapshotHash,
    confidenceScore: artifact.confidenceScore,
    requiresAdminReview: artifact.requiresAdminReview,
    extractionMethod: artifact.extractionMethod,
  };
}
