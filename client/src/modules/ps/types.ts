/**
 * Projects System — Public types.
 *
 * Re-exported from `./index.ts` so other modules can typecheck
 * against PS shapes without reaching into private files. Keep this
 * file dependency-free and minimal: only the data structures other
 * modules legitimately need to refer to.
 */

export type PSIdeationStatus =
  | "draft"
  | "in_exploration"
  | "screening"
  | "concept_selected"
  | "ready_for_ps_wizard"
  | "deferred"
  | "rejected"
  | "converted";

export interface PSIdeationSummary {
  id: string;
  title: string;
  status: PSIdeationStatus;
}

export type PSProjectLifecycleStatus =
  | "draft"
  | "validated"
  | "published"
  | "sent_to_pm"
  | "archived";

export interface PSProjectSummary {
  id: string;
  name: string;
  lifecycleStatus: PSProjectLifecycleStatus;
}

/**
 * Payload PS sends when initiating a PM Central handoff. PS UI never
 * constructs PM projects directly — it asks the PS backend to send
 * this payload, and the backend hops to PM Central via Handoff
 * Manager / public API.
 */
export interface PSHandoffPayload {
  sourceProjectId: string;
  sourceIdeationId?: string;
  sourceWizardRunId?: string;
  name: string;
  scenario?: string;
}

export type PSSubdomain =
  | "catalog"
  | "ideation"
  | "wizard"
  | "list"
  | "control-panel"
  | "ai-catalog";
