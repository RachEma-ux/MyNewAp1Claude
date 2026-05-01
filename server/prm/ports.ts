/**
 * PRM — Provided ports (read-side).
 *
 * Other modules may consume PRM via these typed ports. Implementation
 * lives in the PRM module and is registered with the Module Gateway.
 */

import type { PrmMethodSummary } from "./contracts";

export interface PrmReadPort {
  /** List published methods for a workspace. */
  listPublished(workspaceId: number): Promise<PrmMethodSummary[]>;
  /** Get a single method by id. */
  get(methodId: number): Promise<PrmMethodSummary | null>;
}
