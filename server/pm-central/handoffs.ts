/**
 * PM Central — Handoff types
 *
 * PM Central accepts handoffs when other modules (today: PS) need it
 * to own a project record. Producers should `submitHandoff` with one
 * of the literal `type` strings below.
 */

export const PM_CENTRAL_HANDOFFS = {
  receiveFromPs: "pmCentral.project.receiveFromPS",
  convertFromPs: "pmCentral.project.convertFromPS",
} as const;

export type PmCentralHandoffType =
  (typeof PM_CENTRAL_HANDOFFS)[keyof typeof PM_CENTRAL_HANDOFFS];

export interface PsHandoffPayload {
  workspaceId: number;
  sourceModule: "ps";
  sourceProjectId: number;
  sourceIdeationId?: number;
  sourceWizardRunId?: number;
  name: string;
  scenario?: string;
  classification?: string;
  selectedScopeCode?: string;
  selectedScopeLabel?: string;
  confidence?: string | number;
  explainability?: Record<string, unknown>;
  kpiTargets?: unknown[];
  context?: Record<string, unknown>;
  attachments?: unknown[];
  handoffId?: string;
}
