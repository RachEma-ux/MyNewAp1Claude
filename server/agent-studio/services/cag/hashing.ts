/**
 * CAG hashing — canonical SHA-256 over JSON-serializable inputs.
 *
 * Used for:
 *   - Per-source hash on `CagSourceManifestEntry.hash`
 *   - Aggregate manifest hash → equality check for pack reuse
 *
 * Rules:
 *   - Object keys sorted alphabetically before stringify (stable output)
 *   - Arrays preserve order (semantic)
 *   - Numbers, strings, booleans, null serialize naturally
 *   - undefined → omitted (matches JSON.stringify default)
 *
 * NOT a cryptographic identity — only used for cache-keying. Collisions
 * are acceptable; the pack reuse path tolerates one re-build.
 */

import { createHash } from "node:crypto";
import type { CagSourceManifestEntry } from "./types";

/**
 * Stable stringify with sorted object keys. Preserves array order.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(value, replacer);
}

function replacer(_key: string, val: unknown): unknown {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(val).sort()) {
      sorted[k] = (val as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return val;
}

/**
 * SHA-256 hex of the canonical serialization of `value`.
 */
export function hashJsonStable(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

/**
 * Aggregate hash over a list of source manifest entries. Stable over
 * entry order via sort by sourceType:refId before hashing the array.
 *
 * Returned as a 64-char hex string.
 */
export function aggregateManifestHash(entries: CagSourceManifestEntry[]): string {
  const sorted = [...entries].sort((a, b) => {
    const aKey = `${a.sourceType}:${a.refId}`;
    const bKey = `${b.sourceType}:${b.refId}`;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  return hashJsonStable(sorted);
}

/**
 * Project a manifest list to the `sourceHashesJson` map shape used in
 * the DB (`{"sourceType:refId": hash}`).
 */
export function manifestToHashMap(
  entries: CagSourceManifestEntry[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    out[`${e.sourceType}:${e.refId}`] = e.hash;
  }
  return out;
}

/**
 * True iff two hash maps describe the same source set with the same
 * hashes. Used for the pack-reuse short-circuit in `createPack()`.
 */
export function hashMapsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
