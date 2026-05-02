/**
 * HR — Public types.
 */

export type HRSubdomain =
  | "directory"
  | "organization"
  | "positions"
  | "staffing"
  | "skills"
  | "reports"
  | "settings"
  | "recruitment"
  | "onboarding"
  | "offboarding"
  | "timesheet"
  | "leave"
  | "overtime"
  | "shifts"
  | "training"
  | "certifications"
  | "goals"
  | "reviews"
  | "compensation"
  | "benefits"
  | "policies"
  | "grievances"
  | "surveys"
  | "engagement"
  | "incidents"
  | "compliance-mgmt"
  | "analytics"
  | "talent"
  | "role-definitions";

export type HRSectionId =
  | "workforce-planning"
  | "talent-acquisition"
  | "onboarding-offboarding"
  | "employee-records"
  | "compensation-benefits"
  | "time-attendance"
  | "learning-development"
  | "performance-talent"
  | "employee-relations"
  | "wellbeing-engagement"
  | "analytics-reporting"
  | "security-access"
  | "compliance";

export type HRRoleDefinitionStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "archived";
