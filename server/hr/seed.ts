/**
 * HR Seed Data — Expanded realistic demo fixtures (Phase 7)
 *
 * Provides a seedHrDemoData() function that inserts demo data
 * for all HR domains when the DB is empty. Safe to call multiple times
 * (inserts are skipped if data already exists).
 *
 * Dataset: 28 employees across 9 org units covering Executive, HR,
 * Engineering, Product, Design, QA, Finance, Operations, Compliance/Security,
 * and Support with realistic manager hierarchies and workspace assignments.
 */

import { sql, eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  hrPeople,
  hrWorkerProfiles,
  hrEmploymentRecords,
  hrOrgUnits,
  hrPositions,
  hrWorkerSkills,
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

  // =========================================================================
  // People — 28 employees
  // =========================================================================
  const people = await db.insert(hrPeople).values([
    // 0  — CEO / Executive leader
    { firstName: "Alice", lastName: "Johnson", displayName: "Alice Johnson", primaryEmail: "alice@demo.com", primaryPhone: "+1-555-0100", status: "active" },
    // 1  — Engineering Director
    { firstName: "Bob", lastName: "Smith", displayName: "Bob Smith", primaryEmail: "bob@demo.com", primaryPhone: "+1-555-0101", status: "active" },
    // 2  — HR Director / Head of People
    { firstName: "Carol", lastName: "Williams", displayName: "Carol Williams", primaryEmail: "carol@demo.com", primaryPhone: "+1-555-0102", status: "active" },
    // 3  — Product Director
    { firstName: "David", lastName: "Brown", displayName: "David Brown", primaryEmail: "david@demo.com", primaryPhone: "+1-555-0103", status: "active" },
    // 4  — Engineering Manager (Frontend)
    { firstName: "Eve", lastName: "Davis", displayName: "Eve Davis", primaryEmail: "eve@demo.com", primaryPhone: "+1-555-0104", status: "active" },
    // 5  — Engineering Manager (Backend)
    { firstName: "Frank", lastName: "Miller", displayName: "Frank Miller", primaryEmail: "frank@demo.com", primaryPhone: "+1-555-0105", status: "active" },
    // 6  — Senior Software Engineer
    { firstName: "Grace", lastName: "Wilson", displayName: "Grace Wilson", primaryEmail: "grace@demo.com", status: "active" },
    // 7  — Software Engineer
    { firstName: "Henry", lastName: "Taylor", displayName: "Henry Taylor", primaryEmail: "henry@demo.com", status: "active" },
    // 8  — Software Engineer
    { firstName: "Irene", lastName: "Anderson", displayName: "Irene Anderson", primaryEmail: "irene@demo.com", status: "active" },
    // 9  — Software Engineer
    { firstName: "Jack", lastName: "Thomas", displayName: "Jack Thomas", primaryEmail: "jack@demo.com", status: "active" },
    // 10 — Software Engineer
    { firstName: "Karen", lastName: "Martinez", displayName: "Karen Martinez", primaryEmail: "karen@demo.com", status: "active" },
    // 11 — Software Engineer (on leave)
    { firstName: "Leo", lastName: "Garcia", displayName: "Leo Garcia", primaryEmail: "leo@demo.com", status: "active" },
    // 12 — Product Manager
    { firstName: "Mia", lastName: "Rodriguez", displayName: "Mia Rodriguez", primaryEmail: "mia@demo.com", status: "active" },
    // 13 — Product Manager
    { firstName: "Nathan", lastName: "Lee", displayName: "Nathan Lee", primaryEmail: "nathan@demo.com", status: "active" },
    // 14 — Senior Designer
    { firstName: "Olivia", lastName: "Harris", displayName: "Olivia Harris", primaryEmail: "olivia@demo.com", status: "active" },
    // 15 — Designer
    { firstName: "Paul", lastName: "Clark", displayName: "Paul Clark", primaryEmail: "paul@demo.com", status: "active" },
    // 16 — QA Lead
    { firstName: "Quinn", lastName: "Lewis", displayName: "Quinn Lewis", primaryEmail: "quinn@demo.com", status: "active" },
    // 17 — QA Engineer
    { firstName: "Rachel", lastName: "Walker", displayName: "Rachel Walker", primaryEmail: "rachel@demo.com", status: "active" },
    // 18 — QA Engineer
    { firstName: "Sam", lastName: "Hall", displayName: "Sam Hall", primaryEmail: "sam@demo.com", status: "active" },
    // 19 — HRBP
    { firstName: "Tina", lastName: "Young", displayName: "Tina Young", primaryEmail: "tina@demo.com", status: "active" },
    // 20 — HRBP / People Ops
    { firstName: "Uma", lastName: "King", displayName: "Uma King", primaryEmail: "uma@demo.com", status: "active" },
    // 21 — Recruiter
    { firstName: "Victor", lastName: "Wright", displayName: "Victor Wright", primaryEmail: "victor@demo.com", status: "active" },
    // 22 — Finance / Admin Lead
    { firstName: "Wendy", lastName: "Scott", displayName: "Wendy Scott", primaryEmail: "wendy@demo.com", status: "active" },
    // 23 — Operations Lead
    { firstName: "Xavier", lastName: "Green", displayName: "Xavier Green", primaryEmail: "xavier@demo.com", status: "active" },
    // 24 — Security / Compliance Lead
    { firstName: "Yara", lastName: "Adams", displayName: "Yara Adams", primaryEmail: "yara@demo.com", status: "active" },
    // 25 — Support / Customer Ops Lead
    { firstName: "Zach", lastName: "Baker", displayName: "Zach Baker", primaryEmail: "zach@demo.com", status: "active" },
    // 26 — Business / Workspace Ops
    { firstName: "Amy", lastName: "Nelson", displayName: "Amy Nelson", primaryEmail: "amy@demo.com", status: "active" },
    // 27 — Business / Workspace Ops (terminated)
    { firstName: "Brian", lastName: "Carter", displayName: "Brian Carter", primaryEmail: "brian@demo.com", status: "inactive" },
  ]).returning();

  // =========================================================================
  // Org Units — 9 departments
  // =========================================================================
  const orgUnits = await db.insert(hrOrgUnits).values([
    // 0 — Executive
    { name: "Executive", code: "EXEC", type: "division", status: "active" },
    // 1 — Engineering
    { name: "Engineering", code: "ENG", type: "department", status: "active" },
    // 2 — Human Resources
    { name: "Human Resources", code: "HR", type: "department", status: "active" },
    // 3 — Product
    { name: "Product", code: "PROD", type: "department", status: "active" },
    // 4 — Design
    { name: "Design", code: "DESIGN", type: "department", status: "active" },
    // 5 — Quality Assurance
    { name: "Quality Assurance", code: "QA", type: "department", status: "active" },
    // 6 — Finance & Admin
    { name: "Finance & Admin", code: "FIN", type: "department", status: "active" },
    // 7 — Operations
    { name: "Operations", code: "OPS", type: "department", status: "active" },
    // 8 — Compliance & Security
    { name: "Compliance & Security", code: "COMP-SEC", type: "department", status: "active" },
  ]).returning();

  // Set org unit hierarchy — all departments report to Executive
  for (const ou of orgUnits.slice(1)) {
    await db.update(hrOrgUnits).set({ parentOrgUnitId: orgUnits[0].id }).where(eq(hrOrgUnits.id, ou.id));
  }

  // =========================================================================
  // Positions — 28 positions covering all departments
  // =========================================================================
  const positions = await db.insert(hrPositions).values([
    // 0  — EXEC
    { title: "Chief Executive Officer", positionCode: "EXEC-CEO", orgUnitId: orgUnits[0].id, status: "filled" },
    // 1  — ENG Director
    { title: "Engineering Director", positionCode: "ENG-DIR", orgUnitId: orgUnits[1].id, status: "filled" },
    // 2  — HR Director
    { title: "HR Director", positionCode: "HR-DIR", orgUnitId: orgUnits[2].id, status: "filled" },
    // 3  — Product Director
    { title: "Product Director", positionCode: "PROD-DIR", orgUnitId: orgUnits[3].id, status: "filled" },
    // 4  — Engineering Manager (Frontend)
    { title: "Engineering Manager — Frontend", positionCode: "ENG-MGR-FE", orgUnitId: orgUnits[1].id, status: "filled" },
    // 5  — Engineering Manager (Backend)
    { title: "Engineering Manager — Backend", positionCode: "ENG-MGR-BE", orgUnitId: orgUnits[1].id, status: "filled" },
    // 6  — Senior Software Engineer
    { title: "Senior Software Engineer", positionCode: "SE-SR-001", orgUnitId: orgUnits[1].id, status: "filled" },
    // 7  — Software Engineer x5
    { title: "Software Engineer", positionCode: "SE-001", orgUnitId: orgUnits[1].id, status: "filled" },
    { title: "Software Engineer", positionCode: "SE-002", orgUnitId: orgUnits[1].id, status: "filled" },
    { title: "Software Engineer", positionCode: "SE-003", orgUnitId: orgUnits[1].id, status: "filled" },
    { title: "Software Engineer", positionCode: "SE-004", orgUnitId: orgUnits[1].id, status: "filled" },
    { title: "Software Engineer", positionCode: "SE-005", orgUnitId: orgUnits[1].id, status: "filled" },
    // 12 — Product Manager x2
    { title: "Product Manager", positionCode: "PM-001", orgUnitId: orgUnits[3].id, status: "filled" },
    { title: "Product Manager", positionCode: "PM-002", orgUnitId: orgUnits[3].id, status: "filled" },
    // 14 — Designer x2
    { title: "Senior Designer", positionCode: "DES-SR-001", orgUnitId: orgUnits[4].id, status: "filled" },
    { title: "Designer", positionCode: "DES-001", orgUnitId: orgUnits[4].id, status: "filled" },
    // 16 — QA Lead + QA Engineer x2
    { title: "QA Lead", positionCode: "QA-LEAD", orgUnitId: orgUnits[5].id, status: "filled" },
    { title: "QA Engineer", positionCode: "QA-001", orgUnitId: orgUnits[5].id, status: "filled" },
    { title: "QA Engineer", positionCode: "QA-002", orgUnitId: orgUnits[5].id, status: "filled" },
    // 19 — HRBP x2
    { title: "HR Business Partner", positionCode: "HR-BP-001", orgUnitId: orgUnits[2].id, status: "filled" },
    { title: "People Operations Specialist", positionCode: "HR-OPS-001", orgUnitId: orgUnits[2].id, status: "filled" },
    // 21 — Recruiter
    { title: "Recruiter", positionCode: "HR-REC-001", orgUnitId: orgUnits[2].id, status: "filled" },
    // 22 — Finance
    { title: "Finance & Admin Lead", positionCode: "FIN-LEAD", orgUnitId: orgUnits[6].id, status: "filled" },
    // 23 — Operations Lead
    { title: "Operations Lead", positionCode: "OPS-LEAD", orgUnitId: orgUnits[7].id, status: "filled" },
    // 24 — Compliance / Security Lead
    { title: "Security & Compliance Lead", positionCode: "SEC-LEAD", orgUnitId: orgUnits[8].id, status: "filled" },
    // 25 — Support Lead
    { title: "Customer Support Lead", positionCode: "SUP-LEAD", orgUnitId: orgUnits[7].id, status: "filled" },
    // 26 — Business Ops x2
    { title: "Business Operations Analyst", positionCode: "BIZ-OPS-001", orgUnitId: orgUnits[7].id, status: "filled" },
    { title: "Business Operations Analyst", positionCode: "BIZ-OPS-002", orgUnitId: orgUnits[7].id, status: "filled" },
  ]).returning();

  // =========================================================================
  // Worker Profiles — 28 workers (1:1 with people)
  // =========================================================================
  const workers = await db.insert(hrWorkerProfiles).values([
    // 0  Alice — CEO
    { personId: people[0].id, employeeNumber: "EMP001", workerType: "employee", homeOrgUnitId: orgUnits[0].id, primaryPositionId: positions[0].id, employmentCategory: "full_time", status: "active" },
    // 1  Bob — Eng Director
    { personId: people[1].id, employeeNumber: "EMP002", workerType: "employee", homeOrgUnitId: orgUnits[1].id, primaryPositionId: positions[1].id, employmentCategory: "full_time", status: "active" },
    // 2  Carol — HR Director
    { personId: people[2].id, employeeNumber: "EMP003", workerType: "employee", homeOrgUnitId: orgUnits[2].id, primaryPositionId: positions[2].id, employmentCategory: "full_time", status: "active" },
    // 3  David — Product Director
    { personId: people[3].id, employeeNumber: "EMP004", workerType: "employee", homeOrgUnitId: orgUnits[3].id, primaryPositionId: positions[3].id, employmentCategory: "full_time", status: "active" },
    // 4  Eve — Eng Manager FE
    { personId: people[4].id, employeeNumber: "EMP005", workerType: "employee", homeOrgUnitId: orgUnits[1].id, primaryPositionId: positions[4].id, employmentCategory: "full_time", status: "active" },
    // 5  Frank — Eng Manager BE
    { personId: people[5].id, employeeNumber: "EMP006", workerType: "employee", homeOrgUnitId: orgUnits[1].id, primaryPositionId: positions[5].id, employmentCategory: "full_time", status: "active" },
    // 6  Grace — Sr Software Engineer
    { personId: people[6].id, employeeNumber: "EMP007", workerType: "employee", homeOrgUnitId: orgUnits[1].id, primaryPositionId: positions[6].id, employmentCategory: "full_time", status: "active" },
    // 7  Henry — Software Engineer
    { personId: people[7].id, employeeNumber: "EMP008", workerType: "employee", homeOrgUnitId: orgUnits[1].id, primaryPositionId: positions[7].id, employmentCategory: "full_time", status: "active" },
    // 8  Irene — Software Engineer
    { personId: people[8].id, employeeNumber: "EMP009", workerType: "employee", homeOrgUnitId: orgUnits[1].id, primaryPositionId: positions[8].id, employmentCategory: "full_time", status: "active" },
    // 9  Jack — Software Engineer
    { personId: people[9].id, employeeNumber: "EMP010", workerType: "employee", homeOrgUnitId: orgUnits[1].id, primaryPositionId: positions[9].id, employmentCategory: "full_time", status: "active" },
    // 10 Karen — Software Engineer
    { personId: people[10].id, employeeNumber: "EMP011", workerType: "employee", homeOrgUnitId: orgUnits[1].id, primaryPositionId: positions[10].id, employmentCategory: "full_time", status: "active" },
    // 11 Leo — Software Engineer (on leave)
    { personId: people[11].id, employeeNumber: "EMP012", workerType: "employee", homeOrgUnitId: orgUnits[1].id, primaryPositionId: positions[11].id, employmentCategory: "full_time", status: "on_leave" },
    // 12 Mia — Product Manager
    { personId: people[12].id, employeeNumber: "EMP013", workerType: "employee", homeOrgUnitId: orgUnits[3].id, primaryPositionId: positions[12].id, employmentCategory: "full_time", status: "active" },
    // 13 Nathan — Product Manager
    { personId: people[13].id, employeeNumber: "EMP014", workerType: "employee", homeOrgUnitId: orgUnits[3].id, primaryPositionId: positions[13].id, employmentCategory: "full_time", status: "active" },
    // 14 Olivia — Senior Designer
    { personId: people[14].id, employeeNumber: "EMP015", workerType: "employee", homeOrgUnitId: orgUnits[4].id, primaryPositionId: positions[14].id, employmentCategory: "full_time", status: "active" },
    // 15 Paul — Designer
    { personId: people[15].id, employeeNumber: "EMP016", workerType: "employee", homeOrgUnitId: orgUnits[4].id, primaryPositionId: positions[15].id, employmentCategory: "full_time", status: "active" },
    // 16 Quinn — QA Lead
    { personId: people[16].id, employeeNumber: "EMP017", workerType: "employee", homeOrgUnitId: orgUnits[5].id, primaryPositionId: positions[16].id, employmentCategory: "full_time", status: "active" },
    // 17 Rachel — QA Engineer
    { personId: people[17].id, employeeNumber: "EMP018", workerType: "employee", homeOrgUnitId: orgUnits[5].id, primaryPositionId: positions[17].id, employmentCategory: "full_time", status: "active" },
    // 18 Sam — QA Engineer
    { personId: people[18].id, employeeNumber: "EMP019", workerType: "employee", homeOrgUnitId: orgUnits[5].id, primaryPositionId: positions[18].id, employmentCategory: "full_time", status: "active" },
    // 19 Tina — HRBP
    { personId: people[19].id, employeeNumber: "EMP020", workerType: "employee", homeOrgUnitId: orgUnits[2].id, primaryPositionId: positions[19].id, employmentCategory: "full_time", status: "active" },
    // 20 Uma — People Ops
    { personId: people[20].id, employeeNumber: "EMP021", workerType: "employee", homeOrgUnitId: orgUnits[2].id, primaryPositionId: positions[20].id, employmentCategory: "full_time", status: "active" },
    // 21 Victor — Recruiter
    { personId: people[21].id, employeeNumber: "EMP022", workerType: "employee", homeOrgUnitId: orgUnits[2].id, primaryPositionId: positions[21].id, employmentCategory: "full_time", status: "active" },
    // 22 Wendy — Finance Lead
    { personId: people[22].id, employeeNumber: "EMP023", workerType: "employee", homeOrgUnitId: orgUnits[6].id, primaryPositionId: positions[22].id, employmentCategory: "full_time", status: "active" },
    // 23 Xavier — Operations Lead
    { personId: people[23].id, employeeNumber: "EMP024", workerType: "employee", homeOrgUnitId: orgUnits[7].id, primaryPositionId: positions[23].id, employmentCategory: "full_time", status: "active" },
    // 24 Yara — Security / Compliance Lead
    { personId: people[24].id, employeeNumber: "EMP025", workerType: "employee", homeOrgUnitId: orgUnits[8].id, primaryPositionId: positions[24].id, employmentCategory: "full_time", status: "active" },
    // 25 Zach — Support Lead
    { personId: people[25].id, employeeNumber: "EMP026", workerType: "employee", homeOrgUnitId: orgUnits[7].id, primaryPositionId: positions[25].id, employmentCategory: "full_time", status: "active" },
    // 26 Amy — Business Ops
    { personId: people[26].id, employeeNumber: "EMP027", workerType: "employee", homeOrgUnitId: orgUnits[7].id, primaryPositionId: positions[26].id, employmentCategory: "full_time", status: "active" },
    // 27 Brian — Business Ops (terminated)
    { personId: people[27].id, employeeNumber: "EMP028", workerType: "contractor", homeOrgUnitId: orgUnits[7].id, primaryPositionId: positions[27].id, employmentCategory: "full_time", status: "terminated" },
  ]).returning();

  // =========================================================================
  // Manager Relationships
  // =========================================================================
  // Directors report to CEO (workers[0])
  const directorIds = [workers[1].id, workers[2].id, workers[3].id, workers[22].id, workers[23].id, workers[24].id];
  for (const wId of directorIds) {
    await db.update(hrWorkerProfiles).set({ managerWorkerId: workers[0].id }).where(eq(hrWorkerProfiles.id, wId));
  }
  // Eng Managers report to Eng Director (workers[1])
  for (const wId of [workers[4].id, workers[5].id, workers[16].id]) {
    await db.update(hrWorkerProfiles).set({ managerWorkerId: workers[1].id }).where(eq(hrWorkerProfiles.id, wId));
  }
  // Frontend engineers report to Eve (workers[4])
  for (const wId of [workers[6].id, workers[7].id, workers[8].id]) {
    await db.update(hrWorkerProfiles).set({ managerWorkerId: workers[4].id }).where(eq(hrWorkerProfiles.id, wId));
  }
  // Backend engineers report to Frank (workers[5])
  for (const wId of [workers[9].id, workers[10].id, workers[11].id]) {
    await db.update(hrWorkerProfiles).set({ managerWorkerId: workers[5].id }).where(eq(hrWorkerProfiles.id, wId));
  }
  // Product Managers report to Product Director (workers[3])
  for (const wId of [workers[12].id, workers[13].id]) {
    await db.update(hrWorkerProfiles).set({ managerWorkerId: workers[3].id }).where(eq(hrWorkerProfiles.id, wId));
  }
  // Designers report to Product Director (workers[3])
  for (const wId of [workers[14].id, workers[15].id]) {
    await db.update(hrWorkerProfiles).set({ managerWorkerId: workers[3].id }).where(eq(hrWorkerProfiles.id, wId));
  }
  // QA engineers report to QA Lead (workers[16])
  for (const wId of [workers[17].id, workers[18].id]) {
    await db.update(hrWorkerProfiles).set({ managerWorkerId: workers[16].id }).where(eq(hrWorkerProfiles.id, wId));
  }
  // HR staff report to HR Director (workers[2])
  for (const wId of [workers[19].id, workers[20].id, workers[21].id]) {
    await db.update(hrWorkerProfiles).set({ managerWorkerId: workers[2].id }).where(eq(hrWorkerProfiles.id, wId));
  }
  // Support/Biz Ops report to Ops Lead (workers[23])
  for (const wId of [workers[25].id, workers[26].id, workers[27].id]) {
    await db.update(hrWorkerProfiles).set({ managerWorkerId: workers[23].id }).where(eq(hrWorkerProfiles.id, wId));
  }

  // Set org unit managers
  await db.update(hrOrgUnits).set({ managerWorkerId: workers[0].id }).where(eq(hrOrgUnits.id, orgUnits[0].id));
  await db.update(hrOrgUnits).set({ managerWorkerId: workers[1].id }).where(eq(hrOrgUnits.id, orgUnits[1].id));
  await db.update(hrOrgUnits).set({ managerWorkerId: workers[2].id }).where(eq(hrOrgUnits.id, orgUnits[2].id));
  await db.update(hrOrgUnits).set({ managerWorkerId: workers[3].id }).where(eq(hrOrgUnits.id, orgUnits[3].id));
  await db.update(hrOrgUnits).set({ managerWorkerId: workers[14].id }).where(eq(hrOrgUnits.id, orgUnits[4].id));
  await db.update(hrOrgUnits).set({ managerWorkerId: workers[16].id }).where(eq(hrOrgUnits.id, orgUnits[5].id));
  await db.update(hrOrgUnits).set({ managerWorkerId: workers[22].id }).where(eq(hrOrgUnits.id, orgUnits[6].id));
  await db.update(hrOrgUnits).set({ managerWorkerId: workers[23].id }).where(eq(hrOrgUnits.id, orgUnits[7].id));
  await db.update(hrOrgUnits).set({ managerWorkerId: workers[24].id }).where(eq(hrOrgUnits.id, orgUnits[8].id));

  // =========================================================================
  // Employment Records — 28 records
  // =========================================================================
  await db.insert(hrEmploymentRecords).values([
    { workerId: workers[0].id, employmentStatus: "active", contractType: "permanent", startDate: "2020-01-15", effectiveFrom: "2020-01-15", workLocation: "HQ — Floor 5", costCenter: "CC-EXEC", legalEntity: "Demo Corp" },
    { workerId: workers[1].id, employmentStatus: "active", contractType: "permanent", startDate: "2020-06-01", effectiveFrom: "2020-06-01", workLocation: "HQ — Floor 3", costCenter: "CC-ENG", legalEntity: "Demo Corp" },
    { workerId: workers[2].id, employmentStatus: "active", contractType: "permanent", startDate: "2021-02-01", effectiveFrom: "2021-02-01", workLocation: "HQ — Floor 4", costCenter: "CC-HR", legalEntity: "Demo Corp" },
    { workerId: workers[3].id, employmentStatus: "active", contractType: "permanent", startDate: "2021-04-15", effectiveFrom: "2021-04-15", workLocation: "HQ — Floor 4", costCenter: "CC-PROD", legalEntity: "Demo Corp" },
    { workerId: workers[4].id, employmentStatus: "active", contractType: "permanent", startDate: "2021-09-01", effectiveFrom: "2021-09-01", workLocation: "HQ — Floor 3", costCenter: "CC-ENG", legalEntity: "Demo Corp" },
    { workerId: workers[5].id, employmentStatus: "active", contractType: "permanent", startDate: "2022-01-10", effectiveFrom: "2022-01-10", workLocation: "Remote", costCenter: "CC-ENG", legalEntity: "Demo Corp" },
    { workerId: workers[6].id, employmentStatus: "active", contractType: "permanent", startDate: "2022-03-15", effectiveFrom: "2022-03-15", workLocation: "HQ — Floor 3", costCenter: "CC-ENG", legalEntity: "Demo Corp" },
    { workerId: workers[7].id, employmentStatus: "active", contractType: "permanent", startDate: "2022-08-01", effectiveFrom: "2022-08-01", workLocation: "Remote", costCenter: "CC-ENG", legalEntity: "Demo Corp" },
    { workerId: workers[8].id, employmentStatus: "active", contractType: "permanent", startDate: "2023-01-15", effectiveFrom: "2023-01-15", workLocation: "HQ — Floor 3", costCenter: "CC-ENG", legalEntity: "Demo Corp" },
    { workerId: workers[9].id, employmentStatus: "active", contractType: "permanent", startDate: "2023-04-01", effectiveFrom: "2023-04-01", workLocation: "Remote", costCenter: "CC-ENG", legalEntity: "Demo Corp" },
    { workerId: workers[10].id, employmentStatus: "active", contractType: "permanent", startDate: "2023-07-15", effectiveFrom: "2023-07-15", workLocation: "HQ — Floor 3", costCenter: "CC-ENG", legalEntity: "Demo Corp" },
    { workerId: workers[11].id, employmentStatus: "active", contractType: "permanent", startDate: "2023-10-01", effectiveFrom: "2023-10-01", workLocation: "Remote", costCenter: "CC-ENG", legalEntity: "Demo Corp" },
    { workerId: workers[12].id, employmentStatus: "active", contractType: "permanent", startDate: "2022-05-01", effectiveFrom: "2022-05-01", workLocation: "HQ — Floor 4", costCenter: "CC-PROD", legalEntity: "Demo Corp" },
    { workerId: workers[13].id, employmentStatus: "active", contractType: "permanent", startDate: "2023-02-15", effectiveFrom: "2023-02-15", workLocation: "Remote", costCenter: "CC-PROD", legalEntity: "Demo Corp" },
    { workerId: workers[14].id, employmentStatus: "active", contractType: "permanent", startDate: "2022-03-01", effectiveFrom: "2022-03-01", workLocation: "HQ — Floor 4", costCenter: "CC-DESIGN", legalEntity: "Demo Corp" },
    { workerId: workers[15].id, employmentStatus: "active", contractType: "permanent", startDate: "2023-06-01", effectiveFrom: "2023-06-01", workLocation: "Remote", costCenter: "CC-DESIGN", legalEntity: "Demo Corp" },
    { workerId: workers[16].id, employmentStatus: "active", contractType: "permanent", startDate: "2022-02-01", effectiveFrom: "2022-02-01", workLocation: "HQ — Floor 3", costCenter: "CC-QA", legalEntity: "Demo Corp" },
    { workerId: workers[17].id, employmentStatus: "active", contractType: "permanent", startDate: "2023-05-01", effectiveFrom: "2023-05-01", workLocation: "Remote", costCenter: "CC-QA", legalEntity: "Demo Corp" },
    { workerId: workers[18].id, employmentStatus: "active", contractType: "permanent", startDate: "2024-01-15", effectiveFrom: "2024-01-15", workLocation: "HQ — Floor 3", costCenter: "CC-QA", legalEntity: "Demo Corp" },
    { workerId: workers[19].id, employmentStatus: "active", contractType: "permanent", startDate: "2021-08-01", effectiveFrom: "2021-08-01", workLocation: "HQ — Floor 4", costCenter: "CC-HR", legalEntity: "Demo Corp" },
    { workerId: workers[20].id, employmentStatus: "active", contractType: "permanent", startDate: "2022-11-01", effectiveFrom: "2022-11-01", workLocation: "HQ — Floor 4", costCenter: "CC-HR", legalEntity: "Demo Corp" },
    { workerId: workers[21].id, employmentStatus: "active", contractType: "permanent", startDate: "2023-03-15", effectiveFrom: "2023-03-15", workLocation: "Remote", costCenter: "CC-HR", legalEntity: "Demo Corp" },
    { workerId: workers[22].id, employmentStatus: "active", contractType: "permanent", startDate: "2021-03-01", effectiveFrom: "2021-03-01", workLocation: "HQ — Floor 2", costCenter: "CC-FIN", legalEntity: "Demo Corp" },
    { workerId: workers[23].id, employmentStatus: "active", contractType: "permanent", startDate: "2021-06-15", effectiveFrom: "2021-06-15", workLocation: "HQ — Floor 2", costCenter: "CC-OPS", legalEntity: "Demo Corp" },
    { workerId: workers[24].id, employmentStatus: "active", contractType: "permanent", startDate: "2022-01-01", effectiveFrom: "2022-01-01", workLocation: "HQ — Floor 5", costCenter: "CC-SEC", legalEntity: "Demo Corp" },
    { workerId: workers[25].id, employmentStatus: "active", contractType: "permanent", startDate: "2022-07-01", effectiveFrom: "2022-07-01", workLocation: "Remote", costCenter: "CC-OPS", legalEntity: "Demo Corp" },
    { workerId: workers[26].id, employmentStatus: "active", contractType: "permanent", startDate: "2023-09-01", effectiveFrom: "2023-09-01", workLocation: "HQ — Floor 2", costCenter: "CC-OPS", legalEntity: "Demo Corp" },
    { workerId: workers[27].id, employmentStatus: "terminated", contractType: "fixed_term", startDate: "2024-01-01", endDate: "2025-12-31", effectiveFrom: "2024-01-01", workLocation: "Remote", costCenter: "CC-OPS", legalEntity: "Demo Corp" },
  ]);

  // =========================================================================
  // Worker Skills — spread across roles
  // =========================================================================
  await db.insert(hrWorkerSkills).values([
    { workerId: workers[0].id, skillName: "Strategic Leadership", proficiencyLevel: "expert" },
    { workerId: workers[1].id, skillName: "System Architecture", proficiencyLevel: "expert" },
    { workerId: workers[1].id, skillName: "Team Management", proficiencyLevel: "advanced" },
    { workerId: workers[4].id, skillName: "React", proficiencyLevel: "expert" },
    { workerId: workers[4].id, skillName: "TypeScript", proficiencyLevel: "expert" },
    { workerId: workers[5].id, skillName: "Node.js", proficiencyLevel: "expert" },
    { workerId: workers[5].id, skillName: "PostgreSQL", proficiencyLevel: "advanced" },
    { workerId: workers[6].id, skillName: "TypeScript", proficiencyLevel: "advanced" },
    { workerId: workers[6].id, skillName: "React", proficiencyLevel: "advanced" },
    { workerId: workers[7].id, skillName: "JavaScript", proficiencyLevel: "intermediate" },
    { workerId: workers[8].id, skillName: "TypeScript", proficiencyLevel: "intermediate" },
    { workerId: workers[9].id, skillName: "Python", proficiencyLevel: "advanced" },
    { workerId: workers[9].id, skillName: "PostgreSQL", proficiencyLevel: "intermediate" },
    { workerId: workers[10].id, skillName: "Go", proficiencyLevel: "intermediate" },
    { workerId: workers[12].id, skillName: "Product Strategy", proficiencyLevel: "advanced" },
    { workerId: workers[14].id, skillName: "Figma", proficiencyLevel: "expert" },
    { workerId: workers[14].id, skillName: "UX Research", proficiencyLevel: "advanced" },
    { workerId: workers[16].id, skillName: "Test Automation", proficiencyLevel: "expert" },
    { workerId: workers[16].id, skillName: "Playwright", proficiencyLevel: "advanced" },
    { workerId: workers[17].id, skillName: "Manual Testing", proficiencyLevel: "advanced" },
    { workerId: workers[22].id, skillName: "Financial Modeling", proficiencyLevel: "expert" },
    { workerId: workers[24].id, skillName: "SOC 2 Compliance", proficiencyLevel: "expert" },
    { workerId: workers[24].id, skillName: "Risk Assessment", proficiencyLevel: "advanced" },
  ]);

  // =========================================================================
  // Training Catalog
  // =========================================================================
  const courses = await db.insert(hrTrainingCatalog).values([
    { code: "SEC-101", title: "Security Awareness Training", category: "compliance", isMandatory: true, durationHours: 2, format: "online" },
    { code: "LEAD-201", title: "Leadership Foundations", category: "leadership", durationHours: 8, format: "classroom" },
    { code: "TECH-301", title: "Cloud Architecture", category: "technical", durationHours: 16, format: "blended" },
    { code: "DEI-101", title: "Diversity & Inclusion", category: "compliance", isMandatory: true, durationHours: 1, format: "online" },
    { code: "AGILE-201", title: "Agile Project Management", category: "methodology", durationHours: 8, format: "online" },
  ]).returning();

  // =========================================================================
  // Learning Assignments
  // =========================================================================
  await db.insert(hrLearningAssignments).values([
    { workerId: workers[0].id, trainingId: courses[0].id, status: "completed", dueDate: "2025-03-01" },
    { workerId: workers[1].id, trainingId: courses[0].id, status: "completed", dueDate: "2025-03-01" },
    { workerId: workers[1].id, trainingId: courses[2].id, status: "completed", dueDate: "2025-06-01" },
    { workerId: workers[4].id, trainingId: courses[1].id, status: "completed", dueDate: "2025-09-01" },
    { workerId: workers[5].id, trainingId: courses[1].id, status: "in_progress", dueDate: "2026-06-01" },
    { workerId: workers[7].id, trainingId: courses[0].id, status: "assigned", dueDate: "2026-04-15" },
    { workerId: workers[8].id, trainingId: courses[0].id, status: "assigned", dueDate: "2026-04-15" },
    { workerId: workers[12].id, trainingId: courses[4].id, status: "completed", dueDate: "2025-12-01" },
    { workerId: workers[14].id, trainingId: courses[3].id, status: "completed", dueDate: "2025-06-01" },
    { workerId: workers[16].id, trainingId: courses[0].id, status: "completed", dueDate: "2025-03-01" },
  ]);

  // =========================================================================
  // Certifications
  // =========================================================================
  const certs = await db.insert(hrCertifications).values([
    { code: "AWS-SAA", name: "AWS Solutions Architect – Associate", issuingBody: "Amazon Web Services", validityMonths: 36 },
    { code: "PMP", name: "Project Management Professional", issuingBody: "PMI", validityMonths: 36 },
    { code: "CISSP", name: "Certified Information Systems Security Professional", issuingBody: "ISC2", validityMonths: 36 },
    { code: "SHRM-CP", name: "SHRM Certified Professional", issuingBody: "SHRM", validityMonths: 36 },
  ]).returning();

  await db.insert(hrEmployeeCertifications).values([
    { workerId: workers[1].id, certificationId: certs[0].id, obtainedDate: "2024-06-01", expiryDate: "2027-06-01", status: "active" },
    { workerId: workers[6].id, certificationId: certs[0].id, obtainedDate: "2023-01-15", expiryDate: "2026-01-15", status: "active" },
    { workerId: workers[12].id, certificationId: certs[1].id, obtainedDate: "2023-09-01", expiryDate: "2026-09-01", status: "active" },
    { workerId: workers[24].id, certificationId: certs[2].id, obtainedDate: "2022-05-01", expiryDate: "2025-05-01", status: "active" },
    { workerId: workers[19].id, certificationId: certs[3].id, obtainedDate: "2024-01-01", expiryDate: "2027-01-01", status: "active" },
  ]);

  // =========================================================================
  // Performance Cycles + Goals
  // =========================================================================
  const [perfCycle] = await db.insert(hrPerformanceCycles).values([
    { name: "2026 H1 Review", startDate: "2026-01-01", endDate: "2026-06-30", status: "active" },
  ]).returning();

  await db.insert(hrGoals).values([
    { workerId: workers[0].id, cycleId: perfCycle.id, title: "Grow headcount to 35", description: "Hire 7 more staff by Q2", status: "active", weight: 30 },
    { workerId: workers[1].id, cycleId: perfCycle.id, title: "Ship v2.0 release", description: "Deliver main product release by Q2", status: "active", weight: 40 },
    { workerId: workers[3].id, cycleId: perfCycle.id, title: "Launch 3 new features", description: "Ship product discovery, AI copilot, and analytics dashboard", status: "active", weight: 50 },
    { workerId: workers[6].id, cycleId: perfCycle.id, title: "Complete cloud architecture cert", status: "draft", weight: 30 },
    { workerId: workers[12].id, cycleId: perfCycle.id, title: "Improve NPS to 70+", description: "Drive product satisfaction via user research", status: "active", weight: 40 },
    { workerId: workers[16].id, cycleId: perfCycle.id, title: "Achieve 90% test coverage", description: "Increase automated test coverage across all modules", status: "active", weight: 50 },
    { workerId: workers[24].id, cycleId: perfCycle.id, title: "Pass SOC 2 audit", description: "Complete Type II audit with zero critical findings", status: "active", weight: 60 },
  ]);

  // =========================================================================
  // Leave Types + Requests
  // =========================================================================
  const leaveTypes = await db.insert(hrLeaveTypes).values([
    { code: "ANNUAL", name: "Annual Leave", defaultDaysPerYear: 20, isPaid: true },
    { code: "SICK", name: "Sick Leave", defaultDaysPerYear: 10, isPaid: true },
    { code: "UNPAID", name: "Unpaid Leave", isPaid: false },
    { code: "PARENTAL", name: "Parental Leave", defaultDaysPerYear: 60, isPaid: true },
  ]).returning();

  await db.insert(hrLeaveRequests).values([
    { workerId: workers[11].id, leaveTypeId: leaveTypes[0].id, startDate: "2026-03-20", endDate: "2026-04-03", totalDays: "10", status: "approved", reason: "Family vacation" },
    { workerId: workers[7].id, leaveTypeId: leaveTypes[1].id, startDate: "2026-04-01", endDate: "2026-04-02", totalDays: "2", status: "pending", reason: "Medical appointment" },
    { workerId: workers[14].id, leaveTypeId: leaveTypes[0].id, startDate: "2026-05-10", endDate: "2026-05-16", totalDays: "5", status: "approved", reason: "Personal travel" },
    { workerId: workers[9].id, leaveTypeId: leaveTypes[1].id, startDate: "2026-04-10", endDate: "2026-04-11", totalDays: "2", status: "pending", reason: "Dental surgery" },
  ]);

  // =========================================================================
  // Salary Bands + Compensation Records
  // =========================================================================
  const bands = await db.insert(hrSalaryBands).values([
    { code: "IC1", name: "Individual Contributor 1", currency: "USD", minAmount: "50000", midAmount: "60000", maxAmount: "72000", jobLevel: "IC1" },
    { code: "IC2", name: "Individual Contributor 2", currency: "USD", minAmount: "65000", midAmount: "80000", maxAmount: "95000", jobLevel: "IC2" },
    { code: "IC3", name: "Individual Contributor 3", currency: "USD", minAmount: "85000", midAmount: "105000", maxAmount: "125000", jobLevel: "IC3" },
    { code: "M1", name: "Manager 1", currency: "USD", minAmount: "95000", midAmount: "115000", maxAmount: "135000", jobLevel: "M1" },
    { code: "M2", name: "Manager 2", currency: "USD", minAmount: "115000", midAmount: "140000", maxAmount: "165000", jobLevel: "M2" },
    { code: "D1", name: "Director", currency: "USD", minAmount: "140000", midAmount: "170000", maxAmount: "200000", jobLevel: "D1" },
    { code: "E1", name: "Executive", currency: "USD", minAmount: "180000", midAmount: "220000", maxAmount: "280000", jobLevel: "E1" },
  ]).returning();

  await db.insert(hrCompensationRecords).values([
    { workerId: workers[0].id, salaryBandId: bands[6].id, baseSalary: "250000", currency: "USD", effectiveFrom: "2024-01-01", changeReason: "promotion", status: "active" },
    { workerId: workers[1].id, salaryBandId: bands[5].id, baseSalary: "180000", currency: "USD", effectiveFrom: "2024-01-01", changeReason: "promotion", status: "active" },
    { workerId: workers[2].id, salaryBandId: bands[5].id, baseSalary: "165000", currency: "USD", effectiveFrom: "2023-07-01", changeReason: "hire", status: "active" },
    { workerId: workers[3].id, salaryBandId: bands[5].id, baseSalary: "175000", currency: "USD", effectiveFrom: "2023-07-01", changeReason: "hire", status: "active" },
    { workerId: workers[4].id, salaryBandId: bands[4].id, baseSalary: "145000", currency: "USD", effectiveFrom: "2024-07-01", changeReason: "promotion", status: "active" },
    { workerId: workers[5].id, salaryBandId: bands[4].id, baseSalary: "140000", currency: "USD", effectiveFrom: "2024-07-01", changeReason: "promotion", status: "active" },
    { workerId: workers[6].id, salaryBandId: bands[2].id, baseSalary: "120000", currency: "USD", effectiveFrom: "2024-01-01", changeReason: "merit", status: "active" },
    { workerId: workers[7].id, salaryBandId: bands[1].id, baseSalary: "85000", currency: "USD", effectiveFrom: "2022-08-01", changeReason: "hire", status: "active" },
    { workerId: workers[12].id, salaryBandId: bands[2].id, baseSalary: "115000", currency: "USD", effectiveFrom: "2024-01-01", changeReason: "merit", status: "active" },
    { workerId: workers[14].id, salaryBandId: bands[2].id, baseSalary: "110000", currency: "USD", effectiveFrom: "2024-01-01", changeReason: "merit", status: "active" },
    { workerId: workers[16].id, salaryBandId: bands[3].id, baseSalary: "125000", currency: "USD", effectiveFrom: "2024-01-01", changeReason: "promotion", status: "active" },
    { workerId: workers[22].id, salaryBandId: bands[3].id, baseSalary: "120000", currency: "USD", effectiveFrom: "2023-07-01", changeReason: "hire", status: "active" },
    { workerId: workers[24].id, salaryBandId: bands[3].id, baseSalary: "130000", currency: "USD", effectiveFrom: "2024-01-01", changeReason: "merit", status: "active" },
  ]);

  // =========================================================================
  // Benefit Plans
  // =========================================================================
  await db.insert(hrBenefitPlans).values([
    { code: "HEALTH-STD", name: "Standard Health Plan", category: "health", provider: "BlueCross", isActive: true },
    { code: "HEALTH-PRM", name: "Premium Health Plan", category: "health", provider: "BlueCross", isActive: true },
    { code: "DENTAL", name: "Dental Coverage", category: "dental", provider: "DentalCo", isActive: true },
    { code: "VISION", name: "Vision Coverage", category: "vision", provider: "VisionPlus", isActive: true },
    { code: "401K", name: "401(k) Retirement Plan", category: "retirement", isActive: true },
    { code: "HSA", name: "Health Savings Account", category: "savings", isActive: true },
  ]);

  // =========================================================================
  // Policies
  // =========================================================================
  await db.insert(hrPolicies).values([
    { title: "Code of Conduct", category: "general", status: "published", version: 2, effectiveFrom: "2025-01-01" },
    { title: "Remote Work Policy", category: "workplace", status: "published", version: 1, effectiveFrom: "2024-06-01" },
    { title: "Data Privacy Policy", category: "compliance", status: "published", version: 1, effectiveFrom: "2024-01-01" },
    { title: "Anti-Harassment Policy", category: "general", status: "published", version: 1, effectiveFrom: "2024-01-01" },
    { title: "Acceptable Use Policy", category: "it", status: "published", version: 1, effectiveFrom: "2025-01-01" },
  ]);

  // =========================================================================
  // Compliance Obligations
  // =========================================================================
  await db.insert(hrComplianceObligations).values([
    { title: "Annual SOC 2 Audit", category: "reporting", regulation: "SOC 2 Type II", status: "compliant", dueDate: "2026-06-30" },
    { title: "GDPR Data Inventory", category: "data_privacy", regulation: "GDPR Art. 30", status: "active", dueDate: "2026-12-31" },
    { title: "Annual Security Training", category: "training", regulation: "Internal Policy", status: "active", dueDate: "2026-03-31" },
  ]);

  // =========================================================================
  // Report Definitions
  // =========================================================================
  await db.insert(hrReportDefinitions).values([
    { name: "Monthly Headcount Report", reportType: "standard", category: "headcount", isActive: true },
    { name: "Quarterly Attrition Report", reportType: "scheduled", category: "attrition", isActive: true },
    { name: "Annual Compensation Review", reportType: "custom", category: "compensation", isActive: true },
    { name: "Diversity Dashboard", reportType: "standard", category: "diversity", isActive: true },
  ]);

  // =========================================================================
  // Grievances
  // =========================================================================
  await db.insert(hrGrievances).values([
    { filedByWorkerId: workers[7].id, category: "unfair_treatment", severity: "medium", subject: "Schedule change without notice", description: "Manager changed schedule without prior discussion", status: "filed" },
    { filedByWorkerId: workers[11].id, againstWorkerId: workers[9].id, category: "harassment", severity: "high", subject: "Inappropriate comments", description: "Repeated inappropriate comments in meetings", status: "under_review" },
  ]);

  // =========================================================================
  // Incident Reports
  // =========================================================================
  await db.insert(hrIncidentReports).values([
    { title: "Office slip hazard", description: "Water spill near entrance caused near-miss", category: "near_miss", severity: "low", incidentDate: "2026-03-10", location: "Building A — Lobby", reportedByWorkerId: workers[2].id, status: "reported" },
    { title: "Data access anomaly", description: "Unexpected access pattern detected on HR records", category: "security", severity: "medium", incidentDate: "2026-03-15", reportedByWorkerId: workers[24].id, status: "under_investigation" },
  ]);

  // =========================================================================
  // Talent Reviews
  // =========================================================================
  await db.insert(hrTalentReviews).values([
    { workerId: workers[1].id, reviewerId: workers[0].id, reviewDate: "2026-03-01", performanceRating: "strong", potentialRating: "high", nineBoxPosition: "star", readinessForPromotion: "ready_now", retentionRisk: "medium", status: "finalized" },
    { workerId: workers[6].id, reviewerId: workers[4].id, reviewDate: "2026-03-01", performanceRating: "strong", potentialRating: "high", nineBoxPosition: "star", readinessForPromotion: "ready_1yr", retentionRisk: "low", status: "finalized" },
    { workerId: workers[12].id, reviewerId: workers[3].id, reviewDate: "2026-03-01", performanceRating: "meets_expectations", potentialRating: "high", nineBoxPosition: "growth", readinessForPromotion: "ready_1yr", retentionRisk: "low", status: "submitted" },
    { workerId: workers[16].id, reviewerId: workers[1].id, reviewDate: "2026-03-01", performanceRating: "strong", potentialRating: "medium", nineBoxPosition: "trusted_professional", readinessForPromotion: "ready_1yr", retentionRisk: "low", status: "finalized" },
  ]);

  // =========================================================================
  // Succession Plans
  // =========================================================================
  const [succPlan] = await db.insert(hrSuccessionPlans).values([
    { positionId: positions[1].id, positionTitle: "Engineering Director", criticality: "high", currentIncumbentId: workers[1].id, status: "active" },
  ]).returning();

  await db.insert(hrSuccessionCandidates).values([
    { successionPlanId: succPlan.id, candidateWorkerId: workers[4].id, readiness: "ready_1yr", developmentNeeds: "Strategic planning, cross-org collaboration", priority: 1, status: "developing" },
    { successionPlanId: succPlan.id, candidateWorkerId: workers[5].id, readiness: "ready_2yr", developmentNeeds: "Leadership training, budget management", priority: 2, status: "nominated" },
  ]);

  // =========================================================================
  // Engagement Programs
  // =========================================================================
  await db.insert(hrEngagementPrograms).values([
    { name: "Mentorship Program", description: "Pair junior and senior engineers for mentoring", category: "mentorship", startDate: "2026-01-15", status: "active", participantCount: 16 },
    { name: "Q2 Team Building", description: "Cross-department team building activities", category: "team_building", startDate: "2026-04-01", endDate: "2026-06-30", status: "planned" },
    { name: "Wellness Wednesdays", description: "Weekly wellness activities and mindfulness sessions", category: "wellness", startDate: "2026-02-01", status: "active", participantCount: 22 },
  ]);

  // =========================================================================
  // Survey Campaigns
  // =========================================================================
  await db.insert(hrSurveyCampaigns).values([
    { title: "Q1 2026 Pulse Survey", surveyType: "pulse", startDate: "2026-03-01", endDate: "2026-03-15", isAnonymous: true, status: "closed", totalInvited: 27, totalResponses: 23 },
    { title: "Q2 2026 Engagement Survey", surveyType: "engagement", startDate: "2026-04-01", endDate: "2026-04-15", isAnonymous: true, status: "draft", totalInvited: 0, totalResponses: 0 },
  ]);

  // =========================================================================
  // Risk Items
  // =========================================================================
  await db.insert(hrRiskItems).values([
    { title: "Key person dependency — Engineering Director", category: "retention", likelihood: "medium", impact: "high", riskScore: 6, ownerId: workers[2].id, mitigationPlan: "Succession plan in place, cross-training underway", status: "mitigating" },
    { title: "Contractor compliance gap", category: "compliance", likelihood: "low", impact: "medium", riskScore: 2, ownerId: workers[24].id, status: "identified" },
    { title: "Remote work burnout risk", category: "wellbeing", likelihood: "medium", impact: "medium", riskScore: 4, ownerId: workers[2].id, mitigationPlan: "Wellness program launched, manager check-ins increased", status: "mitigating" },
  ]);

  return {
    seeded: true,
    message: `Seeded ${people.length} people, ${workers.length} workers, ${orgUnits.length} org units, ${positions.length} positions, and supporting data across all HR domains`,
  };
}
