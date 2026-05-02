/**
 * PM Central — Domain Validation
 *
 * Lifecycle and invariant checks. Pure functions; no DB access.
 */

type ProjectStatus =
  | "draft"
  | "planned"
  | "active"
  | "blocked"
  | "completed"
  | "cancelled"
  | "archived";

type PlanStatus = "draft" | "approved" | "active" | "superseded";

type MilestoneStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "missed"
  | "cancelled";

type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "cancelled";

type RiskStatus = "open" | "monitoring" | "mitigated" | "closed";
type IssueStatus = "open" | "in_progress" | "resolved" | "closed";

const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ["planned", "active", "cancelled", "archived"],
  planned: ["active", "blocked", "cancelled", "archived"],
  active: ["blocked", "completed", "cancelled", "archived"],
  blocked: ["active", "cancelled", "archived"],
  completed: ["archived"],
  cancelled: ["archived"],
  archived: [],
};

const PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  draft: ["approved", "superseded"],
  approved: ["active", "superseded"],
  active: ["superseded"],
  superseded: [],
};

const MILESTONE_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  pending: ["in_progress", "completed", "missed", "cancelled"],
  in_progress: ["completed", "missed", "cancelled"],
  completed: [],
  missed: ["in_progress", "cancelled"],
  cancelled: [],
};

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "review", "done", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  review: ["in_progress", "done", "cancelled"],
  done: [],
  cancelled: [],
};

const RISK_TRANSITIONS: Record<RiskStatus, RiskStatus[]> = {
  open: ["monitoring", "mitigated", "closed"],
  monitoring: ["mitigated", "closed", "open"],
  mitigated: ["closed", "monitoring"],
  closed: [],
};

const ISSUE_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  open: ["in_progress", "resolved", "closed"],
  in_progress: ["resolved", "closed", "open"],
  resolved: ["closed", "open"],
  closed: ["open"],
};

function assertTransition<T extends string>(
  domain: string,
  table: Record<T, T[]>,
  from: T,
  to: T,
): void {
  const allowed = table[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid ${domain} status transition: ${from} → ${to}`);
  }
}

export function validateProjectTransition(from: ProjectStatus, to: ProjectStatus): void {
  assertTransition("project", PROJECT_TRANSITIONS, from, to);
}

export function validatePlanTransition(from: PlanStatus, to: PlanStatus): void {
  assertTransition("plan", PLAN_TRANSITIONS, from, to);
}

export function validateMilestoneTransition(from: MilestoneStatus, to: MilestoneStatus): void {
  assertTransition("milestone", MILESTONE_TRANSITIONS, from, to);
}

export function validateTaskTransition(from: TaskStatus, to: TaskStatus): void {
  assertTransition("task", TASK_TRANSITIONS, from, to);
}

export function validateRiskTransition(from: RiskStatus, to: RiskStatus): void {
  assertTransition("risk", RISK_TRANSITIONS, from, to);
}

export function validateIssueTransition(from: IssueStatus, to: IssueStatus): void {
  assertTransition("issue", ISSUE_TRANSITIONS, from, to);
}

export const PROJECT_TERMINAL_STATUSES: ProjectStatus[] = [
  "completed",
  "cancelled",
  "archived",
];
