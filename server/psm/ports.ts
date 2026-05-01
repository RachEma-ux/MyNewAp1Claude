/**
 * PSM — Provided ports (read-side).
 */
import type { PsmMethodSummary } from "./contracts";

export interface PsmReadPort {
  listPublished(workspaceId: number): Promise<PsmMethodSummary[]>;
  get(methodId: number): Promise<PsmMethodSummary | null>;
}
