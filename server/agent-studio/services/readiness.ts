/**
 * AI Agent Studio — Readiness Service
 *
 * Computes completeness, warnings, blockers, readiness score, and publish
 * readiness across all sections of an agent draft.
 *
 * Cross-section blockers surface globally (e.g., risky tool flagged in Tools
 * triggers a Governance warning AND a readiness penalty).
 *
 * Owner: Agent Studio (Plan v3 Phase 28 — assigned `agent-studio` so the
 * Stage 8 export catalog has a single point of truth for "is this agent
 * ready to export?"). The `computeAgentReadinessSnapshot` export below
 * is the canonical reader for downstream Phases 29–32; the export catalog
 * row carries `readinessScore` + `readinessComputedBy` + `readinessComputedAt`
 * directly from the snapshot's return shape.
 */

import * as repo from "../repository";
import { AGS_REQUIRED_PUBLISH_FIELDS } from "../shared/constants";

export interface ReadinessReport {
  score: number; // 0-100
  completeness: number; // 0-100
  totalChecks: number;
  passedChecks: number;
  warnings: ReadinessIssue[];
  blockers: ReadinessIssue[];
  publishReady: boolean;
  sections: Record<string, ReadinessSection>;
}

export interface ReadinessIssue {
  section: string;
  field?: string;
  severity: "warning" | "blocker";
  message: string;
}

export interface ReadinessSection {
  name: string;
  complete: number; // 0-100
  warnings: number;
  blockers: number;
}

/**
 * Compute readiness for an agent. Pulls the current draft, tools, knowledge,
 * memory, workflow nodes, and aggregates issues across all sections.
 */
export async function computeReadiness(agentId: number): Promise<ReadinessReport> {
  const agent = await repo.getAgentById(agentId);
  if (!agent) {
    return emptyReport(`Agent ${agentId} not found`);
  }
  const draft = await repo.getCurrentDraft(agentId);
  if (!draft) {
    return emptyReport(`No draft for agent ${agentId}`);
  }

  const warnings: ReadinessIssue[] = [];
  const blockers: ReadinessIssue[] = [];
  const sections: Record<string, ReadinessSection> = {};

  // ── Identity ──
  let identityFilled = 0;
  const identityFields = ["name", "agentClass", "ownerId"] as const;
  for (const f of identityFields) {
    if ((draft as any)[f] || (agent as any)[f]) identityFilled++;
  }
  if (!agent.name) blockers.push(blocker("identity", "name", "Agent name is required"));
  if (!agent.internalKey) blockers.push(blocker("identity", "internalKey", "Internal key is required"));
  if (!draft.ownerId && !agent.ownerId) {
    warnings.push(warn("identity", "ownerId", "No owner assigned"));
  }
  sections.identity = {
    name: "Identity",
    complete: Math.round((identityFilled / identityFields.length) * 100),
    warnings: warnings.filter((w) => w.section === "identity").length,
    blockers: blockers.filter((b) => b.section === "identity").length,
  };

  // ── Behavior ──
  let behaviorFilled = 0;
  const behaviorFields = ["mission", "scope", "successCriteria"] as const;
  for (const f of behaviorFields) {
    if (draft[f]) behaviorFilled++;
  }
  if (!draft.mission) blockers.push(blocker("behavior", "mission", "Mission is required"));
  if (!draft.scope) warnings.push(warn("behavior", "scope", "Scope not defined"));
  if (!draft.successCriteria)
    warnings.push(warn("behavior", "successCriteria", "Success criteria not defined"));
  sections.behavior = {
    name: "Behavior",
    complete: Math.round((behaviorFilled / behaviorFields.length) * 100),
    warnings: warnings.filter((w) => w.section === "behavior").length,
    blockers: blockers.filter((b) => b.section === "behavior").length,
  };

  // ── Prompts ──
  let promptsFilled = 0;
  const promptFields = ["systemInstructions", "outputContract"] as const;
  for (const f of promptFields) {
    if (draft[f]) promptsFilled++;
  }
  if (!draft.systemInstructions)
    blockers.push(blocker("prompts", "systemInstructions", "System instructions are required"));
  if (!draft.outputContract)
    warnings.push(warn("prompts", "outputContract", "Output contract not defined"));
  if (!draft.refusalBehavior)
    warnings.push(warn("prompts", "refusalBehavior", "Refusal behavior not defined"));
  sections.prompts = {
    name: "Prompts",
    complete: Math.round((promptsFilled / promptFields.length) * 100),
    warnings: warnings.filter((w) => w.section === "prompts").length,
    blockers: blockers.filter((b) => b.section === "prompts").length,
  };

  // ── Tools ──
  const tools = await repo.listToolBindings(draft.id);
  let toolWarnCount = 0;
  for (const t of tools) {
    const bl = (t.blockedActions ?? []) as string[];
    const al = (t.allowedActions ?? []) as string[];
    if (al.length === 0 && bl.length === 0) {
      warnings.push(
        warn(
          "tools",
          t.toolKey,
          `Tool '${t.toolName}' has no allow/block configuration — treated as risky`
        )
      );
      toolWarnCount++;
    }
    if (!t.requiresApproval && al.some((a) => /delete|drop|destroy/i.test(a))) {
      warnings.push(
        warn(
          "tools",
          t.toolKey,
          `Tool '${t.toolName}' allows destructive action without approval — must require approval`
        )
      );
      toolWarnCount++;
    }
  }
  sections.tools = {
    name: "Tools",
    complete: tools.length === 0 ? 0 : 100,
    warnings: toolWarnCount,
    blockers: 0,
  };

  // ── Knowledge ──
  const knowledge = await repo.listKnowledgeBindings(draft.id);
  sections.knowledge = {
    name: "Knowledge",
    complete: knowledge.length === 0 ? 0 : 100,
    warnings: knowledge.length === 0 ? 1 : 0,
    blockers: 0,
  };
  if (knowledge.length === 0) {
    warnings.push(warn("knowledge", undefined, "No knowledge sources attached"));
  }

  // ── Memory ──
  const memory = await repo.listMemoryConfigs(draft.id);
  const enabledMem = memory.filter((m) => m.enabled);
  sections.memory = {
    name: "Memory",
    complete: memory.length === 0 ? 0 : 100,
    warnings: enabledMem.some((m) => !m.retentionDays && m.memoryType === "persistent") ? 1 : 0,
    blockers: 0,
  };
  if (enabledMem.some((m) => m.memoryType === "persistent" && !m.retentionDays)) {
    warnings.push(
      warn("memory", "retentionDays", "Persistent memory enabled without retention policy")
    );
  }

  // ── Workflow ──
  const nodes = await repo.listWorkflowNodes(draft.id);
  sections.workflows = {
    name: "Workflows",
    complete: nodes.length === 0 ? 0 : 100,
    warnings: 0,
    blockers: 0,
  };

  // ── Governance ──
  const policy = (draft.governancePolicy ?? {}) as Record<string, unknown>;
  const hasBudget = "budgetCeiling" in policy && policy.budgetCeiling;
  const hasAuditReq = "auditRequired" in policy && policy.auditRequired;
  let govComplete = 0;
  if (hasBudget) govComplete += 50;
  if (hasAuditReq) govComplete += 50;
  if (!hasBudget) warnings.push(warn("governance", "budgetCeiling", "No budget ceiling configured"));
  if (!hasAuditReq)
    warnings.push(warn("governance", "auditRequired", "Audit logging not explicitly required"));
  sections.governance = {
    name: "Governance",
    complete: govComplete,
    warnings: warnings.filter((w) => w.section === "governance").length,
    blockers: 0,
  };

  // ── Simulation ──
  const latestSim = await repo.getLatestSimulationRun(agentId);
  if (!latestSim) {
    warnings.push(warn("simulation", undefined, "No simulation runs yet"));
  }
  sections.simulation = {
    name: "Simulation",
    complete: latestSim ? 100 : 0,
    warnings: latestSim ? 0 : 1,
    blockers: 0,
  };

  // ── Testing ──
  const latestTest = await repo.getLatestTestRun(agentId);
  if (!latestTest) {
    warnings.push(warn("testing", undefined, "No test runs yet"));
  } else if ((latestTest.failedCount ?? 0) > 0) {
    blockers.push(
      blocker(
        "testing",
        undefined,
        `${latestTest.failedCount} failing test(s) — fix before publish`
      )
    );
  }
  sections.testing = {
    name: "Testing",
    complete: latestTest ? 100 : 0,
    warnings: latestTest ? 0 : 1,
    blockers: latestTest && (latestTest.failedCount ?? 0) > 0 ? 1 : 0,
  };

  // ── Aggregate ──
  const totalSections = Object.values(sections);
  const avgComplete =
    totalSections.reduce((a, s) => a + s.complete, 0) / totalSections.length;
  const score = Math.max(
    0,
    Math.round(avgComplete - warnings.length * 2 - blockers.length * 15)
  );

  // Required-fields gate for publish
  const allRequiredFilled = AGS_REQUIRED_PUBLISH_FIELDS.every((f) => {
    return Boolean((draft as any)[f] ?? (agent as any)[f]);
  });

  const publishReady = blockers.length === 0 && allRequiredFilled && score >= 70;

  return {
    score,
    completeness: Math.round(avgComplete),
    totalChecks: totalSections.length,
    passedChecks: totalSections.filter((s) => s.complete === 100).length,
    warnings,
    blockers,
    publishReady,
    sections,
  };
}

function warn(section: string, field: string | undefined, message: string): ReadinessIssue {
  return { section, field, severity: "warning", message };
}

function blocker(section: string, field: string | undefined, message: string): ReadinessIssue {
  return { section, field, severity: "blocker", message };
}

function emptyReport(reason: string): ReadinessReport {
  return {
    score: 0,
    completeness: 0,
    totalChecks: 0,
    passedChecks: 0,
    warnings: [],
    blockers: [{ section: "system", severity: "blocker", message: reason }],
    publishReady: false,
    sections: {},
  };
}

// ───────────────────────────────────────────────────────────────────
// Plan v3 Phase 28 — Export-Catalog Readiness Snapshot
// ───────────────────────────────────────────────────────────────────

export interface AgentReadinessSnapshot {
  /**
   * Mirror of `ReadinessReport.score` (0–100) — surfaced under the
   * export-catalog field name so consumers (Phase 29's
   * `AgentStudioExportCandidate`) can read the field directly without
   * remapping.
   */
  readinessScore: number;
  /** Domain-typed identifier of who/what computed the snapshot. */
  readinessComputedBy: string;
  /** ISO timestamp the snapshot was computed. */
  readinessComputedAt: string;
  /**
   * Snapshot of `publishReady` flag from the underlying report. The
   * export catalog uses this independently of `readinessScore` to set
   * the "ready to export" filter without re-running computation.
   */
  publishReady: boolean;
  /**
   * Full `ReadinessReport` so callers can render section-level detail
   * without a second round-trip.
   */
  report: ReadinessReport;
}

export interface ComputeAgentReadinessSnapshotInput {
  agentId: number;
  /**
   * The user / system actor invoking the snapshot. Stored on
   * `readinessComputedBy` as `user:<id>` or `system:<name>`.
   */
  computedBy: string;
  /**
   * Optional clock injection for tests. Defaults to `new Date()`.
   */
  now?: () => Date;
}

/**
 * Plan v3 Phase 28 — canonical export-readiness snapshot computer.
 *
 * Wraps `computeReadiness(agentId)` with the export-catalog naming
 * convention (`readinessScore`, `readinessComputedBy`,
 * `readinessComputedAt`) and a stable timestamp captured at the
 * call boundary. Does NOT mutate any DB state — only reads.
 */
export async function computeAgentReadinessSnapshot(
  input: ComputeAgentReadinessSnapshotInput,
): Promise<AgentReadinessSnapshot> {
  const now = input.now ?? (() => new Date());
  const readinessComputedAt = now().toISOString();
  const report = await computeReadiness(input.agentId);
  return {
    readinessScore: report.score,
    readinessComputedBy: input.computedBy,
    readinessComputedAt,
    publishReady: report.publishReady,
    report,
  };
}
