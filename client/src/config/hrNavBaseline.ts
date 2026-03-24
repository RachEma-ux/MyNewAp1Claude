/**
 * HR Nav Config Baseline — Frozen Snapshot for Drift Detection
 *
 * Phase 9 deliverable — captures the known-good state of the nav config
 * after Phase 8 acceptance. Any change to the nav config shape (section count,
 * item count, live/deferred ratio, masking/audit counts) will be detected
 * by comparing against this baseline in tests.
 *
 * When the nav config is intentionally changed (new items implemented,
 * sections added, etc.), update this baseline to match the new state.
 *
 * Last updated: Phase 9 (2026-03-24)
 */

import type { NavConfigDigest } from "./hrNavConfigValidator";

/**
 * The frozen baseline snapshot captured at Phase 8 acceptance.
 * Tests compare the live config digest against this to detect unintentional drift.
 */
export const HR_NAV_BASELINE: NavConfigDigest = {
  totalSections: 13,
  totalItems: 68,
  liveCount: 32,
  placeholderCount: 1,
  notStartedCount: 35,
  sectionIds: [
    "workforce-planning",
    "talent-acquisition",
    "onboarding-offboarding",
    "employee-records",
    "compensation-benefits",
    "time-attendance",
    "learning-development",
    "performance-talent",
    "employee-relations",
    "wellbeing-engagement",
    "analytics-reporting",
    "security-access",
    "compliance",
  ],
  aliasCount: 28,
  maskingCount: 14,
  auditCount: 10,
};

/**
 * Per-section expected item counts.
 * Used for fine-grained drift detection at section level.
 */
export const HR_SECTION_BASELINES: Record<string, { total: number; live: number }> = {
  "workforce-planning": { total: 5, live: 3 },
  "talent-acquisition": { total: 6, live: 1 },
  "onboarding-offboarding": { total: 8, live: 2 },
  "employee-records": { total: 5, live: 3 },
  "compensation-benefits": { total: 6, live: 2 },
  "time-attendance": { total: 4, live: 4 },
  "learning-development": { total: 5, live: 3 },
  "performance-talent": { total: 5, live: 3 },
  "employee-relations": { total: 4, live: 2 },
  "wellbeing-engagement": { total: 4, live: 2 },
  "analytics-reporting": { total: 5, live: 2 },
  "security-access": { total: 5, live: 2 },
  "compliance": { total: 6, live: 3 },
};
