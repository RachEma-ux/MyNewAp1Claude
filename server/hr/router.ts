/**
 * HR Root Router — Global HR namespace
 *
 * Composes directory, organization, staffing, recruiting, and lifecycle
 * sub-routers into the root `hr.*` tRPC namespace.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { hrDirectoryRouter } from "./directory/router";
import { hrOrganizationRouter } from "./organization/router";
import { hrStaffingRouter } from "./staffing/router";
import { hrRecruitingRouter } from "./recruiting/router";
import { hrLifecycleRouter } from "./lifecycle/router";

// Placeholder sub-routers for future phases
const hrSettingsRouter = router({
  get: protectedProcedure.query(() => ({
    module: "hr",
    version: "2.0.0",
    features: {
      directory: true,
      organization: true,
      staffing: true,
      recruiting: true,
      lifecycle: true,
      time: false,
      learning: false,
      performance: false,
      compensation: false,
      relations: false,
      analytics: false,
      security: false,
      compliance: false,
    },
  })),
});

const hrReportsRouter = router({
  summary: protectedProcedure.query(() => ({
    message: "HR Reports — coming in Phase 3",
    availableReports: [],
  })),
});

export const hrRouter = router({
  directory: hrDirectoryRouter,
  organization: hrOrganizationRouter,
  staffing: hrStaffingRouter,
  recruiting: hrRecruitingRouter,
  lifecycle: hrLifecycleRouter,
  settings: hrSettingsRouter,
  reports: hrReportsRouter,
});
