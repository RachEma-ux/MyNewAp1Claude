/**
 * KGIA — Temporal Resolver
 *
 * Resolves temporal claims from evidence: extracts date fields,
 * determines validity windows, generates temporal warnings.
 */

import type { TemporalClaim, EvidenceGraph, GraphSource } from "../domain/types";

const TEMPORAL_FIELDS = [
  "createdAt", "updatedAt", "validFrom", "validTo", "startDate", "endDate",
  "dateOfBirth", "foundedDate", "dissolvedDate", "effectiveDate", "expiryDate",
  "created_at", "updated_at", "valid_from", "valid_to", "start_date", "end_date",
];

/**
 * Extract temporal claims from an evidence graph.
 */
export function resolveTemporalClaims(
  graph: EvidenceGraph,
  source: GraphSource
): TemporalClaim[] {
  const claims: TemporalClaim[] = [];

  for (const node of graph.nodes) {
    if (!node.properties) continue;

    for (const field of TEMPORAL_FIELDS) {
      const value = node.properties[field];
      if (!value) continue;

      const dateStr = String(value);
      const parsed = tryParseDate(dateStr);
      if (!parsed) continue;

      const claim: TemporalClaim = {
        entityRef: node.id,
        field,
        value: dateStr,
        parsedDate: parsed,
        sourceRef: source.name,
      };

      // Determine validity
      if (field.includes("validTo") || field.includes("valid_to") || field.includes("expiry") || field.includes("end")) {
        if (parsed < new Date()) {
          claim.expired = true;
          claim.warning = `${node.label}.${field} expired on ${dateStr}`;
        }
      }

      if (field.includes("validFrom") || field.includes("valid_from") || field.includes("start") || field.includes("effective")) {
        if (parsed > new Date()) {
          claim.notYetValid = true;
          claim.warning = `${node.label}.${field} not yet valid (starts ${dateStr})`;
        }
      }

      claims.push(claim);
    }
  }

  return claims;
}

/**
 * Check if any temporal claims indicate stale or expired data.
 */
export function hasTemporalWarnings(claims: TemporalClaim[]): boolean {
  return claims.some((c) => c.expired || c.notYetValid || c.warning);
}

/**
 * Generate a summary of temporal validity for the answer envelope.
 */
export function summarizeTemporalValidity(claims: TemporalClaim[]): {
  asOf: string;
  validFrom?: string;
  validTo?: string;
  temporalWarning?: string;
} {
  const now = new Date().toISOString();
  const warnings = claims.filter((c) => c.warning).map((c) => c.warning!);
  const validFroms = claims.filter((c) => c.parsedDate && !c.expired).map((c) => c.parsedDate!);
  const validTos = claims.filter((c) => c.expired).map((c) => c.parsedDate!);

  return {
    asOf: now,
    validFrom: validFroms.length > 0 ? new Date(Math.max(...validFroms.map((d) => d.getTime()))).toISOString() : undefined,
    validTo: validTos.length > 0 ? new Date(Math.min(...validTos.map((d) => d.getTime()))).toISOString() : undefined,
    temporalWarning: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

function tryParseDate(value: string): Date | null {
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
