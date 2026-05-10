/**
 * Phase 6 (Roadmap V3) — Lightweight Runtime Config Schema Governance.
 *
 * Adds `schemaVersion` to nine runtime config jsonb blocks on
 * `agsAgentDrafts`. Initially supports only `"1.0.0"`; any other
 * value is rejected at the write boundary. **No migration engine** —
 * the contract is "we know exactly one shape today; future versions
 * get a migration only when schema drift actually surfaces" (per
 * roadmap §6 + Principle 5 scope discipline).
 *
 * Design choice — sibling field, not wrapper. The roadmap example
 * shows `{ schemaVersion: "1.0.0", data: { ... } }`. A wrapper is
 * structurally cleaner but every existing reader (chat-stream, chat,
 * simulation, governance, RAC) would break on day one. The sibling
 * shape `{ schemaVersion: "1.0.0", ...existingFields }` is additive:
 * readers ignore unknown keys, the constraint is enforced at the
 * write boundary, and a future migration can flip to wrapper form
 * by bumping schemaVersion → "2.0.0" with a one-shot rewriter.
 *
 * The version constant is intentionally NOT a union type —
 * `SUPPORTED_VERSIONS` is the runtime-checked set. A future
 * "1.1.0" lands here as a single-line append + a doc-comment
 * explaining the additive change.
 */

export const RUNTIME_CONFIG_SCHEMA_VERSION = "1.0.0";

/**
 * The set of versions this runtime accepts. Today: just 1.0.0.
 * When a future schema introduces an additive change, append the
 * new version here AND document the diff inline. When a breaking
 * change ships, the prior version is REMOVED and a one-shot
 * migration rewriter is run against ASDB before the deploy.
 */
export const SUPPORTED_RUNTIME_CONFIG_VERSIONS: ReadonlySet<string> = new Set([
  "1.0.0",
]);

/**
 * The nine config-block keys on `agsAgentDrafts` whose contents are
 * governed by this schema. Listed in source order matching the
 * Drizzle schema declaration so a reader can scan both files in
 * lockstep.
 */
export const RUNTIME_CONFIG_BLOCK_NAMES = [
  "memoryConfig",
  "knowledgeConfig",
  "workflowConfig",
  "governancePolicy",
  "runtimeConfig",
  "simulationDefaults",
  "providerConfig",
  "scheduleConfig",
  "statusLineConfig",
] as const;

export type RuntimeConfigBlockName = (typeof RUNTIME_CONFIG_BLOCK_NAMES)[number];

export type ValidateConfigSchemaResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "schema_version_unsupported"
        | "schema_version_wrong_type"
        | "block_not_object";
      observedVersion?: unknown;
    };

/**
 * Validate the `schemaVersion` field on a single config block.
 *
 * Tolerant on absence: a block with no `schemaVersion` is treated as
 * `1.0.0` implicit. This is the backward-compat door — existing
 * `agsAgentDrafts` rows pre-date Phase 6 and can't be retroactively
 * stamped without an unscoped DB migration. Stamping happens at the
 * next write through `stampConfigSchemaVersion` so live data
 * naturally drifts toward explicit-version state.
 *
 * Rejects:
 *  - non-string `schemaVersion` (`schema_version_wrong_type`)
 *  - string not in `SUPPORTED_RUNTIME_CONFIG_VERSIONS`
 *    (`schema_version_unsupported`)
 *  - non-object block (`block_not_object`)
 */
export function validateConfigSchemaVersion(
  block: unknown,
): ValidateConfigSchemaResult {
  if (block === null || typeof block !== "object" || Array.isArray(block)) {
    return { ok: false, reason: "block_not_object" };
  }
  const v = (block as { schemaVersion?: unknown }).schemaVersion;
  if (v === undefined) return { ok: true };
  if (typeof v !== "string") {
    return { ok: false, reason: "schema_version_wrong_type", observedVersion: v };
  }
  if (!SUPPORTED_RUNTIME_CONFIG_VERSIONS.has(v)) {
    return {
      ok: false,
      reason: "schema_version_unsupported",
      observedVersion: v,
    };
  }
  return { ok: true };
}

/**
 * Stamp a config block with the current schema version, preserving
 * any existing valid version. Used by the write boundary
 * (`repository.updateDraft`) so every persisted block carries the
 * version stamp.
 *
 * Returns a NEW object — does not mutate the input. Empty / undefined
 * input is treated as `{}` so callers don't have to null-check.
 */
export function stampConfigSchemaVersion<T extends Record<string, unknown>>(
  block: T | undefined | null,
): T & { schemaVersion: string } {
  const base = (block ?? {}) as T;
  const existing = (base as { schemaVersion?: unknown }).schemaVersion;
  // Preserve a valid existing stamp; otherwise overwrite with the
  // current canonical version.
  if (
    typeof existing === "string" &&
    SUPPORTED_RUNTIME_CONFIG_VERSIONS.has(existing)
  ) {
    return base as T & { schemaVersion: string };
  }
  return { ...base, schemaVersion: RUNTIME_CONFIG_SCHEMA_VERSION } as T &
    { schemaVersion: string };
}

/**
 * Throw on validation failure. Used by the write boundary to
 * fail-fast when an inbound patch carries an explicit unsupported
 * `schemaVersion` (typically a writer that hasn't been updated to
 * match a runtime bump). The error message is structured so
 * forensics can grep audit logs for the stable token.
 */
export function assertConfigSchemaVersion(
  block: unknown,
  blockName: RuntimeConfigBlockName,
): void {
  const r = validateConfigSchemaVersion(block);
  if (r.ok) return;
  throw new Error(
    `[config_schema_${r.reason}] ${blockName} ` +
      `rejected: ${r.reason}` +
      (r.observedVersion !== undefined
        ? ` observed=${JSON.stringify(r.observedVersion)} ` +
          `supported=${JSON.stringify([...SUPPORTED_RUNTIME_CONFIG_VERSIONS])}`
        : ""),
  );
}
