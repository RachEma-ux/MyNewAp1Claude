/**
 * HR Root Router — Global HR namespace
 *
 * Composes all HR sub-routers into the root `hr.*` tRPC namespace.
 * Phase 1: Directory, Organization, Staffing
 * Phase 2: Recruiting, Lifecycle (Onboarding/Offboarding)
 * Phase 3: Time & Attendance, Learning, Performance
 * Phase 4: Compensation, Relations, Engagement, Compliance, Analytics, Talent
 */

import { router, protectedProcedure } from "../_core/trpc";
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

const hrSettingsRouter = router({
  get: protectedProcedure.query(() => ({
    module: "hr",
    version: "4.0.0",
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
    },
  })),
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
});
