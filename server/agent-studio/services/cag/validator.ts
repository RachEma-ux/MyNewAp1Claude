/**
 * CAG validator — RAC P1B.
 *
 * Walks a `CapabilityPackContent` and returns `{ ok: true }` or
 * `{ ok: false, violations: [...] }`. Validation rules per
 * `RAC_EXECUTION_PLAN.md` §2 P1B and `RAC_TOOL_CLASSIFICATION.md` D-TOOL-3:
 *
 *   - Reject any field shaped like a secret (FORBIDDEN_BINDING_KEYS seed list)
 *   - Reject any field shaped like a RAG chunk (`content` + `embedding` + `source_chunk_id`)
 *   - Reject raw input-schema JSON or example invocations on tools
 *   - Reject quarantined or credential-sensitive tools that slipped through the builder
 *   - Reject tools missing required badges (riskClass, sandbox-required when code_execution)
 *
 * The validator does NOT mutate input; callers decide whether to stop
 * the pack write or to record the violation as a `pack_validation_failed`
 * event and proceed without the offending field.
 */

import { FORBIDDEN_BINDING_KEYS } from "../../bindings";
import type { CapabilityPackContent } from "./types";

export type ValidationResult =
  | { ok: true }
  | { ok: false; violations: string[] };

/**
 * Validate a built pack. Walks the entire JSON tree once; collects
 * every violation rather than failing on the first one (so callers see
 * the full picture).
 */
export function validatePackContent(content: CapabilityPackContent): ValidationResult {
  const violations: string[] = [];

  walkSecretShapedKeys(content, "content", violations);
  walkRagChunkShapes(content, "content", violations);

  for (const tool of content.tools) {
    if (!tool.riskClass) {
      violations.push(`tool ${tool.name}: missing riskClass`);
    }
    if (tool.riskClass === "quarantined") {
      violations.push(`tool ${tool.name}: quarantined tool must not be embedded in CAG`);
    }
    if (tool.riskClass === "credential_sensitive") {
      violations.push(
        `tool ${tool.name}: credential_sensitive tool must not be embedded in CAG`,
      );
    }
    if (tool.riskClass === "code_execution" && !tool.sandboxRequired) {
      violations.push(
        `tool ${tool.name}: code_execution must have sandboxRequired=true (D-TOOL-4)`,
      );
    }
    // D-TOOL-3: forbid raw input schema and example invocations
    const anyTool = tool as unknown as Record<string, unknown>;
    if ("inputSchema" in anyTool) {
      violations.push(`tool ${tool.name}: raw inputSchema is forbidden in CAG (D-TOOL-3)`);
    }
    if ("schema" in anyTool) {
      violations.push(`tool ${tool.name}: raw schema is forbidden in CAG (D-TOOL-3)`);
    }
    if ("examples" in anyTool || "exampleInvocations" in anyTool) {
      violations.push(`tool ${tool.name}: example invocations are forbidden in CAG (D-TOOL-3)`);
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

const SECRET_KEY_SET = new Set(FORBIDDEN_BINDING_KEYS.map((k) => k.toLowerCase()));

function walkSecretShapedKeys(
  node: unknown,
  path: string,
  violations: string[],
): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => walkSecretShapedKeys(child, `${path}[${i}]`, violations));
    return;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (SECRET_KEY_SET.has(k.toLowerCase())) {
      violations.push(`${path}.${k}: forbidden key (matches FORBIDDEN_BINDING_KEYS)`);
    }
    walkSecretShapedKeys(v, `${path}.${k}`, violations);
  }
}

/**
 * Reject any object that looks like a RAG chunk: a plain object
 * carrying `content` AND `embedding`, or a `source_chunk_id` reference.
 * CAG is capability summary; chunked retrieval evidence belongs in the
 * RAC `retrieval-evidence` section (P5), never in the CAG pack.
 */
function walkRagChunkShapes(
  node: unknown,
  path: string,
  violations: string[],
): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => walkRagChunkShapes(child, `${path}[${i}]`, violations));
    return;
  }
  const obj = node as Record<string, unknown>;
  const hasContent = "content" in obj || "chunkText" in obj || "chunk_text" in obj;
  const hasEmbedding = "embedding" in obj || "vector" in obj || "embeddings" in obj;
  const hasChunkRef = "source_chunk_id" in obj || "sourceChunkId" in obj || "chunkId" in obj;
  if ((hasContent && hasEmbedding) || hasChunkRef) {
    violations.push(`${path}: object resembles a RAG chunk; forbidden in CAG`);
    return; // don't double-report nested fields
  }
  for (const [k, v] of Object.entries(obj)) {
    walkRagChunkShapes(v, `${path}.${k}`, violations);
  }
}
