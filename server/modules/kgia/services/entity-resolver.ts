/**
 * KGIA — Entity Resolver
 *
 * Deduplicates raw extracted entities to canonical forms.
 * Uses exact match first, then fuzzy (Levenshtein distance).
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../../db/connection";
import { kgiaEntityResolutions } from "../schema";

export interface RawEntity {
  text: string;
  type?: string;
}

export interface ResolvedEntity {
  rawEntity: string;
  resolvedEntity: string;
  confidence: number;
  method: "exact" | "fuzzy" | "new";
}

/**
 * Resolve a batch of raw entities against existing resolutions.
 */
export async function resolveEntities(
  rawEntities: RawEntity[],
  ingestionId: number,
  workspaceId: number
): Promise<ResolvedEntity[]> {
  const db = getDb();
  if (!db) return rawEntities.map((e) => ({
    rawEntity: e.text,
    resolvedEntity: e.text,
    confidence: 1.0,
    method: "new" as const,
  }));

  // Load existing resolutions for this workspace
  const existing = await db
    .select()
    .from(kgiaEntityResolutions)
    .where(eq(kgiaEntityResolutions.workspaceId, workspaceId));

  const existingMap = new Map<string, string>();
  for (const row of existing) {
    existingMap.set(row.rawEntity.toLowerCase(), row.resolvedEntity);
  }

  const results: ResolvedEntity[] = [];

  for (const entity of rawEntities) {
    const lower = entity.text.toLowerCase().trim();

    // 1. Exact match
    const exactMatch = existingMap.get(lower);
    if (exactMatch) {
      results.push({
        rawEntity: entity.text,
        resolvedEntity: exactMatch,
        confidence: 1.0,
        method: "exact",
      });
      continue;
    }

    // 2. Fuzzy match (Levenshtein distance ≤ 2 for short strings)
    let bestMatch: string | null = null;
    let bestDistance = Infinity;

    for (const [key, resolved] of existingMap) {
      const dist = levenshteinDistance(lower, key);
      const threshold = Math.max(2, Math.floor(lower.length * 0.2));
      if (dist <= threshold && dist < bestDistance) {
        bestDistance = dist;
        bestMatch = resolved;
      }
    }

    if (bestMatch) {
      const confidence = 1 - bestDistance / Math.max(lower.length, 1);
      results.push({
        rawEntity: entity.text,
        resolvedEntity: bestMatch,
        confidence: Math.max(0.5, confidence),
        method: "fuzzy",
      });
      // Add to map for subsequent lookups in this batch
      existingMap.set(lower, bestMatch);
      continue;
    }

    // 3. New entity
    results.push({
      rawEntity: entity.text,
      resolvedEntity: entity.text,
      confidence: 1.0,
      method: "new",
    });
    existingMap.set(lower, entity.text);
  }

  // Persist resolutions
  await persistResolutions(results, ingestionId, workspaceId);

  return results;
}

/**
 * Batch insert entity resolutions.
 */
export async function persistResolutions(
  resolutions: ResolvedEntity[],
  ingestionId: number,
  workspaceId: number
): Promise<void> {
  const db = getDb();
  if (!db) return;

  for (const res of resolutions) {
    await db.insert(kgiaEntityResolutions).values({
      workspaceId,
      ingestionId,
      rawEntity: res.rawEntity,
      resolvedEntity: res.resolvedEntity,
      confidence: res.confidence,
      method: res.method === "new" ? "exact" : res.method,
    });
  }
}

/**
 * Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}
