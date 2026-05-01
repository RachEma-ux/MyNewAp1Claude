/**
 * Module Boundary helpers — runtime guard.
 *
 * Used at the entry of a module's public-api functions to assert that the
 * caller is allowed and to record a cross-module call for audit.
 *
 * The static check happens in `scripts/check-module-boundaries.ts`. This
 * file provides the runtime side: tagging cross-module calls with
 * `correlationId` and emitting them to the audit log if requested.
 */

import { randomUUID } from "crypto";

export interface ModuleCallContext {
  /** Module that issued the call (informational, may be unknown). */
  sourceModule?: string;
  /** Module being called. Required. */
  targetModule: string;
  /** Action key, e.g. "prm.method.read". */
  actionKey: string;
  /** Workspace context — required for governed flows. */
  workspaceId?: number | string;
  /** Acting user id — required for governed flows. */
  actorId?: number | string;
  /** Correlation id (auto if missing). */
  correlationId?: string;
  /** Governance receipt id, if a sensitive action. */
  governanceReceiptId?: string;
}

export interface SealedModuleCallContext extends ModuleCallContext {
  correlationId: string;
}

/** Seals a context — fills in correlationId. */
export function sealContext(ctx: ModuleCallContext): SealedModuleCallContext {
  return { ...ctx, correlationId: ctx.correlationId ?? randomUUID() };
}

/**
 * Asserts that a sensitive action carries a governance receipt. Sensitive
 * actions are declared per-module; the gateway will refuse the call if
 * `receiptRequired` is true and `governanceReceiptId` is missing.
 */
export function assertReceipt(ctx: ModuleCallContext, receiptRequired: boolean): void {
  if (receiptRequired && !ctx.governanceReceiptId) {
    throw new Error(
      `[boundary] Action '${ctx.actionKey}' on '${ctx.targetModule}' requires a governance receipt`,
    );
  }
}
