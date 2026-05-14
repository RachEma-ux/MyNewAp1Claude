/**
 * Env-flag-gated default installer for the 18-γ observability lane
 * hooks (PR-V1-82).
 *
 * Mirrors the boot-step installer pattern used elsewhere (AS-4
 * default governance gate / #806 canvas projection sink / #811
 * canvas drain scheduler / #830 canvas drain log forwarder).
 *
 *   AGS_EXTENSIONS_LANE_HOOKS_OBSERVABILITY=on
 *     → installs the observability lane hooks for retrieve /
 *       assemble / compose lanes.
 *
 *   Anything else / unset → no-op.
 *
 * Default OFF. Preserves the pre-existing "no lane hook → α
 * assert+ledger fallback" behavior unless an operator opts in.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No tool-lane registration (the installer composes
 *     `installObservabilityLaneHooks` which iterates the
 *     `CONTRACTED_EXTENSION_LANES` taxonomy excluding `tool`).
 *   - No `credential-resolver` / `*_API_KEY` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` /
 *     `GraphRepository` imports.
 */

import {
  installObservabilityLaneHooks,
  type ObservabilityLaneHookLog,
} from "./lane-hooks-observability.js";

const ENV_KEY = "AGS_EXTENSIONS_LANE_HOOKS_OBSERVABILITY";

export interface MaybeInstallDefaultObservabilityLaneHooksOptions {
  /** Override the env source. Tests inject `{}`. */
  readonly env?: Record<string, string | undefined>;
  /** Override the log sink. Production defaults to `console.log` via
   *  `installObservabilityLaneHooks`. */
  readonly log?: ObservabilityLaneHookLog;
  /** Test seam — override the installer hook so tests can capture
   *  the registration calls without touching the real registry. */
  readonly install?: typeof installObservabilityLaneHooks;
}

export interface MaybeInstallDefaultObservabilityLaneHooksResult {
  readonly installed: boolean;
  readonly installedLanes: ReadonlyArray<"retrieve" | "assemble" | "compose">;
}

export function maybeInstallDefaultObservabilityLaneHooks(
  options: MaybeInstallDefaultObservabilityLaneHooksOptions = {},
): MaybeInstallDefaultObservabilityLaneHooksResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false, installedLanes: [] };
  }
  const install = options.install ?? installObservabilityLaneHooks;
  const { installedLanes } = install({ log: options.log });
  return { installed: true, installedLanes };
}
