/**
 * PM Central — Provided port interfaces
 *
 * In-process typed interfaces other modules may depend on instead of
 * doing a gateway round-trip. PM Central owns no runtime port (no
 * external endpoint); these are pure read interfaces.
 */

import type { PmCentralSummary } from "./contracts";

export interface PmCentralReadPort {
  getProject(id: number): Promise<{ id: number; workspaceId: number; name: string; status: string } | null>;
  listProjects(filters: {
    workspaceId: number;
    status?: string;
    limit?: number;
  }): Promise<Array<{ id: number; name: string; status: string }>>;
  summary(workspaceId: number): Promise<PmCentralSummary>;
}

export interface PmCentralHandoffPort {
  /** Submit a PS → PM handoff payload via the canonical handoff lane. */
  submitPsHandoff(payload: {
    workspaceId: number;
    sourceProjectId: number;
    name: string;
    [k: string]: unknown;
  }): Promise<{ accepted: boolean; pmProjectId?: number; reason?: string }>;
}
