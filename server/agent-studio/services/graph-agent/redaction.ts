/**
 * Native Graph Workspace — sensitive-payload redaction.
 *
 * Phase 14 §4. Walks decision-trace step inputs/outputs and replaces
 * values matching well-known sensitive patterns (email, API key,
 * bearer token, SSN-shaped 9-digit blocks, JWT) with `"[REDACTED]"`
 * before the trace is exported as Markdown.
 *
 * The redaction is conservative — we scrub VALUE positions in the
 * object tree, not keys. Keys often hold business identifiers
 * (`templateKey`, `packKey`, `userId`) that are NOT sensitive in
 * this audit-trace context; redacting them would defeat the
 * "explain why this answer happened" purpose of the ledger.
 *
 * Pattern set is intentionally small and conservative to avoid
 * false positives. A production-grade redactor would use a
 * configurable pattern registry (out of scope for this PR — the
 * intent here is "redaction exists" per the Phase 14 acceptance
 * criterion).
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md §1.7
 */

const REDACTED = "[REDACTED]";

// Pattern set is conservative — favor known-shape signals over
// broad heuristics so we don't gut benign payloads (e.g. SHA hashes
// shouldn't trigger the API-key path).
const SENSITIVE_PATTERNS: ReadonlyArray<RegExp> = [
  // Email — RFC 5322 simplification (no quoted local parts).
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // JWT — three base64url-encoded sections joined by `.`. Requires
  // the `eyJ` prefix on the header to avoid matching random
  // dotted strings.
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // Bearer token — `Bearer ` followed by a long opaque string.
  /\bBearer\s+[A-Za-z0-9_\-\.]{16,}/gi,
  // OpenAI-style API key (`sk-` + opaque). Matches Anthropic
  // `sk-ant-...` shape too.
  /\bsk-[A-Za-z0-9-]{16,}\b/g,
  // GitHub PAT (classic / fine-grained / app).
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  // Anthropic legacy x-api-key shape.
  /\bxapi-[A-Za-z0-9-]{16,}\b/g,
  // SSN (loose match — XXX-XX-XXXX).
  /\b\d{3}-\d{2}-\d{4}\b/g,
];

function scrubString(value: string): string {
  let scrubbed = value;
  for (const re of SENSITIVE_PATTERNS) {
    scrubbed = scrubbed.replace(re, REDACTED);
  }
  return scrubbed;
}

export function redactSensitivePayload(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redactSensitivePayload(v));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactSensitivePayload(v);
    }
    return out;
  }
  return value;
}

/**
 * Apply redaction to an entire trace ledger row's step inputs/outputs
 * in place via a fresh copy. Returns a new object — the input is not
 * mutated.
 */
export function redactExplanationSteps<
  T extends {
    stepInput: Record<string, unknown> | null;
    stepOutput: Record<string, unknown> | null;
  },
>(steps: T[]): T[] {
  return steps.map((s) => ({
    ...s,
    stepInput: s.stepInput
      ? (redactSensitivePayload(s.stepInput) as Record<string, unknown>)
      : s.stepInput,
    stepOutput: s.stepOutput
      ? (redactSensitivePayload(s.stepOutput) as Record<string, unknown>)
      : s.stepOutput,
  }));
}
