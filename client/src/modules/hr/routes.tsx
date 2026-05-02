/**
 * HR — Internal route table (metadata).
 *
 * The capsule's `mod.tsx` does the actual route dispatch (with
 * gating). This file lists every canonical path owned by HR so
 * `check:module-route-inventory` can verify the manifest's
 * `routeInventory` matches the capsule's actual mount surface.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const HRHomePage = lazy(() => import("./pages/HRHomePage"));
const HRSectionLandingPage = lazy(() => import("./pages/HRSectionLandingPage"));
const HRDirectoryPage = lazy(() => import("./pages/HRDirectoryPage"));
const HROrganizationPage = lazy(() => import("./pages/HROrganizationPage"));
const HRPositionsPage = lazy(() => import("./pages/HRPositionsPage"));
const HRStaffingPage = lazy(() => import("./pages/HRStaffingPage"));
const HRSkillsPage = lazy(() => import("./pages/HRSkillsPage"));
const HRReportsPage = lazy(() => import("./pages/HRReportsPage"));
const HRSettingsPage = lazy(() => import("./pages/HRSettingsPage"));
const HRRecruitmentPage = lazy(() => import("./pages/HRRecruitmentPage"));
const HROnboardingPage = lazy(() => import("./pages/HROnboardingPage"));
const HROffboardingPage = lazy(() => import("./pages/HROffboardingPage"));
const HRTimesheetPage = lazy(() => import("./pages/HRTimesheetPage"));
const HRLeavePage = lazy(() => import("./pages/HRLeavePage"));
const HROvertimePage = lazy(() => import("./pages/HROvertimePage"));
const HRShiftPlanningPage = lazy(() => import("./pages/HRShiftPlanningPage"));
const HRTrainingPage = lazy(() => import("./pages/HRTrainingPage"));
const HRCertificationsPage = lazy(() => import("./pages/HRCertificationsPage"));
const HRGoalsPage = lazy(() => import("./pages/HRGoalsPage"));
const HRPerformanceReviewsPage = lazy(() => import("./pages/HRPerformanceReviewsPage"));
const HRCompensationPage = lazy(() => import("./pages/HRCompensationPage"));
const HRBenefitsPage = lazy(() => import("./pages/HRBenefitsPage"));
const HRPoliciesPage = lazy(() => import("./pages/HRPoliciesPage"));
const HRGrievancesPage = lazy(() => import("./pages/HRGrievancesPage"));
const HRSurveysPage = lazy(() => import("./pages/HRSurveysPage"));
const HREngagementPage = lazy(() => import("./pages/HREngagementPage"));
const HRIncidentsPage = lazy(() => import("./pages/HRIncidentsPage"));
const HRComplianceMgmtPage = lazy(() => import("./pages/HRComplianceMgmtPage"));
const HRAnalyticsDashboardPage = lazy(() => import("./pages/HRAnalyticsDashboardPage"));
const HRTalentPage = lazy(() => import("./pages/HRTalentPage"));
const HRJobArchitecturePage = lazy(() => import("./pages/HRJobArchitecturePage"));
const HRWorkPermitsPage = lazy(() => import("./pages/HRWorkPermitsPage"));
const HRLettersCertificatesPage = lazy(() => import("./pages/HRLettersCertificatesPage"));
const HRRiskManagementPage = lazy(() => import("./pages/HRRiskManagementPage"));
const HRAuditLogsPage = lazy(() => import("./pages/HRAuditLogsPage"));
const HRAccessControlsPage = lazy(() => import("./pages/HRAccessControlsPage"));
const HRRoleDefinitionsPage = lazy(() => import("./pages/HRRoleDefinitionsPage"));
const HRRoleDefinitionDetailPage = lazy(() => import("./pages/HRRoleDefinitionDetailPage"));
const HRRoleDefinitionEditPage = lazy(() => import("./pages/HRRoleDefinitionEditPage"));
const HRRoleDefinitionReviewPage = lazy(() => import("./pages/HRRoleDefinitionReviewPage"));
const HRRoleDefinitionComparePage = lazy(() => import("./pages/HRRoleDefinitionComparePage"));

export interface HRRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const hrRoutes: HRRouteEntry[] = [
  // Phase 4 expansion (most specific first)
  { path: "/hr/workforce-planning/job-architecture", component: HRJobArchitecturePage, label: "Job Architecture" },
  { path: "/hr/employee-records/work-permits", component: HRWorkPermitsPage, label: "Work Permits" },
  { path: "/hr/employee-records/letters-certificates", component: HRLettersCertificatesPage, label: "Letters & Certificates" },
  { path: "/hr/compliance/risk-management", component: HRRiskManagementPage, label: "Risk Management" },
  { path: "/hr/security-access/audit-logs", component: HRAuditLogsPage, label: "Audit Logs" },
  { path: "/hr/security-access/access-controls", component: HRAccessControlsPage, label: "Access Controls" },

  // Role definitions
  { path: "/hr/role-definitions/new", component: HRRoleDefinitionEditPage, label: "New Role Definition" },
  { path: "/hr/role-definitions/review", component: HRRoleDefinitionReviewPage, label: "Review Role Definitions" },
  { path: "/hr/role-definitions/:id/compare", component: HRRoleDefinitionComparePage, label: "Compare Role Definition" },
  { path: "/hr/role-definitions/:id/edit", component: HRRoleDefinitionEditPage, label: "Edit Role Definition" },
  { path: "/hr/role-definitions/:id", component: HRRoleDefinitionDetailPage, label: "Role Definition" },
  { path: "/hr/role-definitions", component: HRRoleDefinitionsPage, label: "Role Definitions" },

  // Section landings
  { path: "/hr/workforce-planning", component: HRSectionLandingPage, label: "Workforce Planning" },
  { path: "/hr/talent-acquisition", component: HRSectionLandingPage, label: "Talent Acquisition" },
  { path: "/hr/lifecycle", component: HRSectionLandingPage, label: "Lifecycle" },
  { path: "/hr/employee-records", component: HRSectionLandingPage, label: "Employee Records" },
  { path: "/hr/compensation-benefits", component: HRSectionLandingPage, label: "Compensation & Benefits" },
  { path: "/hr/time-attendance", component: HRSectionLandingPage, label: "Time & Attendance" },
  { path: "/hr/learning-development", component: HRSectionLandingPage, label: "Learning & Development" },
  { path: "/hr/performance-talent", component: HRSectionLandingPage, label: "Performance & Talent" },
  { path: "/hr/employee-relations", component: HRSectionLandingPage, label: "Employee Relations" },
  { path: "/hr/wellbeing-engagement", component: HRSectionLandingPage, label: "Wellbeing & Engagement" },
  { path: "/hr/analytics-reporting", component: HRSectionLandingPage, label: "Analytics & Reporting" },
  { path: "/hr/security-access", component: HRSectionLandingPage, label: "Security & Access" },
  { path: "/hr/compliance", component: HRSectionLandingPage, label: "Compliance" },

  // Self-service
  { path: "/hr/directory", component: HRDirectoryPage, label: "Directory" },
  { path: "/hr/timesheet", component: HRTimesheetPage, label: "Timesheet" },
  { path: "/hr/leave", component: HRLeavePage, label: "Leave" },
  { path: "/hr/goals", component: HRGoalsPage, label: "Goals" },
  { path: "/hr/reviews", component: HRPerformanceReviewsPage, label: "Reviews" },
  { path: "/hr/training", component: HRTrainingPage, label: "Training" },
  { path: "/hr/certifications", component: HRCertificationsPage, label: "Certifications" },
  { path: "/hr/benefits", component: HRBenefitsPage, label: "Benefits" },
  { path: "/hr/policies", component: HRPoliciesPage, label: "Policies" },
  { path: "/hr/surveys", component: HRSurveysPage, label: "Surveys" },
  { path: "/hr/engagement", component: HREngagementPage, label: "Engagement" },
  { path: "/hr/skills", component: HRSkillsPage, label: "Skills" },

  // Admin / role-gated
  { path: "/hr/organization", component: HROrganizationPage, label: "Organization" },
  { path: "/hr/positions", component: HRPositionsPage, label: "Positions" },
  { path: "/hr/staffing", component: HRStaffingPage, label: "Staffing" },
  { path: "/hr/recruitment", component: HRRecruitmentPage, label: "Recruitment" },
  { path: "/hr/onboarding", component: HROnboardingPage, label: "Onboarding" },
  { path: "/hr/offboarding", component: HROffboardingPage, label: "Offboarding" },
  { path: "/hr/overtime", component: HROvertimePage, label: "Overtime" },
  { path: "/hr/shifts", component: HRShiftPlanningPage, label: "Shift Planning" },
  { path: "/hr/compensation", component: HRCompensationPage, label: "Compensation" },
  { path: "/hr/grievances", component: HRGrievancesPage, label: "Grievances" },
  { path: "/hr/incidents", component: HRIncidentsPage, label: "Incidents" },
  { path: "/hr/compliance-mgmt", component: HRComplianceMgmtPage, label: "Compliance Mgmt" },
  { path: "/hr/analytics", component: HRAnalyticsDashboardPage, label: "Analytics" },
  { path: "/hr/talent", component: HRTalentPage, label: "Talent" },
  { path: "/hr/reports", component: HRReportsPage, label: "Reports" },
  { path: "/hr/settings", component: HRSettingsPage, label: "Settings" },

  // Bare /hr — home (last)
  { path: "/hr", component: HRHomePage, label: "Home" },
];
