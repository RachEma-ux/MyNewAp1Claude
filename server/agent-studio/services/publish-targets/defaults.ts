/**
 * Default pusher registrations — V1+ Phase 19-β.
 *
 * Wires up minimum-viable pushers for the three `PublishTargetType`
 * values defined in PR-V1-2 (#749). All three use the shared
 * `makeHttpPusher` factory; they differ only in HTTP method, path
 * suffix, content-type, and credential header — operator-tunable per
 * registration option.
 *
 * Boot wiring:
 *   `registerDefaultPublishPushers()` is called from `boot.ts` at
 *   startup with the operator-supplied `credentialFn`. Tests pass
 *   an injected `fetchImpl` to exercise the wire-up without network
 *   I/O.
 *
 * Per-type defaults (operator can override via registration options):
 *   - `staging_env`   → POST `<endpoint>/promote` with
 *                       Authorization: Bearer
 *   - `remote_vault`  → PUT  `<endpoint>/vault/notes` with
 *                       Authorization: Bearer
 *   - `external_kb`   → POST `<endpoint>/ingest` with
 *                       X-API-Key (no Bearer prefix — most KB APIs
 *                       reject Bearer for API keys)
 *
 * Hard-rule compliance (Plan v3 D2 + CLAUDE.md):
 *   - No `credential-resolver` import. The `credentialFn` is
 *     supplied by the registrant.
 *   - No raw `process.env.*_API_KEY` reads in this file. Source-scan
 *     tested.
 *   - No graph mutation.
 */

import { registerPublishPusher } from "./registry.js";
import {
  makeHttpPusher,
  type MakeHttpPusherOptions,
} from "./http-pusher.js";
import type { PublishTargetType, PublishTargetRecord } from "./types.js";

export type CredentialFn = (
  target: PublishTargetRecord,
) => Promise<string | null>;

export interface RegisterDefaultPublishPushersOptions {
  /** Credential acquisition closure. Required for the factory but
   *  may return null (unauthenticated request). */
  readonly credentialFn?: CredentialFn;
  /** Test seam — injected fetch for unit tests. */
  readonly fetchImpl?: typeof fetch;
  /** Per-type override of factory options (path, headers, etc.). */
  readonly overrides?: Partial<
    Record<PublishTargetType, Partial<MakeHttpPusherOptions>>
  >;
}

const DEFAULT_CONFIGS: Record<PublishTargetType, MakeHttpPusherOptions> = {
  staging_env: {
    method: "POST",
    pathSuffix: "/promote",
    contentType: "application/json",
    credentialHeader: "Authorization",
    useBearerPrefix: true,
  },
  remote_vault: {
    method: "PUT",
    pathSuffix: "/vault/notes",
    contentType: "application/json",
    credentialHeader: "Authorization",
    useBearerPrefix: true,
  },
  external_kb: {
    method: "POST",
    pathSuffix: "/ingest",
    contentType: "application/json",
    credentialHeader: "X-API-Key",
    useBearerPrefix: false,
  },
};

/**
 * Register the three default pushers in the in-process registry.
 * Idempotent — re-invocation replaces the previously-registered
 * pusher for each type. Returns the list of registered target types
 * so callers can audit the wire-up.
 */
export function registerDefaultPublishPushers(
  opts: RegisterDefaultPublishPushersOptions = {},
): PublishTargetType[] {
  const types: PublishTargetType[] = [
    "staging_env",
    "remote_vault",
    "external_kb",
  ];
  for (const t of types) {
    const baseConfig = DEFAULT_CONFIGS[t];
    const override = opts.overrides?.[t] ?? {};
    const config: MakeHttpPusherOptions = {
      ...baseConfig,
      ...override,
      credentialFn: override.credentialFn ?? opts.credentialFn,
      fetchImpl: override.fetchImpl ?? opts.fetchImpl,
    };
    registerPublishPusher(t, makeHttpPusher(config));
  }
  return types;
}
