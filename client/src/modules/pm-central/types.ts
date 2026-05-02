/**
 * PM Central — Public types.
 *
 * Re-exported from `./index.ts` so other modules can typecheck against
 * PM Central shapes without reaching into private files. Keep this
 * file dependency-free and minimal: only the data structures other
 * modules legitimately need to refer to.
 */

export type PMProjectStatus =
  | "draft"
  | "planned"
  | "active"
  | "blocked"
  | "completed"
  | "cancelled"
  | "archived";

export interface PMProjectSummary {
  id: string;
  name: string;
  status: PMProjectStatus;
}

export type PMHandoffStatus =
  | "received"
  | "accepted"
  | "rejected"
  | "converted"
  | "failed";

export interface PMHandoffSummary {
  id: string;
  /** Module key that originated the handoff (e.g. "ps"). */
  sourceModule: string;
  status: PMHandoffStatus;
}

export type PMCentralSubdomain =
  | "dashboard"
  | "projects"
  | "tasks"
  | "milestones"
  | "risks"
  | "issues"
  | "decisions"
  | "handoffs"
  | "settings";
