/**
 * HR — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/hr` and `/hr/:rest*`.
 *
 * HR has the largest canonical surface of any migrated capsule —
 * 54 paths spanning section landings, employee self-service, admin /
 * role-gated pages, Phase-4 expansion leaves, and role-definitions
 * deep links. There is no in-capsule "Shell" component (HR pages
 * are mounted directly under MainLayout's HRSideNav); each route
 * renders its dedicated page (gated where required).
 *
 * Gating: routes for sensitive areas wrap their page component in
 * `HrGate` via the `hrGated()` HOC. The HOC was previously inlined
 * in `App.tsx`; it now lives inside the capsule
 * (`./components/HrGate`) so the platform shell no longer holds
 * HR-specific helpers.
 */

import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";

import { hrGated } from "./components/HrGate";

// Section landing pages share one component, parameterized by sectionId.
const HRSectionLandingPage = lazy(() => import("./pages/HRSectionLandingPage"));

// Phase 1 — core
const HRHomePage = lazy(() => import("./pages/HRHomePage"));
const HRDirectoryPage = lazy(() => import("./pages/HRDirectoryPage"));
const HROrganizationPage = lazy(() => import("./pages/HROrganizationPage"));
const HRPositionsPage = lazy(() => import("./pages/HRPositionsPage"));
const HRStaffingPage = lazy(() => import("./pages/HRStaffingPage"));
const HRSkillsPage = lazy(() => import("./pages/HRSkillsPage"));
const HRReportsPage = lazy(() => import("./pages/HRReportsPage"));
const HRSettingsPage = lazy(() => import("./pages/HRSettingsPage"));

// Phase 2 — lifecycle
const HRRecruitmentPage = lazy(() => import("./pages/HRRecruitmentPage"));
const HROnboardingPage = lazy(() => import("./pages/HROnboardingPage"));
const HROffboardingPage = lazy(() => import("./pages/HROffboardingPage"));

// Phase 3 — workforce ops
const HRTimesheetPage = lazy(() => import("./pages/HRTimesheetPage"));
const HRLeavePage = lazy(() => import("./pages/HRLeavePage"));
const HROvertimePage = lazy(() => import("./pages/HROvertimePage"));
const HRShiftPlanningPage = lazy(() => import("./pages/HRShiftPlanningPage"));
const HRTrainingPage = lazy(() => import("./pages/HRTrainingPage"));
const HRCertificationsPage = lazy(() => import("./pages/HRCertificationsPage"));
const HRGoalsPage = lazy(() => import("./pages/HRGoalsPage"));
const HRPerformanceReviewsPage = lazy(() => import("./pages/HRPerformanceReviewsPage"));

// Phase 4 — comp/relations/engagement/compliance/analytics/talent
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

// Phase 4 expansion — Carbon SideNav leaves
const HRJobArchitecturePage = lazy(() => import("./pages/HRJobArchitecturePage"));
const HRWorkPermitsPage = lazy(() => import("./pages/HRWorkPermitsPage"));
const HRLettersCertificatesPage = lazy(() => import("./pages/HRLettersCertificatesPage"));
const HRRiskManagementPage = lazy(() => import("./pages/HRRiskManagementPage"));
const HRAuditLogsPage = lazy(() => import("./pages/HRAuditLogsPage"));
const HRAccessControlsPage = lazy(() => import("./pages/HRAccessControlsPage"));

// Role definitions
const HRRoleDefinitionsPage = lazy(() => import("./pages/HRRoleDefinitionsPage"));
const HRRoleDefinitionDetailPage = lazy(() => import("./pages/HRRoleDefinitionDetailPage"));
const HRRoleDefinitionEditPage = lazy(() => import("./pages/HRRoleDefinitionEditPage"));
const HRRoleDefinitionReviewPage = lazy(() => import("./pages/HRRoleDefinitionReviewPage"));
const HRRoleDefinitionComparePage = lazy(() => import("./pages/HRRoleDefinitionComparePage"));

// Admin / role-gated
const HrOrganizationGated = hrGated(HROrganizationPage, "hr.organization.read");
const HrPositionsGated = hrGated(HRPositionsPage, "hr.staffing.read");
const HrStaffingGated = hrGated(HRStaffingPage, "hr.staffing.read");
const HrRecruitmentGated = hrGated(HRRecruitmentPage, "hr.recruiting.read");
const HrOnboardingGated = hrGated(HROnboardingPage, "hr.onboarding.read");
const HrOffboardingGated = hrGated(HROffboardingPage, "hr.offboarding.read");
const HrOvertimeGated = hrGated(HROvertimePage, "hr.overtime.read");
const HrShiftPlanningGated = hrGated(HRShiftPlanningPage, "hr.shift.read");
const HrCompensationGated = hrGated(HRCompensationPage, "hr.compensation.read");
const HrGrievancesGated = hrGated(HRGrievancesPage, "hr.relations.read");
const HrIncidentsGated = hrGated(HRIncidentsPage, "hr.incident.read");
const HrComplianceMgmtGated = hrGated(HRComplianceMgmtPage, "hr.compliance.read");
const HrAnalyticsGated = hrGated(HRAnalyticsDashboardPage, "hr.analytics.read");
const HrTalentGated = hrGated(HRTalentPage, "hr.talent.read");
const HrReportsGated = hrGated(HRReportsPage, "hr.analytics.read");
const HrSettingsGated = hrGated(HRSettingsPage, "hr.analytics.manage");

// Phase 4 expansion — gated
const HrJobArchitectureGated = hrGated(HRJobArchitecturePage, "hr.organization.read");
const HrWorkPermitsGated = hrGated(HRWorkPermitsPage, "hr.compliance.read");
const HrLettersCertificatesGated = hrGated(HRLettersCertificatesPage, "hr.directory.read");
const HrRiskManagementGated = hrGated(HRRiskManagementPage, "hr.risk.read");
const HrAuditLogsGated = hrGated(HRAuditLogsPage, "hr.analytics.manage");
const HrAccessControlsGated = hrGated(HRAccessControlsPage, "hr.analytics.manage");

// Self-service — gated by self-level HR permissions
const HrDirectoryGated = hrGated(HRDirectoryPage, "hr.directory.read.self");
const HrTimesheetGated = hrGated(HRTimesheetPage, "hr.time.read.self");
const HrLeaveGated = hrGated(HRLeavePage, "hr.leave.read.self");
const HrGoalsGated = hrGated(HRGoalsPage, "hr.performance.read.self");
const HrPerformanceReviewsGated = hrGated(HRPerformanceReviewsPage, "hr.performance.read.self");
const HrTrainingGated = hrGated(HRTrainingPage, "hr.learning.read.self");
const HrCertificationsGated = hrGated(HRCertificationsPage, "hr.certification.read");
const HrBenefitsGated = hrGated(HRBenefitsPage, "hr.benefits.read");
const HrPoliciesGated = hrGated(HRPoliciesPage, "hr.policy.read");
const HrSurveysGated = hrGated(HRSurveysPage, "hr.survey.read");
const HrEngagementGated = hrGated(HREngagementPage, "hr.engagement.read");
const HrSkillsGated = hrGated(HRSkillsPage, "hr.staffing.read");

// Role definitions — gated
const HrRoleDefinitionsGated = hrGated(HRRoleDefinitionsPage, "hr.roledef.read");
const HrRoleDefinitionDetailGated = hrGated(HRRoleDefinitionDetailPage, "hr.roledef.read");
const HrRoleDefinitionEditGated = hrGated(HRRoleDefinitionEditPage, "hr.roledef.draft");
const HrRoleDefinitionReviewGated = hrGated(HRRoleDefinitionReviewPage, "hr.roledef.review");
const HrRoleDefinitionCompareGated = hrGated(HRRoleDefinitionComparePage, "hr.roledef.read");

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function HRCapsule() {
  return (
    <Suspense fallback={<Fallback />}>
      <Switch>
        {/* Phase 4 expansion (most specific 2-segment under a section) */}
        <Route path="/hr/workforce-planning/job-architecture">
          <HrJobArchitectureGated />
        </Route>
        <Route path="/hr/employee-records/work-permits">
          <HrWorkPermitsGated />
        </Route>
        <Route path="/hr/employee-records/letters-certificates">
          <HrLettersCertificatesGated />
        </Route>
        <Route path="/hr/compliance/risk-management">
          <HrRiskManagementGated />
        </Route>
        <Route path="/hr/security-access/audit-logs">
          <HrAuditLogsGated />
        </Route>
        <Route path="/hr/security-access/access-controls">
          <HrAccessControlsGated />
        </Route>

        {/* Role definitions — static segments before :id */}
        <Route path="/hr/role-definitions/new">
          <HrRoleDefinitionEditGated />
        </Route>
        <Route path="/hr/role-definitions/review">
          <HrRoleDefinitionReviewGated />
        </Route>
        <Route path="/hr/role-definitions/:id/compare">
          <HrRoleDefinitionCompareGated />
        </Route>
        <Route path="/hr/role-definitions/:id/edit">
          <HrRoleDefinitionEditGated />
        </Route>
        <Route path="/hr/role-definitions/:id">
          <HrRoleDefinitionDetailGated />
        </Route>
        <Route path="/hr/role-definitions">
          <HrRoleDefinitionsGated />
        </Route>

        {/* Section landing pages */}
        <Route path="/hr/workforce-planning">
          <HRSectionLandingPage sectionId="workforce-planning" />
        </Route>
        <Route path="/hr/talent-acquisition">
          <HRSectionLandingPage sectionId="talent-acquisition" />
        </Route>
        <Route path="/hr/lifecycle">
          <HRSectionLandingPage sectionId="onboarding-offboarding" />
        </Route>
        <Route path="/hr/employee-records">
          <HRSectionLandingPage sectionId="employee-records" />
        </Route>
        <Route path="/hr/compensation-benefits">
          <HRSectionLandingPage sectionId="compensation-benefits" />
        </Route>
        <Route path="/hr/time-attendance">
          <HRSectionLandingPage sectionId="time-attendance" />
        </Route>
        <Route path="/hr/learning-development">
          <HRSectionLandingPage sectionId="learning-development" />
        </Route>
        <Route path="/hr/performance-talent">
          <HRSectionLandingPage sectionId="performance-talent" />
        </Route>
        <Route path="/hr/employee-relations">
          <HRSectionLandingPage sectionId="employee-relations" />
        </Route>
        <Route path="/hr/wellbeing-engagement">
          <HRSectionLandingPage sectionId="wellbeing-engagement" />
        </Route>
        <Route path="/hr/analytics-reporting">
          <HRSectionLandingPage sectionId="analytics-reporting" />
        </Route>
        <Route path="/hr/security-access">
          <HRSectionLandingPage sectionId="security-access" />
        </Route>
        <Route path="/hr/compliance">
          <HRSectionLandingPage sectionId="compliance" />
        </Route>

        {/* Employee self-service */}
        <Route path="/hr/directory"><HrDirectoryGated /></Route>
        <Route path="/hr/timesheet"><HrTimesheetGated /></Route>
        <Route path="/hr/leave"><HrLeaveGated /></Route>
        <Route path="/hr/goals"><HrGoalsGated /></Route>
        <Route path="/hr/reviews"><HrPerformanceReviewsGated /></Route>
        <Route path="/hr/training"><HrTrainingGated /></Route>
        <Route path="/hr/certifications"><HrCertificationsGated /></Route>
        <Route path="/hr/benefits"><HrBenefitsGated /></Route>
        <Route path="/hr/policies"><HrPoliciesGated /></Route>
        <Route path="/hr/surveys"><HrSurveysGated /></Route>
        <Route path="/hr/engagement"><HrEngagementGated /></Route>
        <Route path="/hr/skills"><HrSkillsGated /></Route>

        {/* Admin / role-gated */}
        <Route path="/hr/organization"><HrOrganizationGated /></Route>
        <Route path="/hr/positions"><HrPositionsGated /></Route>
        <Route path="/hr/staffing"><HrStaffingGated /></Route>
        <Route path="/hr/recruitment"><HrRecruitmentGated /></Route>
        <Route path="/hr/onboarding"><HrOnboardingGated /></Route>
        <Route path="/hr/offboarding"><HrOffboardingGated /></Route>
        <Route path="/hr/overtime"><HrOvertimeGated /></Route>
        <Route path="/hr/shifts"><HrShiftPlanningGated /></Route>
        <Route path="/hr/compensation"><HrCompensationGated /></Route>
        <Route path="/hr/grievances"><HrGrievancesGated /></Route>
        <Route path="/hr/incidents"><HrIncidentsGated /></Route>
        <Route path="/hr/compliance-mgmt"><HrComplianceMgmtGated /></Route>
        <Route path="/hr/analytics"><HrAnalyticsGated /></Route>
        <Route path="/hr/talent"><HrTalentGated /></Route>
        <Route path="/hr/reports"><HrReportsGated /></Route>
        <Route path="/hr/settings"><HrSettingsGated /></Route>

        {/* Bare /hr — home page (NOT gated) */}
        <Route path="/hr"><HRHomePage /></Route>
      </Switch>
    </Suspense>
  );
}
