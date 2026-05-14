/**
 * Default governance-gate boot installer — V1+ AS-4 (PR-V1-35).
 *
 * Composes the AS-1 adapter (`createApprovalStepsGovernanceGate`)
 * with the AS-4 payload-based resolver
 * (`resolvePublishRequestIdFromPayload`) and registers the result
 * via the AS-2 installer (`installDefaultGovernanceGate`).
 *
 * Default OFF — opt-in via env flag.
 *
 * Why opt-in:
 *   Installing this gate as the production default would turn every
 *   `executePublish()` call into `pending` unless the caller includes
 *   `payload.body.publishRequestId`. That's the desired behavior for
 *   environments wired to the approval-steps flow, but it breaks
 *   pre-existing publish flows that don't yet carry the request id.
 *   The env flag lets operators flip the gate on once their callers
 *   are wired, without changing the production default behavior on
 *   first install.
 *
 * Env flag (read once at boot — caller's responsibility to re-call
 * if the env changes mid-process):
 *
 *   AGS_PUBLISH_GOVERNANCE_GATE=approval_steps_payload_resolver
 *     ⇒ installs the composed AS-1 + AS-4 gate.
 *   AGS_PUBLISH_GOVERNANCE_GATE  (any other value, or unset)
 *     ⇒ no-op (preserves existing "no gate ⇒ approved" behavior).
 *
 * Hard-rule compliance:
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` imports.
 *   - Idempotent: re-calling overwrites the prior install via AS-2's
 *     `installDefaultGovernanceGate` semantics.
 */

import { installDefaultGovernanceGate } from "./default-governance-gate.js";
import { createApprovalStepsGovernanceGate } from "./governance-gate-approval-steps.js";
import { resolvePublishRequestIdFromPayload } from "./payload-publish-request-id-resolver.js";
import type { GovernanceGateFn } from "./types.js";

export const PUBLISH_GOVERNANCE_GATE_ENV_VAR = "AGS_PUBLISH_GOVERNANCE_GATE";

export const APPROVAL_STEPS_PAYLOAD_RESOLVER_MODE =
  "approval_steps_payload_resolver" as const;

export type DefaultGovernanceGateMode =
  | typeof APPROVAL_STEPS_PAYLOAD_RESOLVER_MODE
  | "off";

export interface MaybeInstallDefaultGovernanceGateOptions {
  /** Test seam — override process.env lookup. */
  readonly env?: NodeJS.ProcessEnv;
  /** Test seam — override the installer (defaults to AS-2's
   *  `installDefaultGovernanceGate`). */
  readonly install?: (gate: GovernanceGateFn) => void;
  /** Test seam — override the gate factory (defaults to AS-1's
   *  `createApprovalStepsGovernanceGate`). */
  readonly makeGate?: () => GovernanceGateFn;
}

export interface MaybeInstallDefaultGovernanceGateResult {
  readonly mode: DefaultGovernanceGateMode;
  readonly installed: boolean;
}

/**
 * Read the env flag and install (or skip) the default gate.
 *
 * Returns `{ mode, installed }` so callers (boot step) can log the
 * decision. `mode` is the closed enum the gate was installed against
 * (or `"off"` when no flag was set). `installed` mirrors `mode !==
 * "off"` for callers that only need the boolean.
 */
export function maybeInstallDefaultGovernanceGate(
  options: MaybeInstallDefaultGovernanceGateOptions = {},
): MaybeInstallDefaultGovernanceGateResult {
  const env = options.env ?? process.env;
  const flag = env[PUBLISH_GOVERNANCE_GATE_ENV_VAR];

  if (flag !== APPROVAL_STEPS_PAYLOAD_RESOLVER_MODE) {
    return { mode: "off", installed: false };
  }

  const makeGate =
    options.makeGate ??
    (() =>
      createApprovalStepsGovernanceGate({
        resolvePublishRequestId: resolvePublishRequestIdFromPayload,
      }));
  const install = options.install ?? installDefaultGovernanceGate;

  install(makeGate());
  return { mode: APPROVAL_STEPS_PAYLOAD_RESOLVER_MODE, installed: true };
}
