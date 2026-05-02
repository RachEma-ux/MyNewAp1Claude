/**
 * HR — Frontend Module Manifest (capsule shape).
 *
 * HR is the eighth Module Client Capsule. The manifest:
 *   - declares the canonical subtree (`/hr`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory` so AWI and
 *     `check:module-route-inventory` know the full surface
 *
 * HR's surface is the largest of any RTLM so far:
 *   - 1 home page (ungated)
 *   - 13 section landing pages (parameterized by sectionId)
 *   - 12 employee self-service pages (gated by self-level perms)
 *   - 16 admin/role-gated pages (organization, staffing, lifecycle,
 *     workforce ops, compensation/relations, analytics, talent,
 *     reports, settings)
 *   - 6 Phase-4 expansion leaf pages (job arch, work permits,
 *     letters, risk, audit logs, access controls)
 *   - 6 role-definitions pages (incl. dynamic :id deep links)
 *
 * The capsule's `mod.tsx` keeps the gating logic in-tree via the
 * capsule-internal `HrGate` component (extracted from App.tsx).
 *
 * App.tsx no longer mounts HR canonical pages. The capsule renders
 * via `<ModuleRoutes />` once `client.ts` registers this manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const HRCapsule = lazy(() => import("./mod"));

export const hrClientManifest: ClientModuleManifest = {
  key: "hr",
  name: "HR — Human Resources",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/hr",
  capsuleEntrypoint: HRCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/hr",
    // Section landing pages
    "/hr/workforce-planning",
    "/hr/talent-acquisition",
    "/hr/lifecycle",
    "/hr/employee-records",
    "/hr/compensation-benefits",
    "/hr/time-attendance",
    "/hr/learning-development",
    "/hr/performance-talent",
    "/hr/employee-relations",
    "/hr/wellbeing-engagement",
    "/hr/analytics-reporting",
    "/hr/security-access",
    "/hr/compliance",
    // Employee self-service
    "/hr/directory",
    "/hr/timesheet",
    "/hr/leave",
    "/hr/goals",
    "/hr/reviews",
    "/hr/training",
    "/hr/certifications",
    "/hr/benefits",
    "/hr/policies",
    "/hr/surveys",
    "/hr/engagement",
    "/hr/skills",
    // Admin / role-gated
    "/hr/organization",
    "/hr/positions",
    "/hr/staffing",
    "/hr/recruitment",
    "/hr/onboarding",
    "/hr/offboarding",
    "/hr/overtime",
    "/hr/shifts",
    "/hr/compensation",
    "/hr/grievances",
    "/hr/incidents",
    "/hr/compliance-mgmt",
    "/hr/analytics",
    "/hr/talent",
    "/hr/reports",
    "/hr/settings",
    // Phase-4 expansion (Carbon SideNav leaves)
    "/hr/workforce-planning/job-architecture",
    "/hr/employee-records/work-permits",
    "/hr/employee-records/letters-certificates",
    "/hr/compliance/risk-management",
    "/hr/security-access/audit-logs",
    "/hr/security-access/access-controls",
    // Role definitions (incl. dynamic :id)
    "/hr/role-definitions",
    "/hr/role-definitions/new",
    "/hr/role-definitions/review",
    "/hr/role-definitions/:id",
    "/hr/role-definitions/:id/edit",
    "/hr/role-definitions/:id/compare",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  routes: [],

  navigation: [
    { group: "people", label: "HR", order: 10 },
  ],
  requiredPermissions: ["hr.read"],
};
