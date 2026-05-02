/**
 * PSM — Public types.
 */

export type PSMSubdomain =
  | "dashboard"
  | "library"
  | "selector"
  | "cases"
  | "methods"
  | "runs"
  | "admin"
  | "analytics"
  | "ai-catalog";

export type PSMCaseStatus =
  | "draft"
  | "open"
  | "in_progress"
  | "blocked"
  | "resolved"
  | "closed"
  | "archived";

export interface PSMCaseSummary {
  id: string;
  title: string;
  status: PSMCaseStatus;
}
