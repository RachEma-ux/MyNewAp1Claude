/**
 * HR Reminders — Due-date hooks and lifecycle reminders (Phase 5)
 *
 * Provides pure functions that scan HR tables for upcoming due dates.
 * Each checker returns a list of reminder items ready for notification dispatch.
 * These are not cron-scheduled — they're callable from an API endpoint or job runner.
 */

import { sql, eq, and, or } from "drizzle-orm";
import { getDb } from "../../db/connection";
import {
  hrEmployeeCertifications,
  hrCertifications,
  hrLearningAssignments,
  hrPerformanceReviews,
  hrPerformanceCycles,
  hrLeaveRequests,
  hrSalaryReviewCycles,
  hrComplianceObligations,
} from "../../../drizzle/schema";

export interface Reminder {
  type: string;
  urgency: "info" | "warning" | "critical";
  targetWorkerId?: number;
  entityId: number;
  entityType: string;
  message: string;
  dueDate: string;
}

/**
 * Find employee certifications expiring within N days.
 */
export async function checkCertificationExpiry(daysAhead: number = 30): Promise<Reminder[]> {
  const db = getDb();
  if (!db) return [];

  const cutoff = sql`CURRENT_DATE + ${daysAhead}::int`;
  const rows = await db
    .select({
      id: hrEmployeeCertifications.id,
      workerId: hrEmployeeCertifications.workerId,
      certName: hrCertifications.name,
      expiryDate: hrEmployeeCertifications.expiryDate,
    })
    .from(hrEmployeeCertifications)
    .innerJoin(hrCertifications, eq(hrEmployeeCertifications.certificationId, hrCertifications.id))
    .where(
      and(
        eq(hrEmployeeCertifications.status, "active"),
        sql`${hrEmployeeCertifications.expiryDate} IS NOT NULL`,
        sql`${hrEmployeeCertifications.expiryDate} <= ${cutoff}`,
      )
    )
    .limit(200);

  return rows.map((r) => ({
    type: "certification_expiry",
    urgency: isWithinDays(r.expiryDate, 7) ? "critical" as const : "warning" as const,
    targetWorkerId: r.workerId,
    entityId: r.id,
    entityType: "employee_certification",
    message: `Certification "${r.certName}" expires on ${r.expiryDate}`,
    dueDate: r.expiryDate ?? "",
  }));
}

/**
 * Find overdue learning assignments.
 */
export async function checkOverdueTraining(): Promise<Reminder[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: hrLearningAssignments.id,
      workerId: hrLearningAssignments.workerId,
      dueDate: hrLearningAssignments.dueDate,
    })
    .from(hrLearningAssignments)
    .where(
      and(
        or(
          eq(hrLearningAssignments.status, "assigned"),
          eq(hrLearningAssignments.status, "in_progress"),
        ),
        sql`${hrLearningAssignments.dueDate} IS NOT NULL`,
        sql`${hrLearningAssignments.dueDate} < CURRENT_DATE`,
      )
    )
    .limit(200);

  return rows.map((r) => ({
    type: "training_overdue",
    urgency: "warning" as const,
    targetWorkerId: r.workerId,
    entityId: r.id,
    entityType: "learning_assignment",
    message: `Learning assignment overdue since ${r.dueDate}`,
    dueDate: r.dueDate ?? "",
  }));
}

/**
 * Find performance reviews approaching their due date.
 */
export async function checkReviewsDue(daysAhead: number = 14): Promise<Reminder[]> {
  const db = getDb();
  if (!db) return [];

  const cutoff = sql`CURRENT_DATE + ${daysAhead}::int`;
  const rows = await db
    .select({
      id: hrPerformanceReviews.id,
      workerId: hrPerformanceReviews.workerId,
      dueDate: hrPerformanceCycles.endDate,
    })
    .from(hrPerformanceReviews)
    .innerJoin(hrPerformanceCycles, eq(hrPerformanceReviews.cycleId, hrPerformanceCycles.id))
    .where(
      and(
        or(
          eq(hrPerformanceReviews.status, "pending"),
          eq(hrPerformanceReviews.status, "self_review"),
          eq(hrPerformanceReviews.status, "manager_review"),
        ),
        sql`${hrPerformanceCycles.endDate} IS NOT NULL`,
        sql`${hrPerformanceCycles.endDate} <= ${cutoff}`,
      )
    )
    .limit(200);

  return rows.map((r) => ({
    type: "review_due",
    urgency: isWithinDays(r.dueDate, 3) ? "critical" as const : "warning" as const,
    targetWorkerId: r.workerId,
    entityId: r.id,
    entityType: "performance_review",
    message: `Performance review due on ${r.dueDate}`,
    dueDate: r.dueDate ?? "",
  }));
}

/**
 * Find pending leave requests that haven't been approved/rejected.
 */
export async function checkPendingLeaveApprovals(): Promise<Reminder[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: hrLeaveRequests.id,
      workerId: hrLeaveRequests.workerId,
      startDate: hrLeaveRequests.startDate,
    })
    .from(hrLeaveRequests)
    .where(eq(hrLeaveRequests.status, "pending"))
    .limit(200);

  return rows.map((r) => ({
    type: "leave_pending_approval",
    urgency: "info" as const,
    targetWorkerId: r.workerId,
    entityId: r.id,
    entityType: "leave_request",
    message: `Leave request starting ${r.startDate} awaiting approval`,
    dueDate: r.startDate,
  }));
}

/**
 * Find open salary review cycles approaching end date.
 */
export async function checkSalaryReviewDeadlines(daysAhead: number = 14): Promise<Reminder[]> {
  const db = getDb();
  if (!db) return [];

  const cutoff = sql`CURRENT_DATE + ${daysAhead}::int`;
  const rows = await db
    .select({
      id: hrSalaryReviewCycles.id,
      name: hrSalaryReviewCycles.name,
      endDate: hrSalaryReviewCycles.endDate,
    })
    .from(hrSalaryReviewCycles)
    .where(
      and(
        or(
          eq(hrSalaryReviewCycles.status, "open"),
          eq(hrSalaryReviewCycles.status, "in_review"),
        ),
        sql`${hrSalaryReviewCycles.endDate} <= ${cutoff}`,
      )
    )
    .limit(50);

  return rows.map((r) => ({
    type: "salary_review_deadline",
    urgency: isWithinDays(r.endDate, 5) ? "critical" as const : "warning" as const,
    entityId: r.id,
    entityType: "salary_review_cycle",
    message: `Salary review cycle "${r.name}" ends on ${r.endDate}`,
    dueDate: r.endDate ?? "",
  }));
}

/**
 * Find compliance obligations approaching their due date.
 */
export async function checkComplianceDeadlines(daysAhead: number = 30): Promise<Reminder[]> {
  const db = getDb();
  if (!db) return [];

  const cutoff = sql`CURRENT_DATE + ${daysAhead}::int`;
  const rows = await db
    .select({
      id: hrComplianceObligations.id,
      title: hrComplianceObligations.title,
      dueDate: hrComplianceObligations.dueDate,
      status: hrComplianceObligations.status,
    })
    .from(hrComplianceObligations)
    .where(
      and(
        sql`${hrComplianceObligations.status} NOT IN ('retired', 'waived', 'expired')`,
        sql`${hrComplianceObligations.dueDate} IS NOT NULL`,
        sql`${hrComplianceObligations.dueDate} <= ${cutoff}`,
      )
    )
    .limit(100);

  return rows.map((r) => ({
    type: "compliance_deadline",
    urgency: isWithinDays(r.dueDate, 7) ? "critical" as const : "warning" as const,
    entityId: r.id,
    entityType: "compliance_obligation",
    message: `Compliance obligation "${r.title}" due on ${r.dueDate}`,
    dueDate: r.dueDate ?? "",
  }));
}

/**
 * Run all reminder checks and return combined results.
 */
export async function getAllReminders(): Promise<Reminder[]> {
  const [certs, training, reviews, leave, salary, compliance] = await Promise.all([
    checkCertificationExpiry(),
    checkOverdueTraining(),
    checkReviewsDue(),
    checkPendingLeaveApprovals(),
    checkSalaryReviewDeadlines(),
    checkComplianceDeadlines(),
  ]);
  return [...certs, ...training, ...reviews, ...leave, ...salary, ...compliance];
}

// Helper
function isWithinDays(dateStr: string | null | undefined, days: number): boolean {
  if (!dateStr) return false;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff >= 0 && diff <= days * 86400000;
}
