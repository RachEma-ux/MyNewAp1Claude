/**
 * HR Carbon SideNav — Canonical Navigation Configuration
 *
 * This file is the SINGLE SOURCE OF TRUTH for the HR module navigation model.
 * All sidebar rendering, route resolution, permission gating, and governance
 * documentation should derive from this configuration.
 *
 * Phase 1 deliverable — nav model + capability mapping.
 * Phase 3 deliverable — masking, audit, and scope metadata.
 * Phase 2+ will consume this config to render the actual Carbon SideNav.
 *
 * Every item includes:
 *   id, label, href, section, iconHint, purpose,
 *   requiredAction, scopeType, visibilityMode, backedBy,
 *   backendDomain, implementationStatus,
 *   currentRoute (if different from target href),
 *   currentComponent (if an existing page backs it),
 *   maskingRequired, maskingFieldSet, sensitiveReadAudit,
 *   sensitiveAction, scopeActions (Phase 3)
 */

// ---------------------------------------------------------------------------
// Phase 9 — Backend Domain Constants (reduces drift from string typos)
// ---------------------------------------------------------------------------

export const HR_BACKEND_DOMAINS = {
  ORGANIZATION: "organization",
  STAFFING: "staffing",
  RECRUITING: "recruiting",
  LIFECYCLE: "lifecycle",
  DIRECTORY: "directory",
  COMPENSATION: "compensation",
  TIME: "time",
  LEARNING: "learning",
  PERFORMANCE: "performance",
  RELATIONS: "relations",
  ENGAGEMENT: "engagement",
  COMPLIANCE: "compliance",
  ANALYTICS: "analytics",
  TALENT: "talent",
} as const;

export type HrBackendDomain = typeof HR_BACKEND_DOMAINS[keyof typeof HR_BACKEND_DOMAINS];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScopeType = "self" | "team" | "all" | "sensitive" | "mixed";

export type VisibilityMode =
  | "show"
  | "hide-if-no-access"
  | "show-disabled"
  | "redirect-to-parent";

export type BackedBy =
  | "existing-page"
  | "new-page"
  | "tab-in-existing-page"
  | "not-yet-implemented";

export type ImplementationStatus =
  | "live"
  | "placeholder"
  | "planned"
  | "not-started";

export type MaskingFieldSet = "directory" | "compensation" | "relations" | "talent";

export interface HrNavItem {
  id: string;
  label: string;
  href: string;
  section: string;
  iconHint?: string;
  purpose?: string;
  requiredAction: string;
  scopeType: ScopeType;
  visibilityMode: VisibilityMode;
  backedBy: BackedBy;
  backendDomain: string;
  implementationStatus: ImplementationStatus;
  /** Current flat route that already serves this capability (if any) */
  currentRoute?: string;
  /** Current React component filename backing this item (if any) */
  currentComponent?: string;

  // --- Phase 3: Permission & Scope Metadata ---

  /** Whether backend applies field masking to responses for this capability */
  maskingRequired?: boolean;
  /** Which field masking set is applied (maps to server/hr/permissions.ts masking functions) */
  maskingFieldSet?: MaskingFieldSet;
  /** Whether reads of this data trigger sensitive-read audit logging */
  sensitiveReadAudit?: boolean;
  /** The elevated permission action that grants unmasked/full access */
  sensitiveAction?: string;
  /** Scope resolution actions consumed by resolveDataScope() on the backend */
  scopeActions?: {
    global?: string;
    team?: string;
    self?: string;
  };
}

export interface HrNavSection {
  id: string;
  label: string;
  iconHint: string;
  purpose: string;
  href: string;
  requiredAction: string;
  scopeType: ScopeType;
  visibilityMode: VisibilityMode;
  backedBy: BackedBy;
  backendDomain: string;
  implementationStatus: ImplementationStatus;
  currentRoute?: string;
  currentComponent?: string;
  items: HrNavItem[];
}

export interface HrNavModule {
  id: string;
  label: string;
  baseRoute: string;
  sections: HrNavSection[];
}

// ---------------------------------------------------------------------------
// Canonical Navigation Model
// ---------------------------------------------------------------------------

export const HR_NAV_CONFIG: HrNavModule = {
  id: "human-resources",
  label: "Human Resources",
  baseRoute: "/hr",

  sections: [
    // -----------------------------------------------------------------------
    // 1. Workforce Planning & Organization
    // -----------------------------------------------------------------------
    {
      id: "workforce-planning",
      label: "Workforce Planning & Organization",
      iconHint: "organization",
      purpose:
        "Strategic planning of workforce needs, organizational design, and role structures to support long term business goals.",
      href: "/hr/workforce-planning",
      requiredAction: "hr.organization.read",
      scopeType: "all",
      visibilityMode: "hide-if-no-access",
      backedBy: "not-yet-implemented",
      backendDomain: "organization",
      implementationStatus: "planned",
      items: [
        {
          id: "workforce-planning-core",
          label: "Workforce Planning",
          href: "/hr/workforce-planning/planning",
          section: "workforce-planning",
          iconHint: "chart-line",
          purpose: "Strategic workforce demand and supply planning.",
          requiredAction: "hr.organization.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "organization",
          implementationStatus: "not-started",
        },
        {
          id: "job-architecture",
          label: "Job Architecture & Role Definitions",
          href: "/hr/workforce-planning/job-architecture",
          section: "workforce-planning",
          iconHint: "layers",
          purpose: "Manage job families, levels, and role definitions.",
          requiredAction: "hr.organization.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "organization",
          implementationStatus: "live",
          currentRoute: "/hr/workforce-planning/job-architecture",
          currentComponent: "HRJobArchitecturePage",
        },
        {
          id: "org-structure",
          label: "Organizational Structure",
          href: "/hr/workforce-planning/organization",
          section: "workforce-planning",
          iconHint: "diagram",
          purpose: "View and manage org units, hierarchy, and reporting lines.",
          requiredAction: "hr.organization.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "organization",
          implementationStatus: "live",
          currentRoute: "/hr/organization",
          currentComponent: "HROrganizationPage",
        },
        {
          id: "headcount-budget",
          label: "Headcount & Budget Planning",
          href: "/hr/workforce-planning/headcount-budget",
          section: "workforce-planning",
          iconHint: "calculator",
          purpose: "Plan headcount targets and budget allocation.",
          requiredAction: "hr.organization.write",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "organization",
          implementationStatus: "not-started",
        },
        {
          id: "position-management",
          label: "Position Management",
          href: "/hr/workforce-planning/positions",
          section: "workforce-planning",
          iconHint: "briefcase",
          purpose: "Manage approved positions, vacancies, and fill status.",
          requiredAction: "hr.staffing.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "staffing",
          implementationStatus: "live",
          currentRoute: "/hr/positions",
          currentComponent: "HRPositionsPage",
        },
        {
          id: "role-definitions",
          label: "Role Definitions",
          href: "/hr/role-definitions",
          section: "workforce-planning",
          iconHint: "clipboard",
          purpose: "Manage canonical, versioned, effective-dated role definitions with lifecycle governance.",
          requiredAction: "hr.roledef.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "roleDefinitions",
          implementationStatus: "live",
          currentRoute: "/hr/role-definitions",
          currentComponent: "HRRoleDefinitionsPage",
          maskingRequired: true,
          maskingFieldSet: undefined,
          sensitiveReadAudit: true,
          sensitiveAction: "hr.roledef.read.restricted",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 2. Talent Acquisition
    // -----------------------------------------------------------------------
    {
      id: "talent-acquisition",
      label: "Talent Acquisition",
      iconHint: "user-follow",
      purpose:
        "Attract, source, evaluate, and hire the right talent efficiently and consistently.",
      href: "/hr/talent-acquisition",
      requiredAction: "hr.recruiting.read",
      scopeType: "all",
      visibilityMode: "hide-if-no-access",
      backedBy: "not-yet-implemented",
      backendDomain: "recruiting",
      implementationStatus: "planned",
      items: [
        {
          id: "recruitment-requests",
          label: "Recruitment Requests",
          href: "/hr/talent-acquisition/requests",
          section: "talent-acquisition",
          iconHint: "clipboard",
          purpose: "Create and track recruitment requisitions.",
          requiredAction: "hr.recruiting.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "recruiting",
          implementationStatus: "live",
          currentRoute: "/hr/recruitment",
          currentComponent: "HRRecruitmentPage",
        },
        {
          id: "job-posting-sourcing",
          label: "Job Posting & Sourcing",
          href: "/hr/talent-acquisition/job-posting",
          section: "talent-acquisition",
          iconHint: "megaphone",
          purpose: "Publish job openings and manage sourcing channels.",
          requiredAction: "hr.recruiting.write",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "recruiting",
          implementationStatus: "not-started",
        },
        {
          id: "candidate-pipeline",
          label: "Candidate Pipeline",
          href: "/hr/talent-acquisition/pipeline",
          section: "talent-acquisition",
          iconHint: "funnel",
          purpose: "Track candidates through recruitment stages.",
          requiredAction: "hr.recruiting.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "recruiting",
          implementationStatus: "not-started",
        },
        {
          id: "interview-management",
          label: "Interview Management",
          href: "/hr/talent-acquisition/interviews",
          section: "talent-acquisition",
          iconHint: "calendar",
          purpose: "Schedule and manage interview rounds.",
          requiredAction: "hr.recruiting.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "recruiting",
          implementationStatus: "not-started",
        },
        {
          id: "offer-management",
          label: "Offer Management",
          href: "/hr/talent-acquisition/offers",
          section: "talent-acquisition",
          iconHint: "document",
          purpose: "Create, approve, and track job offers.",
          requiredAction: "hr.recruiting.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "recruiting",
          implementationStatus: "not-started",
        },
        {
          id: "pre-boarding",
          label: "Pre boarding",
          href: "/hr/talent-acquisition/pre-boarding",
          section: "talent-acquisition",
          iconHint: "checklist",
          purpose: "Pre-hire activities before formal onboarding begins.",
          requiredAction: "hr.onboarding.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "lifecycle",
          implementationStatus: "not-started",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 3. Onboarding & Offboarding
    // -----------------------------------------------------------------------
    {
      id: "onboarding-offboarding",
      label: "Onboarding & Offboarding",
      iconHint: "flow",
      purpose:
        "Ensure smooth transitions into and out of the organization through structured workflows and compliance aligned processes.",
      href: "/hr/lifecycle",
      requiredAction: "hr.lifecycle.read",
      scopeType: "all",
      visibilityMode: "hide-if-no-access",
      backedBy: "not-yet-implemented",
      backendDomain: "lifecycle",
      implementationStatus: "planned",
      items: [
        {
          id: "onboarding-checklist",
          label: "Onboarding / New Hire Checklist",
          href: "/hr/lifecycle/onboarding/checklist",
          section: "onboarding-offboarding",
          iconHint: "checklist",
          purpose: "Track new hire onboarding task completion.",
          requiredAction: "hr.onboarding.read",
          scopeType: "mixed",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "lifecycle",
          implementationStatus: "live",
          currentRoute: "/hr/onboarding",
          currentComponent: "HROnboardingPage",
        },
        {
          id: "onboarding-documents",
          label: "Onboarding / Document Collection",
          href: "/hr/lifecycle/onboarding/documents",
          section: "onboarding-offboarding",
          iconHint: "document",
          purpose: "Collect and verify required hire documents.",
          requiredAction: "hr.onboarding.manage",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "lifecycle",
          implementationStatus: "not-started",
        },
        {
          id: "onboarding-access",
          label: "Onboarding / Equipment & Access Setup",
          href: "/hr/lifecycle/onboarding/access-setup",
          section: "onboarding-offboarding",
          iconHint: "key",
          purpose: "Provision equipment and system access for new hires.",
          requiredAction: "hr.onboarding.manage",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "lifecycle",
          implementationStatus: "not-started",
        },
        {
          id: "onboarding-orientation",
          label: "Onboarding / Orientation & Training",
          href: "/hr/lifecycle/onboarding/orientation-training",
          section: "onboarding-offboarding",
          iconHint: "education",
          purpose: "Manage orientation sessions and initial training.",
          requiredAction: "hr.onboarding.read",
          scopeType: "mixed",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "lifecycle",
          implementationStatus: "not-started",
        },
        {
          id: "offboarding-termination",
          label: "Offboarding / Resignation & Termination",
          href: "/hr/lifecycle/offboarding/termination",
          section: "onboarding-offboarding",
          iconHint: "user-minus",
          purpose: "Process resignations and terminations.",
          requiredAction: "hr.offboarding.read",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "lifecycle",
          implementationStatus: "live",
          currentRoute: "/hr/offboarding",
          currentComponent: "HROffboardingPage",
        },
        {
          id: "offboarding-knowledge-transfer",
          label: "Offboarding / Knowledge Transfer",
          href: "/hr/lifecycle/offboarding/knowledge-transfer",
          section: "onboarding-offboarding",
          iconHint: "share",
          purpose: "Coordinate knowledge handover from departing employees.",
          requiredAction: "hr.offboarding.manage",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "lifecycle",
          implementationStatus: "not-started",
        },
        {
          id: "offboarding-exit-interview",
          label: "Offboarding / Exit Interview",
          href: "/hr/lifecycle/offboarding/exit-interview",
          section: "onboarding-offboarding",
          iconHint: "chat",
          purpose: "Conduct and record exit interviews.",
          requiredAction: "hr.offboarding.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "lifecycle",
          implementationStatus: "not-started",
        },
        {
          id: "offboarding-access-removal",
          label: "Offboarding / Access Removal",
          href: "/hr/lifecycle/offboarding/access-removal",
          section: "onboarding-offboarding",
          iconHint: "lock",
          purpose: "Revoke system access and recover equipment.",
          requiredAction: "hr.offboarding.manage",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "lifecycle",
          implementationStatus: "not-started",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 4. Employee Records & Administration
    // -----------------------------------------------------------------------
    {
      id: "employee-records",
      label: "Employee Records & Administration",
      iconHint: "document",
      purpose:
        "Maintain accurate, compliant, and accessible employee data throughout the employment lifecycle.",
      href: "/hr/employee-records",
      requiredAction: "hr.directory.read",
      scopeType: "mixed",
      visibilityMode: "show",
      backedBy: "not-yet-implemented",
      backendDomain: "directory",
      implementationStatus: "planned",
      items: [
        {
          id: "employee-profile",
          label: "Employee Profile",
          href: "/hr/employee-records/profile",
          section: "employee-records",
          iconHint: "user",
          purpose: "View and manage employee profile information.",
          requiredAction: "hr.directory.read",
          scopeType: "mixed",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "directory",
          implementationStatus: "live",
          currentRoute: "/hr/directory",
          currentComponent: "HRDirectoryPage",
          maskingRequired: true,
          maskingFieldSet: "directory",
          sensitiveReadAudit: false,
          scopeActions: {
            global: "hr.directory.read",
            team: "hr.directory.read.team",
            self: "hr.directory.read.self",
          },
        },
        {
          id: "contracts-documents",
          label: "Contracts & Documents",
          href: "/hr/employee-records/contracts-documents",
          section: "employee-records",
          iconHint: "document-stack",
          purpose: "Manage employment contracts and official documents.",
          requiredAction: "hr.directory.read",
          scopeType: "mixed",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "directory",
          implementationStatus: "not-started",
          maskingRequired: true,
          maskingFieldSet: "directory",
        },
        {
          id: "employment-changes",
          label: "Employment Changes",
          href: "/hr/employee-records/employment-changes",
          section: "employee-records",
          iconHint: "edit",
          purpose: "Track promotions, transfers, and role changes.",
          requiredAction: "hr.directory.write",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "directory",
          implementationStatus: "not-started",
          maskingRequired: true,
          maskingFieldSet: "directory",
        },
        {
          id: "work-permits-compliance",
          label: "Work Permits & Compliance",
          href: "/hr/employee-records/work-permits",
          section: "employee-records",
          iconHint: "certificate",
          purpose: "Track work authorization and permit expiry.",
          requiredAction: "hr.compliance.read",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "compliance",
          implementationStatus: "live",
          currentRoute: "/hr/employee-records/work-permits",
          currentComponent: "HRWorkPermitsPage",
        },
        {
          id: "hr-letters-certificates",
          label: "HR Letters & Certificates",
          href: "/hr/employee-records/letters-certificates",
          section: "employee-records",
          iconHint: "mail",
          purpose: "Generate and manage HR letters and certificates.",
          requiredAction: "hr.directory.read",
          scopeType: "mixed",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "directory",
          implementationStatus: "live",
          currentRoute: "/hr/employee-records/letters-certificates",
          currentComponent: "HRLettersCertificatesPage",
          maskingRequired: true,
          maskingFieldSet: "directory",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 5. Compensation & Benefits
    // -----------------------------------------------------------------------
    {
      id: "compensation-benefits",
      label: "Compensation & Benefits",
      iconHint: "currency",
      purpose:
        "Manage employee compensation, benefits, and rewards to ensure fairness, competitiveness, and retention.",
      href: "/hr/compensation-benefits",
      requiredAction: "hr.compensation.read",
      scopeType: "sensitive",
      visibilityMode: "hide-if-no-access",
      backedBy: "not-yet-implemented",
      backendDomain: "compensation",
      implementationStatus: "planned",
      items: [
        {
          id: "salary-structure",
          label: "Compensation / Salary Structure",
          href: "/hr/compensation-benefits/salary-structure",
          section: "compensation-benefits",
          iconHint: "chart-bar",
          purpose: "Define salary bands, grades, and pay structures.",
          requiredAction: "hr.compensation.read",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "compensation",
          implementationStatus: "live",
          currentRoute: "/hr/compensation",
          currentComponent: "HRCompensationPage",
          maskingRequired: true,
          maskingFieldSet: "compensation",
          sensitiveReadAudit: true,
          sensitiveAction: "hr.compensation.read.sensitive",
        },
        {
          id: "annual-salary-review",
          label: "Compensation / Annual Salary Review",
          href: "/hr/compensation-benefits/salary-review",
          section: "compensation-benefits",
          iconHint: "calendar",
          purpose: "Manage annual salary review cycles.",
          requiredAction: "hr.compensation.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "compensation",
          implementationStatus: "not-started",
          maskingRequired: true,
          maskingFieldSet: "compensation",
          sensitiveReadAudit: true,
          sensitiveAction: "hr.compensation.read.sensitive",
        },
        {
          id: "bonus-incentives",
          label: "Compensation / Bonus & Incentives",
          href: "/hr/compensation-benefits/bonus-incentives",
          section: "compensation-benefits",
          iconHint: "trophy",
          purpose: "Manage bonus programs and incentive payouts.",
          requiredAction: "hr.compensation.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "compensation",
          implementationStatus: "not-started",
          maskingRequired: true,
          maskingFieldSet: "compensation",
          sensitiveReadAudit: true,
          sensitiveAction: "hr.compensation.read.sensitive",
        },
        {
          id: "health-insurance",
          label: "Benefits / Health & Insurance Plans",
          href: "/hr/compensation-benefits/health-insurance",
          section: "compensation-benefits",
          iconHint: "heart",
          purpose: "Manage health and insurance benefit plans.",
          requiredAction: "hr.benefits.read",
          scopeType: "mixed",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "compensation",
          implementationStatus: "live",
          currentRoute: "/hr/benefits",
          currentComponent: "HRBenefitsPage",
          maskingRequired: true,
          maskingFieldSet: "compensation",
          sensitiveReadAudit: true,
          sensitiveAction: "hr.compensation.read.sensitive",
        },
        {
          id: "pension-retirement",
          label: "Benefits / Pension & Retirement",
          href: "/hr/compensation-benefits/pension-retirement",
          section: "compensation-benefits",
          iconHint: "bank",
          purpose: "Manage pension and retirement benefit plans.",
          requiredAction: "hr.benefits.read",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "compensation",
          implementationStatus: "not-started",
          maskingRequired: true,
          maskingFieldSet: "compensation",
          sensitiveReadAudit: true,
          sensitiveAction: "hr.compensation.read.sensitive",
        },
        {
          id: "allowances-perks",
          label: "Benefits / Allowances & Perks",
          href: "/hr/compensation-benefits/allowances-perks",
          section: "compensation-benefits",
          iconHint: "gift",
          purpose: "Manage employee allowances and perks programs.",
          requiredAction: "hr.benefits.read",
          scopeType: "mixed",
          visibilityMode: "show",
          backedBy: "not-yet-implemented",
          backendDomain: "compensation",
          implementationStatus: "not-started",
          maskingRequired: true,
          maskingFieldSet: "compensation",
          sensitiveReadAudit: true,
          sensitiveAction: "hr.compensation.read.sensitive",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 6. Time & Attendance
    // -----------------------------------------------------------------------
    {
      id: "time-attendance",
      label: "Time & Attendance",
      iconHint: "time",
      purpose:
        "Track working hours, absences, and schedules to support payroll accuracy and workforce efficiency.",
      href: "/hr/time-attendance",
      requiredAction: "hr.time.read",
      scopeType: "mixed",
      visibilityMode: "show",
      backedBy: "not-yet-implemented",
      backendDomain: "time",
      implementationStatus: "planned",
      items: [
        {
          id: "time-tracking",
          label: "Time Tracking",
          href: "/hr/time-attendance/time-tracking",
          section: "time-attendance",
          iconHint: "clock",
          purpose: "Log and review daily working hours.",
          requiredAction: "hr.time.read",
          scopeType: "self",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "time",
          implementationStatus: "live",
          currentRoute: "/hr/timesheet",
          currentComponent: "HRTimesheetPage",
          scopeActions: {
            global: "hr.time.read",
            team: "hr.time.read.team",
            self: "hr.time.read.self",
          },
        },
        {
          id: "leave-management",
          label: "Absence & Leave Management",
          href: "/hr/time-attendance/leave-management",
          section: "time-attendance",
          iconHint: "calendar-off",
          purpose: "Request, approve, and track leave and absences.",
          requiredAction: "hr.leave.read",
          scopeType: "self",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "time",
          implementationStatus: "live",
          currentRoute: "/hr/leave",
          currentComponent: "HRLeavePage",
          scopeActions: {
            global: "hr.leave.read",
            self: "hr.leave.read.self",
          },
        },
        {
          id: "overtime-requests",
          label: "Overtime Requests",
          href: "/hr/time-attendance/overtime",
          section: "time-attendance",
          iconHint: "clock-plus",
          purpose: "Submit and approve overtime work requests.",
          requiredAction: "hr.overtime.read",
          scopeType: "mixed",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "time",
          implementationStatus: "live",
          currentRoute: "/hr/overtime",
          currentComponent: "HROvertimePage",
        },
        {
          id: "shift-planning",
          label: "Shift Planning",
          href: "/hr/time-attendance/shifts",
          section: "time-attendance",
          iconHint: "calendar-grid",
          purpose: "Plan and assign employee shift schedules.",
          requiredAction: "hr.shift.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "time",
          implementationStatus: "live",
          currentRoute: "/hr/shifts",
          currentComponent: "HRShiftPlanningPage",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 7. Learning & Development
    // -----------------------------------------------------------------------
    {
      id: "learning-development",
      label: "Learning & Development",
      iconHint: "education",
      purpose:
        "Build employee skills, support career growth, and maintain compliance through structured learning programs.",
      href: "/hr/learning-development",
      requiredAction: "hr.learning.read",
      scopeType: "mixed",
      visibilityMode: "show",
      backedBy: "not-yet-implemented",
      backendDomain: "learning",
      implementationStatus: "planned",
      items: [
        {
          id: "training-catalog",
          label: "Training Catalog",
          href: "/hr/learning-development/catalog",
          section: "learning-development",
          iconHint: "book",
          purpose: "Browse available training courses and programs.",
          requiredAction: "hr.learning.read",
          scopeType: "self",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "learning",
          implementationStatus: "live",
          currentRoute: "/hr/training",
          currentComponent: "HRTrainingPage",
          scopeActions: {
            global: "hr.learning.read",
            self: "hr.learning.read.self",
          },
        },
        {
          id: "mandatory-training",
          label: "Mandatory Training",
          href: "/hr/learning-development/mandatory",
          section: "learning-development",
          iconHint: "alert",
          purpose: "Track required compliance and mandatory training.",
          requiredAction: "hr.learning.read",
          scopeType: "mixed",
          visibilityMode: "show",
          backedBy: "not-yet-implemented",
          backendDomain: "learning",
          implementationStatus: "not-started",
        },
        {
          id: "skill-development",
          label: "Skill Development",
          href: "/hr/learning-development/skills",
          section: "learning-development",
          iconHint: "trending-up",
          purpose: "Manage and develop employee skills inventory.",
          requiredAction: "hr.learning.read",
          scopeType: "mixed",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "staffing",
          implementationStatus: "live",
          currentRoute: "/hr/skills",
          currentComponent: "HRSkillsPage",
        },
        {
          id: "certifications",
          label: "Certifications",
          href: "/hr/learning-development/certifications",
          section: "learning-development",
          iconHint: "certificate",
          purpose: "Track employee certifications and renewal dates.",
          requiredAction: "hr.certification.read",
          scopeType: "mixed",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "learning",
          implementationStatus: "live",
          currentRoute: "/hr/certifications",
          currentComponent: "HRCertificationsPage",
        },
        {
          id: "learning-history",
          label: "Learning History",
          href: "/hr/learning-development/history",
          section: "learning-development",
          iconHint: "history",
          purpose: "View completed training and learning records.",
          requiredAction: "hr.learning.read",
          scopeType: "self",
          visibilityMode: "show",
          backedBy: "not-yet-implemented",
          backendDomain: "learning",
          implementationStatus: "not-started",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 8. Performance & Talent Management
    // -----------------------------------------------------------------------
    {
      id: "performance-talent",
      label: "Performance & Talent Management",
      iconHint: "chart-line",
      purpose:
        "Align goals, evaluate performance, and develop talent to strengthen organizational capability.",
      href: "/hr/performance-talent",
      requiredAction: "hr.performance.read",
      scopeType: "mixed",
      visibilityMode: "show",
      backedBy: "not-yet-implemented",
      backendDomain: "performance",
      implementationStatus: "planned",
      items: [
        {
          id: "goal-setting",
          label: "Goal Setting",
          href: "/hr/performance-talent/goals",
          section: "performance-talent",
          iconHint: "target",
          purpose: "Set and track individual and team goals.",
          requiredAction: "hr.performance.read",
          scopeType: "self",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "performance",
          implementationStatus: "live",
          currentRoute: "/hr/goals",
          currentComponent: "HRGoalsPage",
          scopeActions: {
            global: "hr.performance.read",
            self: "hr.performance.read.self",
          },
        },
        {
          id: "performance-reviews",
          label: "Performance Reviews",
          href: "/hr/performance-talent/reviews",
          section: "performance-talent",
          iconHint: "clipboard-check",
          purpose: "Conduct and manage performance review cycles.",
          requiredAction: "hr.performance.read",
          scopeType: "mixed",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "performance",
          implementationStatus: "live",
          currentRoute: "/hr/reviews",
          currentComponent: "HRPerformanceReviewsPage",
          scopeActions: {
            global: "hr.performance.read",
            self: "hr.performance.read.self",
          },
        },
        {
          id: "feedback-360",
          label: "360 Feedback",
          href: "/hr/performance-talent/360-feedback",
          section: "performance-talent",
          iconHint: "refresh",
          purpose: "Collect multi-source feedback for comprehensive evaluation.",
          requiredAction: "hr.performance.read",
          scopeType: "mixed",
          visibilityMode: "show",
          backedBy: "not-yet-implemented",
          backendDomain: "performance",
          implementationStatus: "not-started",
        },
        {
          id: "talent-reviews",
          label: "Talent Reviews",
          href: "/hr/performance-talent/talent-reviews",
          section: "performance-talent",
          iconHint: "users",
          purpose: "Assess talent pool strength and development needs.",
          requiredAction: "hr.talent.read",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "talent",
          implementationStatus: "live",
          currentRoute: "/hr/talent",
          currentComponent: "HRTalentPage",
          maskingRequired: true,
          maskingFieldSet: "talent",
          sensitiveReadAudit: true,
          sensitiveAction: "hr.talent.write",
        },
        {
          id: "succession-planning",
          label: "Succession Planning",
          href: "/hr/performance-talent/succession",
          section: "performance-talent",
          iconHint: "path",
          purpose: "Identify and develop successors for critical roles.",
          requiredAction: "hr.succession.read",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "talent",
          implementationStatus: "not-started",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 9. Employee Relations
    // -----------------------------------------------------------------------
    {
      id: "employee-relations",
      label: "Employee Relations",
      iconHint: "user-activity",
      purpose:
        "Manage workplace issues, maintain fairness, and ensure consistent application of HR policies.",
      href: "/hr/employee-relations",
      requiredAction: "hr.relations.read",
      scopeType: "sensitive",
      visibilityMode: "hide-if-no-access",
      backedBy: "not-yet-implemented",
      backendDomain: "relations",
      implementationStatus: "planned",
      items: [
        {
          id: "hr-policies",
          label: "HR Policies",
          href: "/hr/employee-relations/policies",
          section: "employee-relations",
          iconHint: "file-text",
          purpose: "View and manage HR policies and handbooks.",
          requiredAction: "hr.policy.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "relations",
          implementationStatus: "live",
          currentRoute: "/hr/policies",
          currentComponent: "HRPoliciesPage",
        },
        {
          id: "grievances-complaints",
          label: "Grievances & Complaints",
          href: "/hr/employee-relations/grievances",
          section: "employee-relations",
          iconHint: "alert-triangle",
          purpose: "File and track employee grievances and complaints.",
          requiredAction: "hr.relations.read",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "relations",
          implementationStatus: "live",
          currentRoute: "/hr/grievances",
          currentComponent: "HRGrievancesPage",
          maskingRequired: true,
          maskingFieldSet: "relations",
          sensitiveReadAudit: true,
          sensitiveAction: "hr.relations.read.sensitive",
        },
        {
          id: "disciplinary-actions",
          label: "Disciplinary Actions",
          href: "/hr/employee-relations/disciplinary-actions",
          section: "employee-relations",
          iconHint: "gavel",
          purpose: "Manage disciplinary cases and progressive discipline.",
          requiredAction: "hr.relations.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "relations",
          implementationStatus: "not-started",
          maskingRequired: true,
          maskingFieldSet: "relations",
          sensitiveReadAudit: true,
          sensitiveAction: "hr.relations.read.sensitive",
        },
        {
          id: "workplace-investigations",
          label: "Workplace Investigations",
          href: "/hr/employee-relations/investigations",
          section: "employee-relations",
          iconHint: "search",
          purpose: "Conduct and document workplace investigations.",
          requiredAction: "hr.relations.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "relations",
          implementationStatus: "not-started",
          maskingRequired: true,
          maskingFieldSet: "relations",
          sensitiveReadAudit: true,
          sensitiveAction: "hr.relations.read.sensitive",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 10. Well Being & Engagement
    // -----------------------------------------------------------------------
    {
      id: "wellbeing-engagement",
      label: "Well Being & Engagement",
      iconHint: "wellness",
      purpose:
        "Support employee well being, measure engagement, and foster a positive workplace culture.",
      href: "/hr/wellbeing-engagement",
      requiredAction: "hr.engagement.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "not-yet-implemented",
      backendDomain: "engagement",
      implementationStatus: "planned",
      items: [
        {
          id: "employee-surveys",
          label: "Employee Surveys",
          href: "/hr/wellbeing-engagement/surveys",
          section: "wellbeing-engagement",
          iconHint: "form",
          purpose: "Create and distribute employee surveys.",
          requiredAction: "hr.survey.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "engagement",
          implementationStatus: "live",
          currentRoute: "/hr/surveys",
          currentComponent: "HRSurveysPage",
        },
        {
          id: "engagement-programs",
          label: "Engagement Programs",
          href: "/hr/wellbeing-engagement/programs",
          section: "wellbeing-engagement",
          iconHint: "sparkles",
          purpose: "Manage employee engagement initiatives.",
          requiredAction: "hr.engagement.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "engagement",
          implementationStatus: "live",
          currentRoute: "/hr/engagement",
          currentComponent: "HREngagementPage",
        },
        {
          id: "wellbeing-resources",
          label: "Well being Resources",
          href: "/hr/wellbeing-engagement/resources",
          section: "wellbeing-engagement",
          iconHint: "heart",
          purpose: "Access wellness programs and support resources.",
          requiredAction: "hr.engagement.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "not-yet-implemented",
          backendDomain: "engagement",
          implementationStatus: "not-started",
        },
        {
          id: "recognition-programs",
          label: "Recognition Programs",
          href: "/hr/wellbeing-engagement/recognition",
          section: "wellbeing-engagement",
          iconHint: "award",
          purpose: "Recognize and reward employee achievements.",
          requiredAction: "hr.recognition.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "not-yet-implemented",
          backendDomain: "engagement",
          implementationStatus: "not-started",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 11. HR Analytics & Reporting
    // -----------------------------------------------------------------------
    {
      id: "analytics-reporting",
      label: "HR Analytics & Reporting",
      iconHint: "analytics",
      purpose:
        "Provide insights, dashboards, and metrics to support data driven HR and business decisions.",
      href: "/hr/analytics-reporting",
      requiredAction: "hr.analytics.read",
      scopeType: "all",
      visibilityMode: "hide-if-no-access",
      backedBy: "not-yet-implemented",
      backendDomain: "analytics",
      implementationStatus: "planned",
      items: [
        {
          id: "workforce-dashboards",
          label: "Workforce Dashboards",
          href: "/hr/analytics-reporting/workforce-dashboards",
          section: "analytics-reporting",
          iconHint: "dashboard",
          purpose: "View workforce metrics and KPI dashboards.",
          requiredAction: "hr.analytics.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "analytics",
          implementationStatus: "live",
          currentRoute: "/hr/analytics",
          currentComponent: "HRAnalyticsDashboardPage",
        },
        {
          id: "attrition-retention",
          label: "Attrition & Retention",
          href: "/hr/analytics-reporting/attrition-retention",
          section: "analytics-reporting",
          iconHint: "trending-down",
          purpose: "Analyze attrition trends and retention metrics.",
          requiredAction: "hr.analytics.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "analytics",
          implementationStatus: "not-started",
        },
        {
          id: "diversity-inclusion",
          label: "Diversity & Inclusion Metrics",
          href: "/hr/analytics-reporting/diversity-inclusion",
          section: "analytics-reporting",
          iconHint: "globe",
          purpose: "Track diversity and inclusion KPIs.",
          requiredAction: "hr.analytics.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "analytics",
          implementationStatus: "not-started",
        },
        {
          id: "compliance-reports",
          label: "Compliance Reports",
          href: "/hr/analytics-reporting/compliance-reports",
          section: "analytics-reporting",
          iconHint: "file-check",
          purpose: "Generate compliance and regulatory reports.",
          requiredAction: "hr.analytics.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "analytics",
          implementationStatus: "live",
          currentRoute: "/hr/reports",
          currentComponent: "HRReportsPage",
        },
        {
          id: "custom-analytics",
          label: "Custom Analytics",
          href: "/hr/analytics-reporting/custom-analytics",
          section: "analytics-reporting",
          iconHint: "chart-custom",
          purpose: "Build custom HR analytics queries and reports.",
          requiredAction: "hr.analytics.manage",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "analytics",
          implementationStatus: "not-started",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 12. Security & Access
    // -----------------------------------------------------------------------
    {
      id: "security-access",
      label: "Security & Access",
      iconHint: "security",
      purpose:
        "Control system access, protect sensitive HR data, and ensure platform level security and auditability.",
      href: "/hr/security-access",
      requiredAction: "hr.analytics.manage",
      scopeType: "sensitive",
      visibilityMode: "hide-if-no-access",
      backedBy: "not-yet-implemented",
      backendDomain: "analytics",
      implementationStatus: "planned",
      currentRoute: "/hr/settings",
      currentComponent: "HRSettingsPage",
      items: [
        {
          id: "role-based-access",
          label: "Role-Based Access",
          href: "/hr/security-access/roles",
          section: "security-access",
          iconHint: "users-cog",
          purpose: "Manage HR role assignments and permission mapping.",
          requiredAction: "hr.analytics.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "tab-in-existing-page",
          backendDomain: "analytics",
          implementationStatus: "placeholder",
          currentRoute: "/hr/settings",
          currentComponent: "HRSettingsPage",
        },
        {
          id: "access-controls",
          label: "Access Controls",
          href: "/hr/security-access/access-controls",
          section: "security-access",
          iconHint: "shield-lock",
          purpose: "Configure field-level and route-level access policies.",
          requiredAction: "hr.analytics.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "analytics",
          implementationStatus: "live",
          currentRoute: "/hr/security-access/access-controls",
          currentComponent: "HRAccessControlsPage",
        },
        {
          id: "data-privacy-settings",
          label: "Data Privacy",
          href: "/hr/security-access/data-privacy",
          section: "security-access",
          iconHint: "eye-off",
          purpose: "Manage data privacy settings and consent tracking.",
          requiredAction: "hr.analytics.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "compliance",
          implementationStatus: "not-started",
        },
        {
          id: "audit-logs",
          label: "Audit Logs",
          href: "/hr/security-access/audit-logs",
          section: "security-access",
          iconHint: "list-ordered",
          purpose: "View HR system audit trail and access logs.",
          requiredAction: "hr.analytics.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "analytics",
          implementationStatus: "live",
          currentRoute: "/hr/security-access/audit-logs",
          currentComponent: "HRAuditLogsPage",
        },
        {
          id: "security-policies",
          label: "Security Policies",
          href: "/hr/security-access/security-policies",
          section: "security-access",
          iconHint: "shield-check",
          purpose: "Define and enforce HR security policies.",
          requiredAction: "hr.analytics.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "compliance",
          implementationStatus: "not-started",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 13. Compliance
    // -----------------------------------------------------------------------
    {
      id: "compliance",
      label: "Compliance",
      iconHint: "rule",
      purpose:
        "Ensure adherence to legal, regulatory, and internal HR policies, including safety and risk management.",
      href: "/hr/compliance",
      requiredAction: "hr.compliance.read",
      scopeType: "all",
      visibilityMode: "hide-if-no-access",
      backedBy: "not-yet-implemented",
      backendDomain: "compliance",
      implementationStatus: "planned",
      items: [
        {
          id: "policy-management",
          label: "Policy Management",
          href: "/hr/compliance/policies",
          section: "compliance",
          iconHint: "file-text",
          purpose: "Manage compliance policies and version control.",
          requiredAction: "hr.compliance.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "compliance",
          implementationStatus: "not-started",
        },
        {
          id: "incident-reporting",
          label: "Incident Reporting",
          href: "/hr/compliance/incidents",
          section: "compliance",
          iconHint: "alert-circle",
          purpose: "Report and track workplace incidents.",
          requiredAction: "hr.incident.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "compliance",
          implementationStatus: "live",
          currentRoute: "/hr/incidents",
          currentComponent: "HRIncidentsPage",
        },
        {
          id: "compliance-management",
          label: "Compliance Management",
          href: "/hr/compliance/management",
          section: "compliance",
          iconHint: "clipboard-check",
          purpose: "Track and manage compliance obligations.",
          requiredAction: "hr.compliance.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "compliance",
          implementationStatus: "live",
          currentRoute: "/hr/compliance-mgmt",
          currentComponent: "HRComplianceMgmtPage",
        },
        {
          id: "audit-reporting",
          label: "Audit & Reporting",
          href: "/hr/compliance/audit-reporting",
          section: "compliance",
          iconHint: "bar-chart",
          purpose: "Generate audit reports for compliance verification.",
          requiredAction: "hr.compliance.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "compliance",
          implementationStatus: "not-started",
        },
        {
          id: "privacy-access-controls",
          label: "Data Privacy & Access Controls",
          href: "/hr/compliance/privacy-access",
          section: "compliance",
          iconHint: "lock",
          purpose: "Manage data privacy controls and access policies.",
          requiredAction: "hr.compliance.manage",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "compliance",
          implementationStatus: "not-started",
        },
        {
          id: "risk-management",
          label: "Risk Management",
          href: "/hr/compliance/risk-management",
          section: "compliance",
          iconHint: "alert-triangle",
          purpose: "Identify, assess, and mitigate HR-related risks.",
          requiredAction: "hr.risk.read",
          scopeType: "sensitive",
          visibilityMode: "hide-if-no-access",
          backedBy: "existing-page",
          backendDomain: "compliance",
          implementationStatus: "live",
          currentRoute: "/hr/compliance/risk-management",
          currentComponent: "HRRiskManagementPage",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Derived Helpers
// ---------------------------------------------------------------------------

/** Flatten all nav items (sections + leaves) into a single list */
export function getAllHrNavItems(): HrNavItem[] {
  return HR_NAV_CONFIG.sections.flatMap((s) => s.items);
}

/** Get all items filtered by backedBy status */
export function getItemsByBackedBy(status: BackedBy): HrNavItem[] {
  return getAllHrNavItems().filter((i) => i.backedBy === status);
}

/** Get all items filtered by implementation status */
export function getItemsByStatus(status: ImplementationStatus): HrNavItem[] {
  return getAllHrNavItems().filter((i) => i.implementationStatus === status);
}

/** Count items by backedBy category */
export function countByBackedBy(): Record<BackedBy, number> {
  const items = getAllHrNavItems();
  return {
    "existing-page": items.filter((i) => i.backedBy === "existing-page").length,
    "new-page": items.filter((i) => i.backedBy === "new-page").length,
    "tab-in-existing-page": items.filter((i) => i.backedBy === "tab-in-existing-page").length,
    "not-yet-implemented": items.filter((i) => i.backedBy === "not-yet-implemented").length,
  };
}

/** Lookup a nav item by its target href */
export function findNavItemByHref(href: string): HrNavItem | undefined {
  return getAllHrNavItems().find((i) => i.href === href);
}

/** Lookup a nav section by its id */
export function findSectionById(sectionId: string): HrNavSection | undefined {
  return HR_NAV_CONFIG.sections.find((s) => s.id === sectionId);
}

/** Get the section that contains a given item id */
export function getSectionForItem(itemId: string): HrNavSection | undefined {
  return HR_NAV_CONFIG.sections.find((s) => s.items.some((i) => i.id === itemId));
}

// ---------------------------------------------------------------------------
// Phase 3 — Masking & Scope Helpers
// ---------------------------------------------------------------------------

/** Get all items that require field masking */
export function getItemsRequiringMasking(): HrNavItem[] {
  return getAllHrNavItems().filter((i) => i.maskingRequired);
}

/** Get all items that trigger sensitive-read audit logging */
export function getItemsWithSensitiveAudit(): HrNavItem[] {
  return getAllHrNavItems().filter((i) => i.sensitiveReadAudit);
}

/** Get all items by masking field set */
export function getItemsByMaskingFieldSet(fieldSet: MaskingFieldSet): HrNavItem[] {
  return getAllHrNavItems().filter((i) => i.maskingFieldSet === fieldSet);
}

/** Get all items that declare scope resolution actions */
export function getItemsWithScopeActions(): HrNavItem[] {
  return getAllHrNavItems().filter((i) => i.scopeActions != null);
}

/** Get all items classified as sensitive scope */
export function getSensitiveItems(): HrNavItem[] {
  return getAllHrNavItems().filter((i) => i.scopeType === "sensitive");
}

/** Group items by scope type */
export function groupByScope(): Record<ScopeType, HrNavItem[]> {
  const all = getAllHrNavItems();
  return {
    self: all.filter((i) => i.scopeType === "self"),
    team: all.filter((i) => i.scopeType === "team"),
    all: all.filter((i) => i.scopeType === "all"),
    sensitive: all.filter((i) => i.scopeType === "sensitive"),
    mixed: all.filter((i) => i.scopeType === "mixed"),
  };
}

// ---------------------------------------------------------------------------
// Phase 9 — Maintainability Helpers
// ---------------------------------------------------------------------------

/**
 * Get all unique backendDomain values referenced in the nav config.
 * Useful for verifying domain coverage matches router registration.
 */
export function getReferencedBackendDomains(): string[] {
  const domains = new Set<string>();
  for (const section of HR_NAV_CONFIG.sections) {
    domains.add(section.backendDomain);
    for (const item of section.items) {
      domains.add(item.backendDomain);
    }
  }
  return Array.from(domains).sort();
}

/**
 * Get items grouped by implementation status.
 * Returns a breakdown suitable for operational dashboards.
 */
export function getImplementationBreakdown(): Record<ImplementationStatus, number> {
  const items = getAllHrNavItems();
  return {
    live: items.filter((i) => i.implementationStatus === "live").length,
    placeholder: items.filter((i) => i.implementationStatus === "placeholder").length,
    planned: items.filter((i) => i.implementationStatus === "planned").length,
    "not-started": items.filter((i) => i.implementationStatus === "not-started").length,
  };
}

/**
 * Validate that a backendDomain value exists in the HR_BACKEND_DOMAINS constant.
 * Returns mismatched domain strings for items that reference unlisted domains.
 */
export function findUnknownBackendDomains(): Array<{ itemId: string; domain: string }> {
  const validDomains = new Set(Object.values(HR_BACKEND_DOMAINS));
  const mismatches: Array<{ itemId: string; domain: string }> = [];
  for (const section of HR_NAV_CONFIG.sections) {
    if (!validDomains.has(section.backendDomain as HrBackendDomain)) {
      mismatches.push({ itemId: section.id, domain: section.backendDomain });
    }
    for (const item of section.items) {
      if (!validDomains.has(item.backendDomain as HrBackendDomain)) {
        mismatches.push({ itemId: item.id, domain: item.backendDomain });
      }
    }
  }
  return mismatches;
}
