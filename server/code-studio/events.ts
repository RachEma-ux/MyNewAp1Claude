/**
 * Code Studio — Event types
 */
export const CODE_STUDIO_EVENTS = {
  runCompleted: "codeStudio.run.completed",
  runFailed: "codeStudio.run.failed",
  runStarted: "codeStudio.run.started",
} as const;

export type CodeStudioEventType =
  (typeof CODE_STUDIO_EVENTS)[keyof typeof CODE_STUDIO_EVENTS];

export interface CodeStudioRunCompletedPayload {
  runId: string;
  templateKey: string;
  durationMs: number;
}
