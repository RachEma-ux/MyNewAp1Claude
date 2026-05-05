/**
 * Phase 27.2A — providerConfig forward-write guard.
 *
 * Plan v3 D1 + LK-01 closure: the legacy `ags_agent_drafts.providerConfig`
 * jsonb column historically permitted raw `apiKey` / `apiKeyEnvVar`
 * fields. This guard strips those fields from any providerConfig payload
 * before it reaches the DB, and logs a one-line warning when stripping
 * happens so operators have observability on legacy seed data.
 *
 * Non-secret provider metadata (`provider`, `model`, `temperature`,
 * `maxTokens`, `baseUrl`, `endpoint`, etc.) is preserved verbatim.
 *
 * Why strip rather than throw:
 *
 *   - Legacy seed fixtures (LK-02, LK-03) ship with `apiKeyEnvVar`.
 *     Throwing on read-back would crash legitimate dev flows the moment
 *     a seeded fixture loaded into a draft and was re-saved.
 *   - The runtime credential path is closed by 27.3 + 27.5; this guard
 *     prevents *new* writes from re-introducing raw-key storage.
 *   - The migration script `migrate-provider-config-to-bindings.ts`
 *     handles the at-rest cleanup separately.
 *
 * Once Phase 27.7 lands and all legacy data is migrated, this guard
 * can be tightened to throw in test/dev modes.
 */

const FORBIDDEN_PROVIDER_CONFIG_KEYS: ReadonlyArray<string> = [
  "apiKey",
  "api_key",
  "apiKeyEnvVar",
  "api_key_env_var",
] as const;

export interface SanitizeResult {
  sanitized: Record<string, unknown>;
  removedKeys: string[];
}

/**
 * Strip secret-bearing keys from a providerConfig object before storage.
 *
 * Pure function, no I/O. Logs to `console.warn` when stripping happens
 * so operators can see when a legacy seed or import flow tries to
 * persist a raw key. The log line includes the agent context if
 * provided.
 */
export function sanitizeProviderConfigForStorage(
  providerConfig: Record<string, unknown> | null | undefined,
  context: { agentId?: number; draftId?: number; source?: string } = {},
): SanitizeResult {
  if (!providerConfig || typeof providerConfig !== "object") {
    return { sanitized: {}, removedKeys: [] };
  }
  const removed: string[] = [];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(providerConfig)) {
    if (FORBIDDEN_PROVIDER_CONFIG_KEYS.includes(key)) {
      removed.push(key);
      continue;
    }
    out[key] = value;
  }
  if (removed.length > 0) {
    const ctx = [
      context.agentId !== undefined ? `agentId=${context.agentId}` : null,
      context.draftId !== undefined ? `draftId=${context.draftId}` : null,
      context.source ? `source=${context.source}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    // eslint-disable-next-line no-console
    console.warn(
      `[ProviderConfigGuard] stripped forbidden key(s) [${removed.join(",")}] ` +
        `from providerConfig at write time${ctx ? " (" + ctx + ")" : ""}. ` +
        `Plan v3 LK-01: Agent Studio must not store raw provider keys; ` +
        `bind through the picker UI instead.`,
    );
  }
  return { sanitized: out, removedKeys: removed };
}

/**
 * Convenience: returns just the sanitized object. Use when the caller
 * doesn't need the removedKeys list (most write paths).
 */
export function sanitizeProviderConfig(
  providerConfig: Record<string, unknown> | null | undefined,
  context: { agentId?: number; draftId?: number; source?: string } = {},
): Record<string, unknown> {
  return sanitizeProviderConfigForStorage(providerConfig, context).sanitized;
}

export const __forTests = {
  FORBIDDEN_PROVIDER_CONFIG_KEYS,
};
