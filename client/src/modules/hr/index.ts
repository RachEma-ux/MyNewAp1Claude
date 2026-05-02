/**
 * HR — Public contract.
 *
 * Other modules import from `@/modules/hr` only.
 */

export type {
  HRSubdomain,
  HRSectionId,
  HRRoleDefinitionStatus,
} from "./types";

export const HRRoutes = {
  root: () => "/hr",
  // Section landings
  workforcePlanning: () => "/hr/workforce-planning",
  talentAcquisition: () => "/hr/talent-acquisition",
  lifecycle: () => "/hr/lifecycle",
  employeeRecords: () => "/hr/employee-records",
  compensationBenefits: () => "/hr/compensation-benefits",
  timeAttendance: () => "/hr/time-attendance",
  learningDevelopment: () => "/hr/learning-development",
  performanceTalent: () => "/hr/performance-talent",
  employeeRelations: () => "/hr/employee-relations",
  wellbeingEngagement: () => "/hr/wellbeing-engagement",
  analyticsReporting: () => "/hr/analytics-reporting",
  securityAccess: () => "/hr/security-access",
  compliance: () => "/hr/compliance",
  // Self-service
  directory: () => "/hr/directory",
  timesheet: () => "/hr/timesheet",
  leave: () => "/hr/leave",
  goals: () => "/hr/goals",
  reviews: () => "/hr/reviews",
  training: () => "/hr/training",
  certifications: () => "/hr/certifications",
  benefits: () => "/hr/benefits",
  policies: () => "/hr/policies",
  surveys: () => "/hr/surveys",
  engagement: () => "/hr/engagement",
  skills: () => "/hr/skills",
  // Admin
  organization: () => "/hr/organization",
  positions: () => "/hr/positions",
  staffing: () => "/hr/staffing",
  recruitment: () => "/hr/recruitment",
  onboarding: () => "/hr/onboarding",
  offboarding: () => "/hr/offboarding",
  overtime: () => "/hr/overtime",
  shifts: () => "/hr/shifts",
  compensation: () => "/hr/compensation",
  grievances: () => "/hr/grievances",
  incidents: () => "/hr/incidents",
  complianceMgmt: () => "/hr/compliance-mgmt",
  analytics: () => "/hr/analytics",
  talent: () => "/hr/talent",
  reports: () => "/hr/reports",
  settings: () => "/hr/settings",
  // Phase-4 leaves
  jobArchitecture: () => "/hr/workforce-planning/job-architecture",
  workPermits: () => "/hr/employee-records/work-permits",
  lettersCertificates: () => "/hr/employee-records/letters-certificates",
  riskManagement: () => "/hr/compliance/risk-management",
  auditLogs: () => "/hr/security-access/audit-logs",
  accessControls: () => "/hr/security-access/access-controls",
  // Role definitions
  roleDefinitions: () => "/hr/role-definitions",
  roleDefinitionNew: () => "/hr/role-definitions/new",
  roleDefinitionReview: () => "/hr/role-definitions/review",
  roleDefinition: (id: string | number) => `/hr/role-definitions/${id}`,
  roleDefinitionEdit: (id: string | number) => `/hr/role-definitions/${id}/edit`,
  roleDefinitionCompare: (id: string | number) => `/hr/role-definitions/${id}/compare`,
} as const;
