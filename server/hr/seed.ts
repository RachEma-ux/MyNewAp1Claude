/**
 * HR Seed Data — Minimal realistic demo fixtures (Phase 5)
 *
 * Provides a seedHrDemoData() function that inserts demo data
 * for all HR domains when the DB is empty. Safe to call multiple times
 * (inserts are skipped if data already exists).
 */

import { sql, eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  hrPeople,
  hrWorkerProfiles,
  hrEmploymentRecords,
  hrOrgUnits,
  hrPositions,
  hrTrainingCatalog,
  hrLearningAssignments,
  hrCertifications,
  hrEmployeeCertifications,
  hrPerformanceCycles,
  hrGoals,
  hrLeaveTypes,
  hrLeaveRequests,
  hrSalaryBands,
  hrCompensationRecords,
  hrBenefitPlans,
  hrPolicies,
  hrComplianceObligations,
  hrReportDefinitions,
  hrGrievances,
  hrIncidentReports,
  hrTalentReviews,
  hrSuccessionPlans,
  hrSuccessionCandidates,
  hrEngagementPrograms,
  hrSurveyCampaigns,
  hrRiskItems,
} from "../../drizzle/schema";

export async function seedHrDemoData(): Promise<{ seeded: boolean; message: string }> {
  const db = getDb();
  if (!db) return { seeded: false, message: "DB unavailable" };

  // Check if data already exists
  const [existing] = await db.select({ count: sql<number>`count(*)` }).from(hrPeople);
  if ((existing?.count ?? 0) > 0) {
    return { seeded: false, message: "HR data already exists, skipping seed" };
  }

  // === People ===
  const people = await db.insert(hrPeople).values([
    { firstName: "Alice", lastName: "Johnson", displayName: "Alice Johnson", primaryEmail: "alice@demo.com", status: "active" },
    { firstName: "Bob", lastName: "Smith", displayName: "Bob Smith", primaryEmail: "bob@demo.com", status: "active" },
    { firstName: "Carol", lastName: "Williams", displayName: "Carol Williams", primaryEmail: "carol@demo.com", status: "active" },
    { firstName: "David", lastName: "Brown", displayName: "David Brown", primaryEmail: "david@demo.com", status: "active" },
    { firstName: "Eve", lastName: "Davis", displayName: "Eve Davis", primaryEmail: "eve@demo.com", status: "active" },
    { firstName: "Frank", lastName: "Miller", displayName: "Frank Miller", primaryEmail: "frank@demo.com", status: "inactive" },
  ]).returning();

  // === Org Units ===
  const orgUnits = await db.insert(hrOrgUnits).values([
    { name: "Engineering", code: "ENG", type: "department", status: "active" },
    { name: "Human Resources", code: "HR", type: "department", status: "active" },
    { name: "Sales", code: "SALES", type: "department", status: "active" },
  ]).returning();

  // === Positions ===
  const positions = await db.insert(hrPositions).values([
    { title: "Software Engineer", positionCode: "SE-001", orgUnitId: orgUnits[0].id, status: "active" },
    { title: "HR Manager", positionCode: "HR-MGR", orgUnitId: orgUnits[1].id, status: "active" },
    { title: "Sales Rep", positionCode: "SALES-REP", orgUnitId: orgUnits[2].id, status: "active" },
    { title: "Engineering Lead", positionCode: "ENG-LEAD", orgUnitId: orgUnits[0].id, status: "active" },
  ]).returning();

  // === Worker Profiles ===
  const workers = await db.insert(hrWorkerProfiles).values([
    { personId: people[0].id, employeeNumber: "EMP001", workerType: "employee", managerWorkerId: null, homeOrgUnitId: orgUnits[0].id, primaryPositionId: positions[3].id, status: "active" },
    { personId: people[1].id, employeeNumber: "EMP002", workerType: "employee", homeOrgUnitId: orgUnits[0].id, primaryPositionId: positions[0].id, status: "active" },
    { personId: people[2].id, employeeNumber: "EMP003", workerType: "employee", homeOrgUnitId: orgUnits[1].id, primaryPositionId: positions[1].id, status: "active" },
    { personId: people[3].id, employeeNumber: "EMP004", workerType: "contractor", homeOrgUnitId: orgUnits[2].id, primaryPositionId: positions[2].id, status: "active" },
    { personId: people[4].id, employeeNumber: "EMP005", workerType: "employee", homeOrgUnitId: orgUnits[0].id, primaryPositionId: positions[0].id, status: "on_leave" },
    { personId: people[5].id, employeeNumber: "EMP006", workerType: "employee", status: "terminated" },
  ]).returning();

  // Set manager relationships
  await db.update(hrWorkerProfiles).set({ managerWorkerId: workers[0].id }).where(eq(hrWorkerProfiles.id, workers[1].id));
  await db.update(hrWorkerProfiles).set({ managerWorkerId: workers[0].id }).where(eq(hrWorkerProfiles.id, workers[4].id));

  // === Employment Records ===
  await db.insert(hrEmploymentRecords).values([
    { workerId: workers[0].id, employmentStatus: "active", contractType: "permanent", startDate: "2022-01-15", effectiveFrom: "2022-01-15" },
    { workerId: workers[1].id, employmentStatus: "active", contractType: "permanent", startDate: "2022-06-01", effectiveFrom: "2022-06-01" },
    { workerId: workers[2].id, employmentStatus: "active", contractType: "permanent", startDate: "2023-03-01", effectiveFrom: "2023-03-01" },
    { workerId: workers[3].id, employmentStatus: "active", contractType: "fixed_term", startDate: "2024-01-01", endDate: "2025-12-31", effectiveFrom: "2024-01-01" },
    { workerId: workers[4].id, employmentStatus: "active", contractType: "permanent", startDate: "2023-09-15", effectiveFrom: "2023-09-15" },
    { workerId: workers[5].id, employmentStatus: "terminated", contractType: "permanent", startDate: "2021-05-01", endDate: "2025-11-30", effectiveFrom: "2021-05-01" },
  ]);

  // === Training Catalog ===
  const courses = await db.insert(hrTrainingCatalog).values([
    { code: "SEC-101", title: "Security Awareness Training", category: "compliance", isMandatory: true, durationHours: 2, format: "online" },
    { code: "LEAD-201", title: "Leadership Foundations", category: "leadership", durationHours: 8, format: "classroom" },
    { code: "TECH-301", title: "Cloud Architecture", category: "technical", durationHours: 16, format: "blended" },
  ]).returning();

  // === Learning Assignments ===
  await db.insert(hrLearningAssignments).values([
    { workerId: workers[0].id, trainingId: courses[0].id, status: "completed", dueDate: "2025-03-01" },
    { workerId: workers[1].id, trainingId: courses[0].id, status: "assigned", dueDate: "2026-04-15" },
    { workerId: workers[1].id, trainingId: courses[2].id, status: "in_progress", dueDate: "2026-03-01" },
  ]);

  // === Certifications ===
  const certs = await db.insert(hrCertifications).values([
    { code: "AWS-SAA", name: "AWS Solutions Architect – Associate", issuingBody: "Amazon Web Services", validityMonths: 36 },
    { code: "PMP", name: "Project Management Professional", issuingBody: "PMI", validityMonths: 36 },
  ]).returning();

  await db.insert(hrEmployeeCertifications).values([
    { workerId: workers[0].id, certificationId: certs[0].id, obtainedDate: "2024-06-01", expiryDate: "2027-06-01", status: "active" },
    { workerId: workers[1].id, certificationId: certs[0].id, obtainedDate: "2023-01-15", expiryDate: "2026-01-15", status: "active" },
  ]);

  // === Performance Cycles + Goals ===
  const [perfCycle] = await db.insert(hrPerformanceCycles).values([
    { name: "2026 H1 Review", startDate: "2026-01-01", endDate: "2026-06-30", status: "active" },
  ]).returning();

  await db.insert(hrGoals).values([
    { workerId: workers[0].id, cycleId: perfCycle.id, title: "Ship v2.0 release", description: "Deliver main product release by Q2", status: "active", weight: 40 },
    { workerId: workers[1].id, cycleId: perfCycle.id, title: "Complete cloud architecture cert", status: "draft", weight: 30 },
  ]);

  // === Leave Types + Requests ===
  const leaveTypes = await db.insert(hrLeaveTypes).values([
    { code: "ANNUAL", name: "Annual Leave", defaultDaysPerYear: 20, isPaid: true },
    { code: "SICK", name: "Sick Leave", defaultDaysPerYear: 10, isPaid: true },
    { code: "UNPAID", name: "Unpaid Leave", isPaid: false },
  ]).returning();

  await db.insert(hrLeaveRequests).values([
    { workerId: workers[4].id, leaveTypeId: leaveTypes[0].id, startDate: "2026-03-20", endDate: "2026-04-03", totalDays: "10", status: "approved", reason: "Family vacation" },
    { workerId: workers[1].id, leaveTypeId: leaveTypes[1].id, startDate: "2026-04-01", endDate: "2026-04-02", totalDays: "2", status: "pending", reason: "Medical appointment" },
  ]);

  // === Salary Bands + Comp Records ===
  const bands = await db.insert(hrSalaryBands).values([
    { code: "IC2", name: "Individual Contributor 2", currency: "USD", minAmount: "60000", midAmount: "75000", maxAmount: "90000", jobLevel: "IC2" },
    { code: "IC3", name: "Individual Contributor 3", currency: "USD", minAmount: "80000", midAmount: "100000", maxAmount: "120000", jobLevel: "IC3" },
    { code: "M1", name: "Manager 1", currency: "USD", minAmount: "90000", midAmount: "110000", maxAmount: "130000", jobLevel: "M1" },
    { code: "M2", name: "Manager 2", currency: "USD", minAmount: "110000", midAmount: "135000", maxAmount: "160000", jobLevel: "M2" },
  ]).returning();

  await db.insert(hrCompensationRecords).values([
    { workerId: workers[0].id, salaryBandId: bands[3].id, baseSalary: "140000", currency: "USD", effectiveFrom: "2025-01-01", changeReason: "promotion", status: "active" },
    { workerId: workers[1].id, salaryBandId: bands[1].id, baseSalary: "95000", currency: "USD", effectiveFrom: "2024-07-01", changeReason: "hire", status: "active" },
    { workerId: workers[2].id, salaryBandId: bands[2].id, baseSalary: "105000", currency: "USD", effectiveFrom: "2023-03-01", changeReason: "hire", status: "active" },
  ]);

  // === Benefit Plans ===
  await db.insert(hrBenefitPlans).values([
    { code: "HEALTH-STD", name: "Standard Health Plan", category: "health", provider: "BlueCross", isActive: true },
    { code: "DENTAL", name: "Dental Coverage", category: "dental", provider: "DentalCo", isActive: true },
    { code: "401K", name: "401(k) Retirement Plan", category: "retirement", isActive: true },
  ]);

  // === Policies ===
  await db.insert(hrPolicies).values([
    { title: "Code of Conduct", category: "general", status: "published", version: 2, effectiveFrom: "2025-01-01" },
    { title: "Remote Work Policy", category: "workplace", status: "published", version: 1, effectiveFrom: "2024-06-01" },
    { title: "Data Privacy Policy", category: "compliance", status: "published", version: 1, effectiveFrom: "2024-01-01" },
  ]);

  // === Compliance Obligations ===
  await db.insert(hrComplianceObligations).values([
    { title: "Annual SOC 2 Audit", category: "reporting", regulation: "SOC 2 Type II", status: "compliant", dueDate: "2026-06-30" },
    { title: "GDPR Data Inventory", category: "data_privacy", regulation: "GDPR Art. 30", status: "active", dueDate: "2026-12-31" },
  ]);

  // === Report Definitions ===
  await db.insert(hrReportDefinitions).values([
    { name: "Monthly Headcount Report", reportType: "standard", category: "headcount", isActive: true },
    { name: "Quarterly Attrition Report", reportType: "scheduled", category: "attrition", isActive: true },
    { name: "Annual Compensation Review", reportType: "custom", category: "compensation", isActive: true },
  ]);

  // === Grievances ===
  await db.insert(hrGrievances).values([
    { filedByWorkerId: workers[1].id, category: "unfair_treatment", severity: "medium", subject: "Schedule change without notice", description: "Manager changed schedule without prior discussion", status: "filed" },
    { filedByWorkerId: workers[4].id, againstWorkerId: workers[3].id, category: "harassment", severity: "high", subject: "Inappropriate comments", description: "Repeated inappropriate comments in meetings", status: "under_review" },
  ]);

  // === Incident Reports ===
  await db.insert(hrIncidentReports).values([
    { title: "Office slip hazard", description: "Water spill near entrance caused near-miss", category: "near_miss", severity: "low", incidentDate: "2026-03-10", location: "Building A - Lobby", reportedByWorkerId: workers[2].id, status: "reported" },
    { title: "Data access anomaly", description: "Unexpected access pattern detected on HR records", category: "security", severity: "medium", incidentDate: "2026-03-15", reportedByWorkerId: workers[0].id, status: "under_investigation" },
  ]);

  // === Talent Reviews ===
  await db.insert(hrTalentReviews).values([
    { workerId: workers[0].id, reviewerId: workers[2].id, reviewDate: "2026-03-01", performanceRating: "strong", potentialRating: "high", nineBoxPosition: "star", readinessForPromotion: "ready_now", retentionRisk: "medium", status: "finalized" },
    { workerId: workers[1].id, reviewerId: workers[0].id, reviewDate: "2026-03-01", performanceRating: "meets_expectations", potentialRating: "high", nineBoxPosition: "growth", readinessForPromotion: "ready_1yr", retentionRisk: "low", status: "submitted" },
  ]);

  // === Succession Plans ===
  const [succPlan] = await db.insert(hrSuccessionPlans).values([
    { positionId: positions[3].id, positionTitle: "Engineering Lead", criticality: "high", currentIncumbentId: workers[0].id, status: "active" },
  ]).returning();

  await db.insert(hrSuccessionCandidates).values([
    { successionPlanId: succPlan.id, candidateWorkerId: workers[1].id, readiness: "ready_1yr", developmentNeeds: "Leadership training, cross-team collaboration", priority: 1, status: "developing" },
    { successionPlanId: succPlan.id, candidateWorkerId: workers[4].id, readiness: "ready_2yr", priority: 2, status: "nominated" },
  ]);

  // === Engagement Programs ===
  await db.insert(hrEngagementPrograms).values([
    { name: "Mentorship Program", description: "Pair junior and senior engineers for mentoring", category: "mentorship", startDate: "2026-01-15", status: "active", participantCount: 12 },
    { name: "Q2 Team Building", description: "Cross-department team building activities", category: "team_building", startDate: "2026-04-01", endDate: "2026-06-30", status: "planned" },
  ]);

  // === Survey Campaigns ===
  await db.insert(hrSurveyCampaigns).values([
    { title: "Q1 2026 Pulse Survey", surveyType: "pulse", startDate: "2026-03-01", endDate: "2026-03-15", isAnonymous: true, status: "closed", totalInvited: 5, totalResponses: 4 },
    { title: "Q2 2026 Engagement Survey", surveyType: "engagement", startDate: "2026-04-01", endDate: "2026-04-15", isAnonymous: true, status: "draft", totalInvited: 0, totalResponses: 0 },
  ]);

  // === Risk Items ===
  await db.insert(hrRiskItems).values([
    { title: "Key person dependency — Engineering Lead", category: "retention", likelihood: "medium", impact: "high", riskScore: 6, ownerId: workers[2].id, mitigationPlan: "Succession plan in place, cross-training underway", status: "mitigating" },
    { title: "Contractor compliance gap", category: "compliance", likelihood: "low", impact: "medium", riskScore: 2, status: "identified" },
  ]);

  return { seeded: true, message: `Seeded ${people.length} people, ${workers.length} workers, ${orgUnits.length} org units, ${positions.length} positions, and supporting data across all HR domains` };
}
