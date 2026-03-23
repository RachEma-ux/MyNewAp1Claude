/**
 * HR Root Router — Global HR namespace
 *
 * Composes all HR sub-routers into the root `hr.*` tRPC namespace.
 * Phase 1: Directory, Organization, Staffing
 * Phase 2: Recruiting, Lifecycle (Onboarding/Offboarding)
 * Phase 3: Time & Attendance, Learning, Performance
 * Phase 4: Compensation, Relations, Engagement, Compliance, Analytics, Talent
 * Phase 5: Stabilization — Cross-phase integration, hardened analytics, reminders
 * Phase 6: Hardening — Permission enforcement, role-aware masking, audit coverage, bug fixes
 * Phase 7: Data Expansion — 28-employee realistic seed dataset across 9 org units
 */

import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getHrRoleForUser, HR_ROLE_PERMISSIONS, HR_ACTIONS } from "./permissions";
import { hrDirectoryRouter } from "./directory/router";
import { hrOrganizationRouter } from "./organization/router";
import { hrStaffingRouter } from "./staffing/router";
import { hrRecruitingRouter } from "./recruiting/router";
import { hrLifecycleRouter } from "./lifecycle/router";
import { hrTimeRouter } from "./time/router";
import { hrLearningRouter } from "./learning/router";
import { hrPerformanceRouter } from "./performance/router";
import { hrCompensationRouter } from "./compensation/router";
import { hrRelationsRouter } from "./relations/router";
import { hrEngagementRouter } from "./engagement/router";
import { hrComplianceRouter } from "./compliance/router";
import { hrAnalyticsRouter } from "./analytics/router";
import { hrTalentRouter } from "./talent/router";
import { seedHrDemoData } from "./seed";

/** Returns current user's HR role and allowed actions — used by frontend for navigation gating */
const hrMeRouter = router({
  getRole: protectedProcedure.query(async ({ ctx }) => {
    const role = await getHrRoleForUser(ctx.user);
    const allowedActions = HR_ROLE_PERMISSIONS[role] ?? [];
    return { role, allowedActions };
  }),
});

const hrSettingsRouter = router({
  get: protectedProcedure.query(() => ({
    module: "hr",
    version: "7.2.0",
    features: {
      directory: true,
      organization: true,
      staffing: true,
      recruiting: true,
      lifecycle: true,
      time: true,
      learning: true,
      performance: true,
      compensation: true,
      relations: true,
      engagement: true,
      compliance: true,
      analytics: true,
      talent: true,
      // Phase 5 additions
      reminders: true,
      workforceBreakdown: true,
      rolePermissionMatrix: true,
      sensitiveAuditLogging: true,
      // Phase 6 hardening
      roleAwareMasking: true,
      apiPermissionEnforcement: true,
      // Phase 7 data expansion
      expandedSeedDataset: true,
      // Phase 7.1 governance hardening
      fullPermissionEnforcement: true,
      frontendRoleGating: true,
      workspaceHrHardening: true,
      // Phase 7.2 SoD & audit
      selfApprovalPrevention: true,
      unifiedAuditQuery: true,
    },
  })),
  seedDemo: governedProcedure
    .input(z.object({ confirm: z.boolean().default(false) }).optional())
    .mutation(async ({ input }) => {
      if (!input?.confirm) {
        return { seeded: false, message: "Confirmation required — pass { confirm: true } to seed demo data" };
      }
      return seedHrDemoData();
    }),
});

export const hrRouter = router({
  // Phase 1
  directory: hrDirectoryRouter,
  organization: hrOrganizationRouter,
  staffing: hrStaffingRouter,
  // Phase 2
  recruiting: hrRecruitingRouter,
  lifecycle: hrLifecycleRouter,
  // Phase 3
  time: hrTimeRouter,
  learning: hrLearningRouter,
  performance: hrPerformanceRouter,
  // Phase 4
  compensation: hrCompensationRouter,
  relations: hrRelationsRouter,
  engagement: hrEngagementRouter,
  compliance: hrComplianceRouter,
  analytics: hrAnalyticsRouter,
  talent: hrTalentRouter,
  // Config
  settings: hrSettingsRouter,
  me: hrMeRouter,
});
