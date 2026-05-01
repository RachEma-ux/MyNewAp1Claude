/**
 * Sandbox WF — Provided ports.
 */
import type {
  WorkflowExecuteRequest,
  WorkflowExecutionSummary,
} from "./contracts";

export interface SandboxWfExecutePort {
  execute(req: WorkflowExecuteRequest): Promise<WorkflowExecutionSummary>;
  get(runId: string): Promise<WorkflowExecutionSummary | null>;
}
