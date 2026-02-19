/**
 * Provider Connection State Machine
 *
 * Enforces valid lifecycle transitions:
 *   draft → validated → active → failed → disabled
 *                                  ↑
 *                               rotated → active
 *
 * Invalid transitions are rejected at this layer.
 */
import type { ProviderConnectionStatus } from "../../drizzle/schema";

const VALID_TRANSITIONS: Record<ProviderConnectionStatus, ProviderConnectionStatus[]> = {
  draft:     ["validated"],
  validated: ["active"],
  active:    ["failed", "disabled"],
  failed:    ["disabled", "validated"],   // can re-test after failure
  disabled:  ["draft"],                   // re-enable starts fresh
  rotated:   ["active"],
};

export function canTransition(
  from: ProviderConnectionStatus,
  to: ProviderConnectionStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(
  from: ProviderConnectionStatus,
  to: ProviderConnectionStatus
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid state transition: ${from} → ${to}. ` +
      `Allowed from '${from}': [${VALID_TRANSITIONS[from]?.join(", ") ?? "none"}]`
    );
  }
}
