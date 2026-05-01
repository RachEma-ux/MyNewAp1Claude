/**
 * PRM — Handoff types
 *
 * PRM does not currently produce or accept module handoffs. The file is
 * here for symmetry and to make adding handoff flows discoverable.
 */

export const PRM_HANDOFFS = {} as const;

export type PrmHandoffType = keyof typeof PRM_HANDOFFS;
