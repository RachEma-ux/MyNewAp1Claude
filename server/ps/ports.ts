/**
 * PS — Provided ports.
 */
import type { PsProjectSummary } from "./contracts";

export interface PsReadPort {
  list(workspaceId: number): Promise<PsProjectSummary[]>;
  get(projectId: number): Promise<PsProjectSummary | null>;
}
