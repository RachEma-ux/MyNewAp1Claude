/**
 * PS — Handoffs
 *
 * PS produces a single handoff: PS → PM Central.
 *
 * Architectural note: this transfer is a simple ownership change. It uses
 * the Handoff Manager directly. The Coordinator is NOT involved unless
 * the flow expands into a multi-module workflow (e.g. PS → PM Central →
 * Code Studio).
 */
export const PS_HANDOFFS = {
  toPmCentral: "ps.pmCentral",
} as const;

export type PsHandoffType = (typeof PS_HANDOFFS)[keyof typeof PS_HANDOFFS];
