/**
 * Catalog Lifecycle — Single Source of Truth
 *
 * Defines the unified lifecycle contract consumed by both server and client.
 * All lifecycle state, origins, and actions are defined here.
 */

// Lifecycle states (stable, persisted in DB)
export const LIFECYCLE_STATES = ["draft", "active", "deprecated", "disabled"] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

// Execution states (transient, job-run)
export const EXECUTION_STATES = ["validating", "publishing"] as const;
export type ExecutionState = (typeof EXECUTION_STATES)[number];

// Entry origins — how the entry was created
export const ENTRY_ORIGINS = ["admin", "discovery", "api", "connect", "import"] as const;
export type EntryOrigin = (typeof ENTRY_ORIGINS)[number];

// Lifecycle actions — the gated operations on the spine
export const LIFECYCLE_ACTIONS = [
  { key: "register", label: "Register", gate: "register", requiredStatus: "draft", targetStatus: null },
  { key: "activate", label: "Activate", gate: "validate", requiredStatus: "draft", targetStatus: "active" },
  { key: "validate", label: "Validate", gate: null, requiredStatus: "active", targetStatus: null, isJob: true },
  { key: "approve_validation", label: "Approve Validation", gate: "validate", requiredStatus: "active", targetStatus: null },
  { key: "publish", label: "Publish", gate: "publish", requiredStatus: "active", targetStatus: null },
] as const;

export type LifecycleActionKey = (typeof LIFECYCLE_ACTIONS)[number]["key"];

// Stage review stages that map to stageReviews JSON keys
export const REVIEW_STAGES = ["register", "validate", "publish"] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];

/** Shape of entry data needed for lifecycle calculations */
export interface LifecycleEntry {
  status: string;
  reviewState: string;
  stageReviews?: Record<string, string> | null;
  validationStatus?: string | null;
  tags?: string[] | null;
}

/**
 * Get available lifecycle actions for an entry given its current state.
 */
export function getAvailableActions(entry: LifecycleEntry): LifecycleActionKey[] {
  const actions: LifecycleActionKey[] = [];
  const sr = entry.stageReviews || {};

  // Register: draft + needs_review + register not yet approved
  if (entry.status === "draft" && entry.reviewState === "needs_review" && sr.register !== "approved") {
    actions.push("register");
  }

  // Activate: draft + approved (register approved) → transitions to active
  if (entry.status === "draft" && entry.reviewState === "approved") {
    actions.push("activate");
  }

  // Validate: active + not currently validating
  if (entry.status === "active") {
    actions.push("validate");
  }

  // Approve Validation: active + validation passed + validate stage needs review
  if (entry.status === "active" && entry.validationStatus === "passed" && sr.validate !== "approved") {
    actions.push("approve_validation");
  }

  // Publish: active + validate stage approved
  if (entry.status === "active" && sr.validate === "approved") {
    actions.push("publish");
  }

  return actions;
}

/** Lifecycle step definition for the visual timeline */
export interface LifecycleStep {
  key: string;
  label: string;
  status: "done" | "current" | "pending" | "failed" | "in_progress";
  detail?: string;
}

/**
 * Build the lifecycle timeline steps for display.
 */
export function getLifecycleSteps(entry: LifecycleEntry): LifecycleStep[] {
  const sr = entry.stageReviews || {};
  const steps: LifecycleStep[] = [];

  // Step 1: Created (always done)
  steps.push({
    key: "created",
    label: "Created",
    status: "done",
    detail: `Status: ${entry.status}`,
  });

  // Step 2: Register stage review
  const regStatus = sr.register;
  steps.push({
    key: "register",
    label: "Register Review",
    status: regStatus === "approved" ? "done" : regStatus === "rejected" ? "failed" : "pending",
    detail: regStatus || "needs_review",
  });

  // Step 3: Activated
  // Current status is the single source of truth — tags do not override status.
  const isActive = entry.status === "active";
  steps.push({
    key: "activate",
    label: "Activated",
    status: isActive ? "done" : regStatus === "approved" ? "current" : "pending",
    detail: isActive ? "active" : entry.status,
  });

  // Step 4: Validation (4-step handshake)
  const valStatus = entry.validationStatus;
  steps.push({
    key: "validate",
    label: "Validate (4-step)",
    status: valStatus === "passed"
      ? "done"
      : valStatus === "failed"
      ? "failed"
      : valStatus === "running"
      ? "in_progress"
      : isActive
      ? "current"
      : "pending",
    detail: valStatus || "not_run",
  });

  // Step 5: Validate stage review
  const valReviewStatus = sr.validate;
  steps.push({
    key: "approve_validation",
    label: "Validate Review",
    status: valReviewStatus === "approved"
      ? "done"
      : valReviewStatus === "rejected"
      ? "failed"
      : valStatus === "passed"
      ? "current"
      : "pending",
    detail: valReviewStatus || "needs_review",
  });

  // Step 6: Publish
  const pubStatus = sr.publish;
  const hasPublishedTag = (entry.tags || []).includes("published");
  steps.push({
    key: "publish",
    label: "Publish",
    status: hasPublishedTag || pubStatus === "approved"
      ? "done"
      : valReviewStatus === "approved"
      ? "current"
      : "pending",
    detail: pubStatus || (hasPublishedTag ? "published" : "locked"),
  });

  return steps;
}

/**
 * Get lifecycle progress as 0-100% for a progress bar.
 */
export function getLifecycleProgress(entry: LifecycleEntry): number {
  const steps = getLifecycleSteps(entry);
  const doneCount = steps.filter((s) => s.status === "done").length;
  return Math.round((doneCount / steps.length) * 100);
}

/**
 * Get stage review summary for display.
 */
export function getStageReviewSummary(stageReviews?: Record<string, string> | null): Record<ReviewStage, { status: string; icon: string }> {
  const sr = stageReviews || {};
  const map = (stage: ReviewStage) => {
    const val = sr[stage] || "needs_review";
    const icon = val === "approved" ? "check" : val === "rejected" ? "x" : "pending";
    return { status: val, icon };
  };
  return {
    register: map("register"),
    validate: map("validate"),
    publish: map("publish"),
  };
}

/**
 * Check if a catalog entry is eligible for execution.
 * Both the "published" tag AND active status are required for service-backed entries.
 * Returns { eligible, reasons } so callers can display specific blockers.
 */
export function isExecutionEligible(entry: LifecycleEntry): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const tags = entry.tags || [];

  if (entry.status !== "active") {
    reasons.push(`Status is "${entry.status}" — must be "active"`);
  }
  if (!tags.includes("published")) {
    reasons.push("Missing \"published\" tag — entry has not completed the publish stage");
  }
  const sr = entry.stageReviews || {};
  if (sr.validate !== "approved") {
    reasons.push("Validation review not approved");
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Execution status tiers for secondary badge/chip rendering.
 *
 * Lifecycle truth model:
 *   - Primary badge = entry.status (draft / active / deprecated / disabled)
 *   - Secondary chips = approval states + metadata tags
 *   - "Runnable" = derived: active + published tag + validation approved
 *
 * This function returns secondary approval chip info, NOT the primary badge.
 * The primary badge is always entry.status rendered directly.
 */
export type ExecutionStatusTier =
  | "published"
  | "published_not_active"
  | "published_not_runnable"
  | "not_published";

export interface ExecutionStatus {
  tier: ExecutionStatusTier;
  label: string;
  runnable: boolean;
  reasons: string[];
}

export function getExecutionStatus(entry: LifecycleEntry): ExecutionStatus {
  const tags = entry.tags || [];
  const hasPublishedTag = tags.includes("published");

  if (!hasPublishedTag) {
    return { tier: "not_published", label: "", runnable: false, reasons: ["Not yet published"] };
  }

  const elig = isExecutionEligible(entry);

  if (elig.eligible) {
    return { tier: "published", label: "Published", runnable: true, reasons: [] };
  }

  if (entry.status !== "active") {
    return {
      tier: "published_not_active",
      label: "Publish Approved (Not Active)",
      runnable: false,
      reasons: elig.reasons,
    };
  }

  return {
    tier: "published_not_runnable",
    label: "Published (Not Runnable)",
    runnable: false,
    reasons: elig.reasons,
  };
}
