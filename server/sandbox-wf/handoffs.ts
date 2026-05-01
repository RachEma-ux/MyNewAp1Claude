/**
 * Sandbox WF — Handoffs
 */
export const SANDBOX_WF_HANDOFFS = {
  executeRequested: "sandboxWf.execute.requested",
} as const;

export type SandboxWfHandoffType =
  (typeof SANDBOX_WF_HANDOFFS)[keyof typeof SANDBOX_WF_HANDOFFS];
