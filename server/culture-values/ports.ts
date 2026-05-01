/** Culture Values — Provided ports. */
import type { CvValueSummary } from "./contracts";

export interface CvReadPort {
  list(workspaceId: number): Promise<CvValueSummary[]>;
}
