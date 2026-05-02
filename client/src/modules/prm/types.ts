/**
 * PRM — Public types.
 */

export type PRMCaseStatus =
  | "draft"
  | "open"
  | "in_progress"
  | "blocked"
  | "resolved"
  | "closed"
  | "archived";

export type PRMCaseSeverity = "low" | "medium" | "high" | "critical";

export interface PRMCaseSummary {
  id: string;
  title: string;
  status: PRMCaseStatus;
  severity: PRMCaseSeverity;
}

export type PRMSubdomain =
  | "dashboard"
  | "new"
  | "cases"
  | "methods"
  | "playbooks"
  | "catalog"
  | "ai-catalog"
  | "control-panel";
