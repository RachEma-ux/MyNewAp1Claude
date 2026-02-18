/**
 * Deduplication Service — Exact + fuzzy matching against existing catalog entries
 */
import { getCatalogEntries } from "../db";
import type { PreviewEntry, DuplicateStatus, PreviewSummary } from "@shared/catalog-import-types";

// ============================================================================
// Levenshtein Distance (in-memory, no pg_trgm dependency)
// ============================================================================

function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const matrix: number[][] = [];
  for (let i = 0; i <= la; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lb; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[la][lb];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

const FUZZY_THRESHOLD = 0.8; // 80% similarity

// ============================================================================
// Duplicate Checking
// ============================================================================

export async function checkDuplicates(rows: PreviewEntry[]): Promise<PreviewEntry[]> {
  // Fetch all existing catalog entries
  const existing = await getCatalogEntries({});

  // Build lookup maps
  const exactMap = new Map<string, { name: string; entryType: string }>();
  for (const entry of existing) {
    const key = `${entry.name.toLowerCase()}|${entry.entryType}`;
    exactMap.set(key, { name: entry.name, entryType: entry.entryType });
  }

  return rows.map((row) => {
    const key = `${row.name.toLowerCase()}|${row.type}`;

    // Exact match: same name + same type
    if (exactMap.has(key)) {
      return { ...row, duplicateStatus: "exact_match" as DuplicateStatus };
    }

    // Conflict: same name, different type
    for (const entry of existing) {
      if (entry.name.toLowerCase() === row.name.toLowerCase() && entry.entryType !== row.type) {
        return { ...row, duplicateStatus: "conflict" as DuplicateStatus, riskLevel: "high" as const };
      }
    }

    // Fuzzy match: similar name + same type
    for (const entry of existing) {
      if (entry.entryType === row.type) {
        const sim = similarity(entry.name.toLowerCase(), row.name.toLowerCase());
        if (sim >= FUZZY_THRESHOLD && sim < 1) {
          return { ...row, duplicateStatus: "fuzzy_match" as DuplicateStatus, riskLevel: "medium" as const };
        }
      }
    }

    return { ...row, duplicateStatus: "new" as DuplicateStatus };
  });
}

// ============================================================================
// Summary Builder
// ============================================================================

export function buildPreviewSummary(rows: PreviewEntry[]): PreviewSummary {
  const summary: PreviewSummary = {
    total: rows.length,
    new: 0,
    exactMatch: 0,
    fuzzyMatch: 0,
    conflict: 0,
    highRisk: 0,
  };

  for (const row of rows) {
    switch (row.duplicateStatus) {
      case "new": summary.new++; break;
      case "exact_match": summary.exactMatch++; break;
      case "fuzzy_match": summary.fuzzyMatch++; break;
      case "conflict": summary.conflict++; break;
    }
    if (row.riskLevel === "high") summary.highRisk++;
  }

  return summary;
}
