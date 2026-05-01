/**
 * Code Studio — Handoffs
 *
 * Code Studio accepts "run a template" handoffs from PM Central / Agent
 * Studio / Sandbox WF.
 */
export const CODE_STUDIO_HANDOFFS = {
  runRequested: "codeStudio.run.requested",
} as const;

export type CodeStudioHandoffType =
  (typeof CODE_STUDIO_HANDOFFS)[keyof typeof CODE_STUDIO_HANDOFFS];

export interface CodeStudioRunHandoffPayload {
  templateKey: string;
  inputs: Record<string, unknown>;
  workspaceId: number;
  /** Receipt the source module obtained from Governance for this transfer. */
  governanceReceiptId?: string;
}
