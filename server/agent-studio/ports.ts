/**
 * Agent Studio — Provided ports.
 */
import type { AgentStudioRunRequest, AgentStudioRunSummary } from "./contracts";

export interface AgentStudioRunPort {
  submit(req: AgentStudioRunRequest): Promise<AgentStudioRunSummary>;
  get(runId: string): Promise<AgentStudioRunSummary | null>;
}
