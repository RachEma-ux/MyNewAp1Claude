/**
 * Canonical MCP tool-schema hash — M1-c5 (cycle-5 audit closure).
 *
 * Cycle-5 audit (`/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md`
 * §M1-c5) flagged that the SHA-256-of-canonical-JSON schema-hash
 * computation was triplicated across:
 *   - `tool-knowledge-sync.ts` (mirror writer)
 *   - `proposed-tool-call.ts` (validator gate)
 *   - `risk-classifier.ts` / CAG side
 *
 * Identical by inspection, no shared function. M1-c5 closure: extract
 * the canonicalization + hash into this single module; the 2 callers
 * (sync + validator) delegate. The CAG side reads `tool.riskClass`
 * directly via `readRiskClass()` and does not actually compute the
 * schema hash — the audit overcounted; the real triplication is N=2.
 *
 * Contract:
 *   `hashMcpToolSchema({name, description?, inputSchema?})` returns
 *   the lowercase-hex SHA-256 of the canonical JSON. Canonicalization:
 *   sort all object keys recursively (depth-first); represent missing
 *   description as empty string; represent missing inputSchema as
 *   empty object. Output is stable across runtime restarts and
 *   cross-process — it's the source of truth for `agsMcpToolKnowledge.schemaHash`
 *   drift detection.
 */
import { createHash } from "crypto";

/**
 * Recursively sort object keys for deterministic JSON serialization.
 * Arrays preserve order (semantically meaningful); objects sort
 * lexicographically. Exported so tests can independently verify
 * canonicalization (rather than just comparing hash outputs).
 */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const k of keys) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/**
 * Canonical JSON of an MCP tool snapshot. Identical for identical
 * `(name, description, inputSchema)` regardless of input key order or
 * undefined-vs-missing-vs-empty distinctions.
 */
export function canonicalizeMcpToolSchema(snapshot: {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}): string {
  return JSON.stringify({
    name: snapshot.name,
    description: snapshot.description ?? "",
    inputSchema: sortKeys(snapshot.inputSchema ?? {}),
  });
}

/**
 * SHA-256 hex digest of the canonical schema. **Single source of truth
 * for `agsMcpToolKnowledge.schemaHash` and for the validator gate's
 * "live tool" hash comparison.** All callers must delegate here.
 */
export function hashMcpToolSchema(snapshot: {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(canonicalizeMcpToolSchema(snapshot))
    .digest("hex");
}
