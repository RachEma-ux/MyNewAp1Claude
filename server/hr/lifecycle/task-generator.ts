/**
 * HR Lifecycle Task Generator — Auto-generates task sets for onboarding/offboarding cases
 *
 * When a case is created, this service generates the standard task set
 * based on configurable templates. Tasks can be added/removed later.
 */

import { getDb } from "../../db/connection";
import { hrOnboardingTasks, hrOffboardingTasks } from "../../../drizzle/schema";

// ============================================================================
// Onboarding Task Templates
// ============================================================================

interface TaskTemplate {
  category: string;
  title: string;
  description: string;
  assigneeRole: string;
  priority: string;
  relativeDueDays: number; // days relative to planned start date
  sortOrder: number;
}

const ONBOARDING_TASK_TEMPLATES: TaskTemplate[] = [
  // Document collection
  { category: "document_collection", title: "Collect signed employment contract", description: "Obtain signed copy of employment agreement", assigneeRole: "hr", priority: "high", relativeDueDays: -5, sortOrder: 1 },
  { category: "document_collection", title: "Collect identification documents", description: "Verify and file government ID, passport, or equivalent", assigneeRole: "hr", priority: "high", relativeDueDays: -3, sortOrder: 2 },
  { category: "document_collection", title: "Collect tax and banking information", description: "Gather payroll setup documents", assigneeRole: "hr", priority: "high", relativeDueDays: -3, sortOrder: 3 },
  { category: "document_collection", title: "Collect emergency contact details", description: "Record emergency contact information", assigneeRole: "hr", priority: "normal", relativeDueDays: 0, sortOrder: 4 },
  // Equipment setup
  { category: "equipment_setup", title: "Order workstation/laptop", description: "Procure and configure hardware for new hire", assigneeRole: "it", priority: "high", relativeDueDays: -5, sortOrder: 10 },
  { category: "equipment_setup", title: "Setup desk/workspace", description: "Prepare physical workspace", assigneeRole: "manager", priority: "normal", relativeDueDays: -1, sortOrder: 11 },
  // Access provisioning
  { category: "access_provisioning", title: "Create email and system accounts", description: "Setup email, SSO, and core platform access", assigneeRole: "it", priority: "high", relativeDueDays: -2, sortOrder: 20 },
  { category: "access_provisioning", title: "Grant workspace access", description: "Add to relevant workspaces and assign roles", assigneeRole: "manager", priority: "normal", relativeDueDays: 0, sortOrder: 21 },
  { category: "access_provisioning", title: "Setup VPN/remote access", description: "Configure remote access if applicable", assigneeRole: "it", priority: "normal", relativeDueDays: -1, sortOrder: 22 },
  // Orientation
  { category: "orientation", title: "Welcome meeting with manager", description: "Initial 1:1 to discuss role, expectations, and first-week plan", assigneeRole: "manager", priority: "high", relativeDueDays: 0, sortOrder: 30 },
  { category: "orientation", title: "Team introduction session", description: "Meet the team and key stakeholders", assigneeRole: "manager", priority: "normal", relativeDueDays: 1, sortOrder: 31 },
  { category: "orientation", title: "HR orientation session", description: "Review policies, benefits, and company culture", assigneeRole: "hr", priority: "normal", relativeDueDays: 1, sortOrder: 32 },
  // Training
  { category: "training", title: "Complete mandatory compliance training", description: "Security awareness, code of conduct, data protection", assigneeRole: "employee", priority: "high", relativeDueDays: 5, sortOrder: 40 },
  { category: "training", title: "Role-specific tool training", description: "Training on tools and systems used in the role", assigneeRole: "manager", priority: "normal", relativeDueDays: 7, sortOrder: 41 },
  // Compliance
  { category: "compliance", title: "Acknowledge company policies", description: "Review and sign policy acknowledgement forms", assigneeRole: "employee", priority: "high", relativeDueDays: 3, sortOrder: 50 },
];

const OFFBOARDING_TASK_TEMPLATES: TaskTemplate[] = [
  // Knowledge transfer
  { category: "knowledge_transfer", title: "Identify critical knowledge areas", description: "List key processes, relationships, and institutional knowledge", assigneeRole: "manager", priority: "high", relativeDueDays: -14, sortOrder: 1 },
  { category: "knowledge_transfer", title: "Document ongoing projects and handover notes", description: "Prepare written handover for each active project", assigneeRole: "employee", priority: "high", relativeDueDays: -7, sortOrder: 2 },
  { category: "knowledge_transfer", title: "Conduct knowledge transfer sessions", description: "Schedule and run transfer sessions with successors", assigneeRole: "employee", priority: "high", relativeDueDays: -5, sortOrder: 3 },
  // Exit interview
  { category: "exit_interview", title: "Schedule exit interview", description: "Book exit interview with HR", assigneeRole: "hr", priority: "normal", relativeDueDays: -5, sortOrder: 10 },
  { category: "exit_interview", title: "Conduct exit interview", description: "Complete exit interview and document feedback", assigneeRole: "hr", priority: "normal", relativeDueDays: -3, sortOrder: 11 },
  // Access removal
  { category: "access_removal", title: "Revoke system and email access", description: "Disable all platform and email accounts", assigneeRole: "it", priority: "critical", relativeDueDays: 0, sortOrder: 20 },
  { category: "access_removal", title: "Remove workspace assignments", description: "End all active workspace assignments", assigneeRole: "hr", priority: "high", relativeDueDays: 0, sortOrder: 21 },
  { category: "access_removal", title: "Revoke VPN and remote access", description: "Disable VPN, remote desktop, and external service access", assigneeRole: "it", priority: "critical", relativeDueDays: 0, sortOrder: 22 },
  { category: "access_removal", title: "Revoke physical access badges/keys", description: "Collect and deactivate physical access credentials", assigneeRole: "it", priority: "high", relativeDueDays: 0, sortOrder: 23 },
  // Equipment return
  { category: "equipment_return", title: "Return laptop and equipment", description: "Collect all company-owned hardware", assigneeRole: "it", priority: "high", relativeDueDays: 0, sortOrder: 30 },
  { category: "equipment_return", title: "Return company property", description: "Collect keys, badges, credit cards, documents", assigneeRole: "hr", priority: "normal", relativeDueDays: 0, sortOrder: 31 },
  // Final documentation
  { category: "documentation", title: "Process final payroll", description: "Calculate and schedule final pay, accrued leave, etc.", assigneeRole: "finance", priority: "high", relativeDueDays: 0, sortOrder: 40 },
  { category: "documentation", title: "Generate experience/service letter", description: "Prepare formal service letter if requested", assigneeRole: "hr", priority: "normal", relativeDueDays: 3, sortOrder: 41 },
  { category: "documentation", title: "Archive employee records", description: "Archive records per retention policy", assigneeRole: "hr", priority: "normal", relativeDueDays: 5, sortOrder: 42 },
  // Notification
  { category: "notification", title: "Notify team and stakeholders", description: "Communicate departure to relevant parties", assigneeRole: "manager", priority: "normal", relativeDueDays: -7, sortOrder: 50 },
  { category: "notification", title: "Update org chart and directory", description: "Remove from active directory and org chart", assigneeRole: "hr", priority: "normal", relativeDueDays: 0, sortOrder: 51 },
];

/**
 * Compute due date from a reference date and relative day offset.
 */
function computeDueDate(referenceDate: string | null | undefined, relativeDays: number): string | undefined {
  if (!referenceDate) return undefined;
  const d = new Date(referenceDate);
  d.setDate(d.getDate() + relativeDays);
  return d.toISOString().split("T")[0];
}

/**
 * Generate onboarding tasks for a case.
 * Returns the number of tasks created.
 */
export async function generateOnboardingTasks(
  caseId: number,
  plannedStartDate?: string | null,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  const tasks = ONBOARDING_TASK_TEMPLATES.map((t) => ({
    caseId,
    category: t.category,
    title: t.title,
    description: t.description,
    assigneeRole: t.assigneeRole,
    priority: t.priority,
    dueDate: computeDueDate(plannedStartDate, t.relativeDueDays),
    sortOrder: t.sortOrder,
  }));

  await db.insert(hrOnboardingTasks).values(tasks);
  return tasks.length;
}

/**
 * Generate offboarding tasks for a case.
 * Returns the number of tasks created.
 */
export async function generateOffboardingTasks(
  caseId: number,
  lastWorkingDate?: string | null,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  const tasks = OFFBOARDING_TASK_TEMPLATES.map((t) => ({
    caseId,
    category: t.category,
    title: t.title,
    description: t.description,
    assigneeRole: t.assigneeRole,
    priority: t.priority,
    dueDate: computeDueDate(lastWorkingDate, t.relativeDueDays),
    sortOrder: t.sortOrder,
  }));

  await db.insert(hrOffboardingTasks).values(tasks);
  return tasks.length;
}

/** Get the onboarding task template count (for testing) */
export function getOnboardingTemplateCount(): number {
  return ONBOARDING_TASK_TEMPLATES.length;
}

/** Get the offboarding task template count (for testing) */
export function getOffboardingTemplateCount(): number {
  return OFFBOARDING_TASK_TEMPLATES.length;
}
