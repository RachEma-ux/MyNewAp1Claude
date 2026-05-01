/**
 * KGIA Governance — Query Safety & Audit Bundle
 *
 * Provides the audit-bundle logging and policy-decision persistence
 * for every KGIA operation. Non-bypassable: all runtime nodes call
 * through this module.
 */

import { getDb } from "../../../db/connection";
import { kgiaPolicyDecisions } from "../schema";
import type { SafetyVerdict, GraphSource } from "../domain/types";
import { evaluateQuerySafety, DEFAULT_POLICY, type KgiaPolicyConfig } from "./policies";

// ── Policy Decision Persistence ──────────────────────────────────

export interface PolicyDecisionInput {
  workspaceId: number;
  runId?: number;
  sessionId?: number;
  action: string;
  decision: "allow" | "deny" | "review_required";
  reason?: string;
  policyRule?: string;
  actorId?: number;
  context?: Record<string, unknown>;
}

export async function persistPolicyDecision(
  input: PolicyDecisionInput
): Promise<number | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .insert(kgiaPolicyDecisions)
    .values({
      workspaceId: input.workspaceId,
      runId: input.runId ?? null,
      sessionId: input.sessionId ?? null,
      action: input.action,
      decision: input.decision,
      reason: input.reason ?? null,
      policyRule: input.policyRule ?? null,
      actorId: input.actorId ?? null,
      context: input.context ?? null,
    })
    .returning({ id: kgiaPolicyDecisions.id });

  return row?.id ?? null;
}

// ── Full Query Safety Gate ───────────────────────────────────────
// This is the non-bypassable entry point for all query execution.
// Returns a SafetyVerdict and persists the decision.

export async function gateQueryExecution(params: {
  workspaceId: number;
  runId: number;
  sessionId: number;
  queryText: string;
  source: GraphSource;
  actorId?: number;
  policy?: KgiaPolicyConfig;
}): Promise<SafetyVerdict> {
  const policy = params.policy ?? DEFAULT_POLICY;
  const verdict = evaluateQuerySafety(params.queryText, params.source, policy);

  const decision: "allow" | "deny" | "review_required" = verdict.safe
    ? "allow"
    : verdict.reviewRequired
      ? "review_required"
      : "deny";

  await persistPolicyDecision({
    workspaceId: params.workspaceId,
    runId: params.runId,
    sessionId: params.sessionId,
    action: "query.execute",
    decision,
    reason: verdict.violations.join("; ") || "All checks passed",
    policyRule: verdict.violations.length > 0 ? "query_safety" : "default_allow",
    actorId: params.actorId,
    context: {
      queryText: params.queryText.slice(0, 500),
      sourceId: params.source.id,
      sourceName: params.source.name,
      readOnly: verdict.readOnly,
      blockedPatterns: verdict.blockedPatterns,
    },
  });

  return verdict;
}

// ── Source Registration Gate ──────────────────────────────────────

export async function gateSourceRegistration(params: {
  workspaceId: number;
  sourceName: string;
  sourceType: string;
  endpoint: string;
  actorId?: number;
}): Promise<{ allowed: boolean; reason?: string }> {
  // Validate endpoint is not an internal/private address
  const blockedPrefixes = ["127.0.0.1", "localhost", "10.", "172.16.", "192.168.", "0.0.0.0", "::1"];
  const endpointLower = params.endpoint.toLowerCase();

  for (const prefix of blockedPrefixes) {
    if (endpointLower.includes(prefix)) {
      await persistPolicyDecision({
        workspaceId: params.workspaceId,
        action: "source.register",
        decision: "deny",
        reason: `Endpoint contains blocked private address prefix: ${prefix}`,
        policyRule: "ssrf_prevention",
        actorId: params.actorId,
        context: { endpoint: params.endpoint, sourceType: params.sourceType },
      });

      return {
        allowed: false,
        reason: `Internal/private endpoints are not allowed for security reasons`,
      };
    }
  }

  await persistPolicyDecision({
    workspaceId: params.workspaceId,
    action: "source.register",
    decision: "allow",
    reason: "Source registration passed security checks",
    policyRule: "source_registration",
    actorId: params.actorId,
    context: { endpoint: params.endpoint, sourceType: params.sourceType },
  });

  return { allowed: true };
}

// ── Audit Bundle ─────────────────────────────────────────────────

export interface AuditBundle {
  workspaceId: number;
  sessionId: number;
  runId: number;
  question: string;
  selectedMode: string;
  queryText?: string;
  sourceId?: number;
  verdict: SafetyVerdict;
  resultCount: number;
  durationMs: number;
  actorId?: number;
}

export async function logAuditBundle(bundle: AuditBundle): Promise<void> {
  await persistPolicyDecision({
    workspaceId: bundle.workspaceId,
    runId: bundle.runId,
    sessionId: bundle.sessionId,
    action: "run.complete",
    decision: bundle.verdict.safe ? "allow" : "deny",
    reason: `Mode: ${bundle.selectedMode}, Results: ${bundle.resultCount}, Duration: ${bundle.durationMs}ms`,
    policyRule: "audit_trail",
    actorId: bundle.actorId,
    context: {
      question: bundle.question.slice(0, 500),
      selectedMode: bundle.selectedMode,
      queryText: bundle.queryText?.slice(0, 500),
      sourceId: bundle.sourceId,
      resultCount: bundle.resultCount,
      durationMs: bundle.durationMs,
      violations: bundle.verdict.violations,
    },
  });
}
