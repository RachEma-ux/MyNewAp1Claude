/**
 * Code Studio — Provided ports.
 */
import type { CodeStudioRunRequest, CodeStudioRunSummary } from "./contracts";

export interface CodeStudioRunPort {
  /** Submit a run request. Returns a run summary in `pending` state. */
  submit(req: CodeStudioRunRequest): Promise<CodeStudioRunSummary>;
  /** Look up a run. */
  get(runId: string): Promise<CodeStudioRunSummary | null>;
}
