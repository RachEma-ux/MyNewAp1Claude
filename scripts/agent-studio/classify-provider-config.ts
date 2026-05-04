/**
 * Pure classifier for the Agent Studio provider-config migration.
 *
 * Plan v3 Phase 10. Extracted from
 * `migrate-provider-config-to-bindings.ts` so it can be unit-tested
 * without booting the database or invoking the script's CLI surface.
 *
 * The four shapes (A/B/C/D) and the migration target rules are
 * specified in
 *   docs/architecture/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION.md
 */

export const SECRET_DENYLIST = [
  "apiKey",
  "api_key",
  "pat",
  "PAT",
  "encryptedPat",
  "encrypted_pat",
  "encryptedSecret",
  "encrypted_secret",
  "secret",
  "secretValue",
  "secret_value",
  "Authorization",
  "authorization",
  "x-api-key",
  "Bearer",
  "bearer",
] as const;

/** Field name carrying the env-var hint in the legacy shape. */
export const ENV_VAR_FIELD = "apiKeyEnvVar";

export type ProviderConfigClassificationKind =
  | "raw_api_key"
  | "env_var"
  | "local_provider"
  | "cloud_no_credential"
  | "empty";

export interface ProviderConfigClassification {
  kind: ProviderConfigClassificationKind;
  /** Set only for `env_var`; carries the env var NAME (not the secret). */
  envVarHint: string | null;
  /**
   * Whether the source row should produce a row in
   * `ags_agent_provider_bindings`. False for `empty` only.
   */
  produceBindingRow: boolean;
  /** Resulting `status` if a row is produced. */
  resultingStatus: "binding_v1" | "legacy_unresolved" | null;
  /** Resulting `statusReason` if a row is produced. */
  resultingStatusReason:
    | "legacy_raw_api_key"
    | "legacy_env_var"
    | "legacy_no_credential"
    | "provider_slug_unknown"
    | null;
}

function isLocalProviderType(t: unknown): boolean {
  if (typeof t !== "string") return false;
  const v = t.toLowerCase();
  return (
    v === "ollama" ||
    v === "llama.cpp" ||
    v === "llamacpp" ||
    v === "local"
  );
}

/**
 * Classify a single `ags_agent_drafts.provider_config` jsonb blob.
 * Pure: no I/O, no globals.
 */
export function classifyProviderConfig(
  cfg: Record<string, unknown> | null | undefined,
): ProviderConfigClassification {
  if (!cfg || Object.keys(cfg).length === 0) {
    return {
      kind: "empty",
      envVarHint: null,
      produceBindingRow: false,
      resultingStatus: null,
      resultingStatusReason: null,
    };
  }

  // Shape A — raw apiKey wins regardless of other fields. Even an
  // empty-string apiKey doesn't qualify (treat as missing).
  const apiKey = cfg["apiKey"];
  if (typeof apiKey === "string" && apiKey.length > 0) {
    return {
      kind: "raw_api_key",
      envVarHint: null,
      produceBindingRow: true,
      resultingStatus: "legacy_unresolved",
      resultingStatusReason: "legacy_raw_api_key",
    };
  }

  // Shape B — apiKeyEnvVar present
  const envVar = cfg[ENV_VAR_FIELD];
  if (typeof envVar === "string" && envVar.length > 0) {
    return {
      kind: "env_var",
      envVarHint: envVar,
      produceBindingRow: true,
      resultingStatus: "legacy_unresolved",
      resultingStatusReason: "legacy_env_var",
    };
  }

  // Shape C — provider type but no credential
  const providerType = cfg["providerType"];
  if (isLocalProviderType(providerType)) {
    return {
      kind: "local_provider",
      envVarHint: null,
      produceBindingRow: true,
      resultingStatus: "binding_v1",
      resultingStatusReason: null,
    };
  }

  return {
    kind: "cloud_no_credential",
    envVarHint: null,
    produceBindingRow: true,
    resultingStatus: "legacy_unresolved",
    resultingStatusReason: "legacy_no_credential",
  };
}

/**
 * Build the masked snapshot of the source provider_config used in the
 * evidence report (rollback artifact). Secret-shaped keys become
 * `"<redacted>"`; non-secret metadata is preserved verbatim.
 */
export function maskProviderConfig(
  cfg: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!cfg) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (SECRET_DENYLIST.includes(k as (typeof SECRET_DENYLIST)[number])) {
      out[k] = "<redacted>";
    } else {
      out[k] = v;
    }
  }
  return out;
}
