/** Organization Management — Provided ports. */
import type { OmEntitySummary } from "./contracts";

export interface OmReadPort {
  list(workspaceId: number): Promise<OmEntitySummary[]>;
}
