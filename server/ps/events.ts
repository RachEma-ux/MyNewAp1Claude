/**
 * PS — Event types
 */
export const PS_EVENTS = {
  ideationCompleted: "ps.ideation.completed",
  handoffSubmitted: "ps.handoff.submitted",
  handoffAccepted: "ps.handoff.accepted",
  handoffRejected: "ps.handoff.rejected",
} as const;

export type PsEventType = (typeof PS_EVENTS)[keyof typeof PS_EVENTS];
