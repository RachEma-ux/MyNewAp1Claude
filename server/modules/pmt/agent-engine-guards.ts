/**
 * Agent Engine Guards — Safety invariants for PM Central agents
 *
 * Agents are ASSISTIVE ONLY. These guards enforce that agents cannot:
 *   - Submit, approve, reject, or waive gates
 *   - Transition lifecycle states
 *   - Lock or unlock baselines
 *   - Freeze or unfreeze projects
 *   - Write canonical artifacts
 *
 * All outputs require human commit.
 */

import {
  DENIED_ACTIONS,
  ORCHESTRATOR_INVARIANTS,
  type CatalogBinding,
  type DeniedAction,
} from "@shared/pm-agent-engine";

// ── Action Guard ────────────────────────────────────────────────────────────

/**
 * Assert that a requested action is allowed for PM Central agents.
 * Throws if the action is in the DENIED_ACTIONS list.
 */
export function assertActionAllowed(action: string, agentAlias: string): void {
  if ((DENIED_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(
      `Guard denied: agent "${agentAlias}" attempted forbidden action "${action}". ` +
      `PM Central agents cannot perform gate, state, baseline, or freeze actions.`
    );
  }
}

// ── Phase Guard ─────────────────────────────────────────────────────────────

/**
 * Assert that the agent binding is allowed to operate in the given project phase.
 * Throws if the binding's phases_allowed does not include the current phase.
 */
export function assertPhaseAllowed(binding: CatalogBinding, projectPhase: string): void {
  if (binding.phases_allowed.length > 0 && !binding.phases_allowed.includes(projectPhase)) {
    throw new Error(
      `Guard denied: agent "${binding.alias}" is not allowed in phase "${projectPhase}". ` +
      `Allowed phases: ${binding.phases_allowed.join(", ")}.`
    );
  }
}

// ── Human Review Check ──────────────────────────────────────────────────────

/**
 * Returns whether human review is required for the binding's outputs.
 * In Phase 1, this always returns true per orchestrator invariants.
 */
export function assertHumanReviewRequired(binding: CatalogBinding): boolean {
  // Orchestrator invariant overrides any binding-level setting
  if (ORCHESTRATOR_INVARIANTS.require_human_commit_for_all_drafts) {
    return true;
  }
  return binding.enforcement_overlay.require_human_review;
}

// ── Binding Enforcement ─────────────────────────────────────────────────────

/**
 * Validate that a requested action passes both the binding's enforcement overlay
 * and the orchestrator invariants.
 * Throws if the action is denied.
 */
export function validateBindingEnforcement(
  binding: CatalogBinding,
  requestedAction: string
): void {
  // Check orchestrator-level invariants first
  if (ORCHESTRATOR_INVARIANTS.deny_gate_actions) {
    const gateActions = ["gate_submit", "gate_approve", "gate_reject", "gate_waive"];
    if (gateActions.includes(requestedAction)) {
      throw new Error(
        `Orchestrator invariant denied: gate action "${requestedAction}" is forbidden for all agents.`
      );
    }
  }

  if (ORCHESTRATOR_INVARIANTS.deny_state_transitions && requestedAction === "state_transition") {
    throw new Error(
      `Orchestrator invariant denied: state transitions are forbidden for all agents.`
    );
  }

  if (ORCHESTRATOR_INVARIANTS.deny_baseline_lock) {
    if (requestedAction === "baseline_lock" || requestedAction === "baseline_unlock") {
      throw new Error(
        `Orchestrator invariant denied: baseline lock/unlock is forbidden for all agents.`
      );
    }
  }

  // Check binding-level enforcement overlay
  if (binding.enforcement_overlay.deny.includes(requestedAction)) {
    throw new Error(
      `Binding enforcement denied: agent "${binding.alias}" is not allowed to perform "${requestedAction}".`
    );
  }
}

// ── Validate Binding Shape ──────────────────────────────────────────────────

/**
 * Phase 1: validates that a binding has the correct shape.
 * Phase 2 will add digest verification against publish bundles.
 */
export function validateBindingShape(binding: CatalogBinding): string[] {
  const errors: string[] = [];

  if (!binding.alias) errors.push("Missing alias");
  if (!binding.catalog_id) errors.push("Missing catalog_id");
  if (!binding.pinned_digest) errors.push("Missing pinned_digest");
  if (!binding.enforcement_overlay) errors.push("Missing enforcement_overlay");
  if (!binding.enforcement_overlay?.deny || !Array.isArray(binding.enforcement_overlay.deny)) {
    errors.push("enforcement_overlay.deny must be an array");
  }

  // Ensure all critical deny actions are present
  const missingDenied = DENIED_ACTIONS.filter(
    (a) => !binding.enforcement_overlay.deny.includes(a)
  );
  if (missingDenied.length > 0) {
    errors.push(`Missing required deny actions: ${missingDenied.join(", ")}`);
  }

  return errors;
}
