/**
 * Vault — attachment quota write-gate (V1+ Phase 15-γ).
 *
 * Phase 15-β (#760) shipped `computeAttachmentQuota` — the read-side
 * surface for "how much storage does this vault hold". This γ slice
 * closes the write-side surface: the operator-supplied per-vault
 * cap is enforced at attachment-creation time so the running total
 * stays inside the budget.
 *
 * Design:
 *   - `assertWithinQuota({ vaultId, sizeBytesAdded, bytesLimit })`
 *     is a pure async function. It calls `computeAttachmentQuota`
 *     to get the current usage, adds the candidate `sizeBytesAdded`,
 *     and throws `AttachmentQuotaExceededError` when the sum exceeds
 *     `bytesLimit`. When `bytesLimit` is null/undefined the guard is
 *     a no-op (unlimited storage; matches the 15-β default).
 *   - Caller migration is intentionally out of scope. Each
 *     attachment-create call site that wants enforcement calls the
 *     guard before invoking `createAttachment`. The guard pattern
 *     keeps the failure path opt-in per call site so operators can
 *     run mixed-policy vaults.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No graph access. Postgres-only.
 *   - No `credential-resolver` import. No raw `process.env.*_API_KEY`.
 *   - No `dispatchMcpToolCall` import. No `neo4j-driver` import.
 */

import { computeAttachmentQuota } from "./attachment-library.js";
import type { ComputeAttachmentQuotaOptions } from "./attachment-library.js";

export class AttachmentQuotaExceededError extends Error {
  readonly code = "attachment_quota_exceeded";
  constructor(
    public readonly vaultId: number,
    public readonly bytesUsed: number,
    public readonly bytesLimit: number,
    public readonly sizeBytesAdded: number,
  ) {
    const projected = bytesUsed + sizeBytesAdded;
    super(
      `Attachment quota exceeded for vault ${vaultId}: ` +
        `current=${bytesUsed}B + new=${sizeBytesAdded}B = ${projected}B > limit=${bytesLimit}B`,
    );
    this.name = "AttachmentQuotaExceededError";
  }
}

export interface AssertWithinQuotaInput {
  readonly vaultId: number;
  /** Size of the candidate attachment in bytes. */
  readonly sizeBytesAdded: number;
  /** Per-vault byte cap. `null` / `undefined` → guard is a no-op. */
  readonly bytesLimit?: number | null;
}

/**
 * Throw `AttachmentQuotaExceededError` when adding `sizeBytesAdded`
 * to the vault's current usage would exceed `bytesLimit`. No-op
 * when `bytesLimit` is null/undefined.
 *
 * Test seam: pass `options.getDb` (forwarded to `computeAttachmentQuota`)
 * to substitute an in-memory store; pass `options.usageOverride` to
 * skip the DB roundtrip entirely (the pure-math path).
 */
export async function assertWithinQuota(
  input: AssertWithinQuotaInput,
  options: ComputeAttachmentQuotaOptions & {
    /** Test seam — pre-computed bytesUsed; bypasses computeAttachmentQuota. */
    readonly usageOverride?: number;
  } = {},
): Promise<void> {
  const bytesLimit = input.bytesLimit ?? null;
  if (bytesLimit === null) return;
  if (input.sizeBytesAdded < 0) {
    // Defensive: negative sizes never satisfy a budget — treat as
    // operator error rather than silent allow.
    throw new AttachmentQuotaExceededError(
      input.vaultId,
      0,
      bytesLimit,
      input.sizeBytesAdded,
    );
  }
  const bytesUsed =
    typeof options.usageOverride === "number"
      ? options.usageOverride
      : (await computeAttachmentQuota(input.vaultId, options)).bytesUsed;
  if (bytesUsed + input.sizeBytesAdded > bytesLimit) {
    throw new AttachmentQuotaExceededError(
      input.vaultId,
      bytesUsed,
      bytesLimit,
      input.sizeBytesAdded,
    );
  }
}

/**
 * Resolve a vault's quota limit from environment if the operator
 * uses the env-based default. Returns null when unset — the guard
 * treats null as "unlimited".
 *
 * Default env key: `AGS_VAULT_ATTACHMENT_BYTES_LIMIT`. Operators
 * with per-workspace policy override the per-call `bytesLimit`
 * directly via the future workspace-settings surface.
 */
export function resolveDefaultAttachmentBytesLimit(): number | null {
  const raw = process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT;
  if (typeof raw !== "string" || raw.length === 0) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
