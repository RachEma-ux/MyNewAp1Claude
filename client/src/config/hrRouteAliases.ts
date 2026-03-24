/**
 * HR Route Aliases — Backward Compatibility Map
 *
 * Maps current flat /hr/* routes to their canonical target routes in the
 * new Carbon SideNav hierarchy. This file ensures:
 *
 * 1. Old bookmarked URLs still resolve correctly
 * 2. Existing deep links in documentation/wikis are preserved
 * 3. Phase 2+ can implement redirect middleware using this map
 * 4. No route breakage during incremental migration
 *
 * Strategy: Old routes remain mounted in App.tsx as-is during Phase 1.
 * When Phase 2 implements the new hierarchical routes, this map drives
 * automatic redirects from old paths to new canonical paths.
 *
 * This file is a companion to hrNavConfig.ts and must stay in sync.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HrRouteAlias {
  /** Current flat route that exists in App.tsx today */
  oldRoute: string;
  /** Target canonical route from the new Carbon SideNav hierarchy */
  newRoute: string;
  /** The page component that currently handles this route */
  component: string;
  /** Whether this redirect is active (Phase 2+) or just documented (Phase 1) */
  status: "documented" | "active-redirect";
  /** Which nav section this route belongs to in the new hierarchy */
  targetSection: string;
}

// ---------------------------------------------------------------------------
// Route Alias Map
// ---------------------------------------------------------------------------

export const HR_ROUTE_ALIASES: HrRouteAlias[] = [
  // --- Workforce Planning & Organization ---
  {
    oldRoute: "/hr/organization",
    newRoute: "/hr/workforce-planning/organization",
    component: "HROrganizationPage",
    status: "documented",
    targetSection: "workforce-planning",
  },
  {
    oldRoute: "/hr/positions",
    newRoute: "/hr/workforce-planning/positions",
    component: "HRPositionsPage",
    status: "documented",
    targetSection: "workforce-planning",
  },

  // --- Talent Acquisition ---
  {
    oldRoute: "/hr/recruitment",
    newRoute: "/hr/talent-acquisition/requests",
    component: "HRRecruitmentPage",
    status: "documented",
    targetSection: "talent-acquisition",
  },

  // --- Onboarding & Offboarding ---
  {
    oldRoute: "/hr/onboarding",
    newRoute: "/hr/lifecycle/onboarding/checklist",
    component: "HROnboardingPage",
    status: "documented",
    targetSection: "onboarding-offboarding",
  },
  {
    oldRoute: "/hr/offboarding",
    newRoute: "/hr/lifecycle/offboarding/termination",
    component: "HROffboardingPage",
    status: "documented",
    targetSection: "onboarding-offboarding",
  },

  // --- Employee Records & Administration ---
  {
    oldRoute: "/hr/directory",
    newRoute: "/hr/employee-records/profile",
    component: "HRDirectoryPage",
    status: "documented",
    targetSection: "employee-records",
  },

  // --- Compensation & Benefits ---
  {
    oldRoute: "/hr/compensation",
    newRoute: "/hr/compensation-benefits/salary-structure",
    component: "HRCompensationPage",
    status: "documented",
    targetSection: "compensation-benefits",
  },
  {
    oldRoute: "/hr/benefits",
    newRoute: "/hr/compensation-benefits/health-insurance",
    component: "HRBenefitsPage",
    status: "documented",
    targetSection: "compensation-benefits",
  },

  // --- Time & Attendance ---
  {
    oldRoute: "/hr/timesheet",
    newRoute: "/hr/time-attendance/time-tracking",
    component: "HRTimesheetPage",
    status: "documented",
    targetSection: "time-attendance",
  },
  {
    oldRoute: "/hr/leave",
    newRoute: "/hr/time-attendance/leave-management",
    component: "HRLeavePage",
    status: "documented",
    targetSection: "time-attendance",
  },
  {
    oldRoute: "/hr/overtime",
    newRoute: "/hr/time-attendance/overtime",
    component: "HROvertimePage",
    status: "documented",
    targetSection: "time-attendance",
  },
  {
    oldRoute: "/hr/shifts",
    newRoute: "/hr/time-attendance/shifts",
    component: "HRShiftPlanningPage",
    status: "documented",
    targetSection: "time-attendance",
  },

  // --- Learning & Development ---
  {
    oldRoute: "/hr/training",
    newRoute: "/hr/learning-development/catalog",
    component: "HRTrainingPage",
    status: "documented",
    targetSection: "learning-development",
  },
  {
    oldRoute: "/hr/skills",
    newRoute: "/hr/learning-development/skills",
    component: "HRSkillsPage",
    status: "documented",
    targetSection: "learning-development",
  },
  {
    oldRoute: "/hr/certifications",
    newRoute: "/hr/learning-development/certifications",
    component: "HRCertificationsPage",
    status: "documented",
    targetSection: "learning-development",
  },

  // --- Performance & Talent Management ---
  {
    oldRoute: "/hr/goals",
    newRoute: "/hr/performance-talent/goals",
    component: "HRGoalsPage",
    status: "documented",
    targetSection: "performance-talent",
  },
  {
    oldRoute: "/hr/reviews",
    newRoute: "/hr/performance-talent/reviews",
    component: "HRPerformanceReviewsPage",
    status: "documented",
    targetSection: "performance-talent",
  },
  {
    oldRoute: "/hr/talent",
    newRoute: "/hr/performance-talent/talent-reviews",
    component: "HRTalentPage",
    status: "documented",
    targetSection: "performance-talent",
  },

  // --- Employee Relations ---
  {
    oldRoute: "/hr/policies",
    newRoute: "/hr/employee-relations/policies",
    component: "HRPoliciesPage",
    status: "documented",
    targetSection: "employee-relations",
  },
  {
    oldRoute: "/hr/grievances",
    newRoute: "/hr/employee-relations/grievances",
    component: "HRGrievancesPage",
    status: "documented",
    targetSection: "employee-relations",
  },

  // --- Well Being & Engagement ---
  {
    oldRoute: "/hr/surveys",
    newRoute: "/hr/wellbeing-engagement/surveys",
    component: "HRSurveysPage",
    status: "documented",
    targetSection: "wellbeing-engagement",
  },
  {
    oldRoute: "/hr/engagement",
    newRoute: "/hr/wellbeing-engagement/programs",
    component: "HREngagementPage",
    status: "documented",
    targetSection: "wellbeing-engagement",
  },

  // --- HR Analytics & Reporting ---
  {
    oldRoute: "/hr/analytics",
    newRoute: "/hr/analytics-reporting/workforce-dashboards",
    component: "HRAnalyticsDashboardPage",
    status: "documented",
    targetSection: "analytics-reporting",
  },
  {
    oldRoute: "/hr/reports",
    newRoute: "/hr/analytics-reporting/compliance-reports",
    component: "HRReportsPage",
    status: "documented",
    targetSection: "analytics-reporting",
  },

  // --- Security & Access ---
  {
    oldRoute: "/hr/settings",
    newRoute: "/hr/security-access/roles",
    component: "HRSettingsPage",
    status: "documented",
    targetSection: "security-access",
  },

  // --- Staffing (standalone page with no direct leaf in new nav) ---
  {
    oldRoute: "/hr/staffing",
    newRoute: "/hr/workforce-planning/positions",
    component: "HRStaffingPage",
    status: "documented",
    targetSection: "workforce-planning",
  },

  // --- Compliance ---
  {
    oldRoute: "/hr/incidents",
    newRoute: "/hr/compliance/incidents",
    component: "HRIncidentsPage",
    status: "documented",
    targetSection: "compliance",
  },
  {
    oldRoute: "/hr/compliance-mgmt",
    newRoute: "/hr/compliance/management",
    component: "HRComplianceMgmtPage",
    status: "documented",
    targetSection: "compliance",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lookup the new canonical route for an old flat route */
export function resolveNewRoute(oldRoute: string): string | undefined {
  return HR_ROUTE_ALIASES.find((a) => a.oldRoute === oldRoute)?.newRoute;
}

/** Lookup the old flat route that maps to a new canonical route */
export function resolveOldRoute(newRoute: string): string | undefined {
  return HR_ROUTE_ALIASES.find((a) => a.newRoute === newRoute)?.oldRoute;
}

/** Get all old routes that need redirects */
export function getAllOldRoutes(): string[] {
  return HR_ROUTE_ALIASES.map((a) => a.oldRoute);
}

/** Get all aliases for a given section */
export function getAliasesForSection(sectionId: string): HrRouteAlias[] {
  return HR_ROUTE_ALIASES.filter((a) => a.targetSection === sectionId);
}
