/**
 * Payload-based publishRequestId resolver — V1+ AS-4 (PR-V1-35).
 *
 * The AS-1 adapter (`createApprovalStepsGovernanceGate`) needs a
 * `ResolvePublishRequestIdFn` — given `(target, payload)`, return
 * the `agsPublishRequests.id` to look approval-steps up by. The
 * existing schema has NO foreign-key link from a publish-target
 * execution to a publish request (the two domains are independent —
 * agent-version releases vs. note→graph promotions), so the resolver
 * has to draw the link from the publish payload itself.
 *
 * Convention (opt-in):
 *   - The caller of `executePublish` sets
 *     `payload.body.publishRequestId` to the `agsPublishRequests.id`
 *     they want approval-steps evaluated against.
 *   - When the field is present AND a positive integer, that's the
 *     resolved id.
 *   - When absent / non-numeric / non-positive, the resolver returns
 *     null. AS-1's gate treats null as `"pending"` — the publish is
 *     blocked until the operator either (a) wires a real id in the
 *     payload OR (b) supplies a per-call `governanceGate`.
 *
 * Defensive null behavior is load-bearing: we NEVER silent-approve
 * when the request linkage is unclear.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No DB / IO. Pure function. No `credential-resolver`, no
 *     `dispatchMcpToolCall`, no `*_API_KEY`, no `neo4j-driver`.
 */

import type { ResolvePublishRequestIdFn } from "./governance-gate-approval-steps.js";

/**
 * Read `payload.body.publishRequestId` as a positive integer. Returns
 * the id when valid, null otherwise.
 *
 * Exported separately from `resolvePublishRequestIdFromPayload` so
 * unit tests can exercise the pure parsing rule against arbitrary
 * inputs without constructing a full gate-input shape.
 */
export function parsePublishRequestIdFromBody(
  body: unknown,
): number | null {
  if (body == null || typeof body !== "object") return null;
  const candidate = (body as { readonly publishRequestId?: unknown })
    .publishRequestId;
  if (typeof candidate !== "number") return null;
  if (!Number.isInteger(candidate)) return null;
  if (candidate <= 0) return null;
  return candidate;
}

/**
 * `ResolvePublishRequestIdFn` impl that pulls the id from
 * `payload.body.publishRequestId`. Use as:
 *
 *   createApprovalStepsGovernanceGate({
 *     resolvePublishRequestId: resolvePublishRequestIdFromPayload,
 *   });
 */
export const resolvePublishRequestIdFromPayload: ResolvePublishRequestIdFn =
  async ({ payload }) => parsePublishRequestIdFromBody(payload.body);
