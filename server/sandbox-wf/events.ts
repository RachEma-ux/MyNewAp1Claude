/**
 * Sandbox WF — Event types
 */
export const SANDBOX_WF_EVENTS = {
  executionStarted: "sandboxWf.execution.started",
  executionCompleted: "sandboxWf.execution.completed",
  executionFailed: "sandboxWf.execution.failed",
} as const;

export type SandboxWfEventType =
  (typeof SANDBOX_WF_EVENTS)[keyof typeof SANDBOX_WF_EVENTS];
