/**
 * Idea Builder Validation Library — Production-grade artifact validation
 *
 * Validates all 11 PMI artifact types with severity levels:
 *   blocker  — prevents commit, must be fixed
 *   critical — should be fixed before commit
 *   major    — recommended fix
 *   minor    — informational
 *
 * Includes cross-artifact consistency validation and authority checks.
 */

import {
  type ValidationIssue,
  type ValidationResult,
  type ValidationSeverity,
  type ScopeStatement,
  type ProjectCharter,
  type StakeholderRegister,
  type Wbs,
  type ScheduleBaseline,
  type CostBaseline,
  type RiskRegister,
  type CommunicationsPlan,
  type QualityPlan,
  type ChangeControlPlan,
  type GateReadinessReport,
  ARTIFACT_REQUIRED_FIELDS,
  type ArtifactTypeName,
} from "@shared/pm-artifact-schemas";
import { DENIED_ACTIONS } from "@shared/pm-agent-engine";

// ── Helpers ─────────────────────────────────────────────────────────────────

function issue(
  field: string,
  rule: string,
  severity: ValidationSeverity,
  message: string,
  artifactType: string,
  crossRef?: string,
): ValidationIssue {
  return { field, rule, severity, message, artifactType, crossRef };
}

function buildResult(issues: ValidationIssue[]): ValidationResult {
  const blockerCount = issues.filter((i) => i.severity === "blocker").length;
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const majorCount = issues.filter((i) => i.severity === "major").length;
  const minorCount = issues.filter((i) => i.severity === "minor").length;

  const totalChecks = Math.max(issues.length + 10, 10);
  const deductions = blockerCount * 25 + criticalCount * 15 + majorCount * 5 + minorCount * 1;
  const score = Math.max(0, Math.min(100, 100 - deductions));

  return {
    valid: blockerCount === 0,
    issues,
    score,
    blockerCount,
    criticalCount,
    majorCount,
    minorCount,
  };
}

// ── Required Fields Check ───────────────────────────────────────────────────

function validateRequiredFields(data: Record<string, unknown>, artifactType: ArtifactTypeName): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const required = ARTIFACT_REQUIRED_FIELDS[artifactType] || [];

  for (const field of required) {
    const val = data[field];
    if (val === undefined || val === null || val === "") {
      issues.push(issue(field, "required_field", "blocker", `Required field "${field}" is missing`, artifactType));
    } else if (Array.isArray(val) && val.length === 0) {
      issues.push(issue(field, "required_field_empty", "critical", `Required field "${field}" is an empty array`, artifactType));
    }
  }

  return issues;
}

// ── 1. Scope Completeness ───────────────────────────────────────────────────

export function validateScopeStatement(scope: ScopeStatement): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRequiredFields(scope as unknown as Record<string, unknown>, "scope_statement"),
  ];

  if (scope.projectObjective && scope.projectObjective.length < 20) {
    issues.push(issue("projectObjective", "min_length", "major", "Project objective should be at least 20 characters", "scope_statement"));
  }
  if (scope.inScope.length < 2) {
    issues.push(issue("inScope", "min_items", "critical", "At least 2 in-scope items recommended", "scope_statement"));
  }
  if (scope.outOfScope.length === 0) {
    issues.push(issue("outOfScope", "empty_exclusions", "major", "Out-of-scope items should be defined to prevent scope creep", "scope_statement"));
  }
  if (scope.deliverables.length === 0) {
    issues.push(issue("deliverables", "no_deliverables", "blocker", "At least one deliverable must be defined", "scope_statement"));
  }
  for (const d of scope.deliverables) {
    if (!d.acceptanceCriteria) {
      issues.push(issue(`deliverables[${d.id}].acceptanceCriteria`, "missing_acceptance", "major", `Deliverable "${d.name}" lacks acceptance criteria`, "scope_statement"));
    }
  }
  if (scope.constraints.length === 0) {
    issues.push(issue("constraints", "no_constraints", "minor", "Consider documenting project constraints", "scope_statement"));
  }
  if (scope.assumptions.length === 0) {
    issues.push(issue("assumptions", "no_assumptions", "minor", "Consider documenting project assumptions", "scope_statement"));
  }
  if (scope.successCriteria.length === 0) {
    issues.push(issue("successCriteria", "no_success_criteria", "major", "Success criteria should be defined", "scope_statement"));
  }

  return buildResult(issues);
}

// ── 2. Charter Validation ───────────────────────────────────────────────────

export function validateProjectCharter(charter: ProjectCharter): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRequiredFields(charter as unknown as Record<string, unknown>, "project_charter"),
  ];

  if (!charter.sponsor || charter.sponsor.length < 2) {
    issues.push(issue("sponsor", "invalid_sponsor", "blocker", "Sponsor must be identified", "project_charter"));
  }
  if (!charter.projectManager || charter.projectManager.length < 2) {
    issues.push(issue("projectManager", "invalid_pm", "blocker", "Project Manager must be identified", "project_charter"));
  }
  if (charter.milestones.length === 0) {
    issues.push(issue("milestones", "no_milestones", "critical", "At least one milestone should be defined", "project_charter"));
  }
  if (charter.deliverables.length === 0) {
    issues.push(issue("deliverables", "no_deliverables", "blocker", "Charter must list deliverables", "project_charter"));
  }
  if (charter.initialRisks.length === 0) {
    issues.push(issue("initialRisks", "no_risks", "major", "Initial risks should be identified", "project_charter"));
  }
  for (const risk of charter.initialRisks) {
    if (!risk.mitigation) {
      issues.push(issue(`initialRisks[${risk.id}].mitigation`, "missing_mitigation", "major", `Risk "${risk.title}" lacks mitigation strategy`, "project_charter"));
    }
  }

  return buildResult(issues);
}

// ── 3. Stakeholder Coverage ─────────────────────────────────────────────────

export function validateStakeholderRegister(register: StakeholderRegister): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRequiredFields(register as unknown as Record<string, unknown>, "stakeholder_register"),
  ];

  if (register.stakeholders.length < 3) {
    issues.push(issue("stakeholders", "insufficient_coverage", "critical", "At least 3 stakeholders recommended for adequate coverage", "stakeholder_register"));
  }
  const hasHighInfluence = register.stakeholders.some((s) => s.influence === "high");
  if (!hasHighInfluence) {
    issues.push(issue("stakeholders", "no_high_influence", "major", "No high-influence stakeholders identified", "stakeholder_register"));
  }
  const hasSponsor = register.stakeholders.some((s) => s.role.toLowerCase().includes("sponsor"));
  if (!hasSponsor) {
    issues.push(issue("stakeholders", "missing_sponsor", "critical", "Sponsor should be in stakeholder register", "stakeholder_register"));
  }
  const hasPM = register.stakeholders.some((s) => s.role.toLowerCase().includes("project manager") || s.role.toLowerCase().includes("pm"));
  if (!hasPM) {
    issues.push(issue("stakeholders", "missing_pm", "major", "Project Manager should be in stakeholder register", "stakeholder_register"));
  }
  for (const s of register.stakeholders) {
    if (!s.communicationPreference) {
      issues.push(issue(`stakeholders[${s.id}].communicationPreference`, "missing_comm_pref", "minor", `Stakeholder "${s.name}" lacks communication preference`, "stakeholder_register"));
    }
  }

  return buildResult(issues);
}

// ── 4. WBS Coverage ─────────────────────────────────────────────────────────

export function validateWbs(wbs: Wbs): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRequiredFields(wbs as unknown as Record<string, unknown>, "wbs"),
  ];

  if (wbs.nodes.length < 5) {
    issues.push(issue("nodes", "insufficient_nodes", "critical", "WBS should have at least 5 nodes for adequate decomposition", "wbs"));
  }
  if (wbs.maxDepth < 2) {
    issues.push(issue("maxDepth", "shallow_wbs", "major", "WBS should have at least 2 levels of decomposition", "wbs"));
  }
  if (wbs.workPackageCount === 0) {
    issues.push(issue("workPackageCount", "no_work_packages", "blocker", "WBS must contain at least one work package", "wbs"));
  }
  const rootNode = wbs.nodes.find((n) => n.id === wbs.rootNodeId);
  if (!rootNode) {
    issues.push(issue("rootNodeId", "invalid_root", "blocker", "Root node not found in nodes array", "wbs"));
  }
  const nodeIds = new Set(wbs.nodes.map((n) => n.id));
  for (const node of wbs.nodes) {
    if (node.parentId && !nodeIds.has(node.parentId)) {
      issues.push(issue(`nodes[${node.id}].parentId`, "orphan_node", "critical", `Node "${node.name}" references nonexistent parent "${node.parentId}"`, "wbs"));
    }
    for (const childId of node.children) {
      if (!nodeIds.has(childId)) {
        issues.push(issue(`nodes[${node.id}].children`, "missing_child", "critical", `Node "${node.name}" references nonexistent child "${childId}"`, "wbs"));
      }
    }
  }

  return buildResult(issues);
}

// ── 5. Schedule DAG Validation ──────────────────────────────────────────────

export function validateScheduleBaseline(schedule: ScheduleBaseline): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRequiredFields(schedule as unknown as Record<string, unknown>, "schedule_baseline"),
  ];

  if (schedule.tasks.length === 0) {
    issues.push(issue("tasks", "no_tasks", "blocker", "Schedule must contain tasks", "schedule_baseline"));
  }
  const taskIds = new Set(schedule.tasks.map((t) => t.id));
  for (const task of schedule.tasks) {
    for (const dep of task.dependencies) {
      if (!taskIds.has(dep.taskId)) {
        issues.push(issue(`tasks[${task.id}].dependencies`, "invalid_dependency", "critical",
          `Task "${task.name}" depends on nonexistent task "${dep.taskId}"`, "schedule_baseline"));
      }
    }
    if (task.durationDays <= 0 && !task.milestone) {
      issues.push(issue(`tasks[${task.id}].durationDays`, "zero_duration", "major",
        `Task "${task.name}" has zero or negative duration`, "schedule_baseline"));
    }
    if (new Date(task.startDate) > new Date(task.endDate)) {
      issues.push(issue(`tasks[${task.id}].dates`, "inverted_dates", "blocker",
        `Task "${task.name}" has start date after end date`, "schedule_baseline"));
    }
  }
  if (schedule.milestones.length === 0) {
    issues.push(issue("milestones", "no_milestones", "major", "Schedule should include milestones", "schedule_baseline"));
  }
  // Check for circular dependencies (simplified: check self-reference)
  for (const task of schedule.tasks) {
    if (task.dependencies.some((d) => d.taskId === task.id)) {
      issues.push(issue(`tasks[${task.id}].dependencies`, "circular_dependency", "blocker",
        `Task "${task.name}" has a self-dependency`, "schedule_baseline"));
    }
  }

  return buildResult(issues);
}

// ── 6. Cost Sum Validation ──────────────────────────────────────────────────

export function validateCostBaseline(cost: CostBaseline): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRequiredFields(cost as unknown as Record<string, unknown>, "cost_baseline"),
  ];

  if (cost.lineItems.length === 0) {
    issues.push(issue("lineItems", "no_items", "blocker", "Cost baseline must have line items", "cost_baseline"));
  }
  const calculatedTotal = cost.lineItems.reduce((sum, item) => sum + item.totalCost, 0);
  const expectedTotal = cost.totalEstimatedCost - cost.contingencyAmount - cost.managementReserveAmount;
  if (Math.abs(calculatedTotal - expectedTotal) > 1) {
    issues.push(issue("totalEstimatedCost", "sum_mismatch", "critical",
      `Line items sum (${calculatedTotal.toFixed(2)}) does not match stated total minus reserves (${expectedTotal.toFixed(2)})`, "cost_baseline"));
  }
  for (const item of cost.lineItems) {
    if (item.totalCost !== item.quantity * item.unitCost) {
      issues.push(issue(`lineItems[${item.id}].totalCost`, "calculation_error", "major",
        `Line item "${item.description}" total (${item.totalCost}) != quantity (${item.quantity}) * unit cost (${item.unitCost})`, "cost_baseline"));
    }
    if (item.totalCost < 0) {
      issues.push(issue(`lineItems[${item.id}].totalCost`, "negative_cost", "blocker",
        `Line item "${item.description}" has negative cost`, "cost_baseline"));
    }
  }
  if (cost.budgetEnvelope > 0 && cost.totalEstimatedCost > cost.budgetEnvelope) {
    issues.push(issue("budgetVariance", "over_budget", "critical",
      `Total estimated cost (${cost.totalEstimatedCost}) exceeds budget envelope (${cost.budgetEnvelope})`, "cost_baseline"));
  }
  if (cost.contingencyPercent <= 0) {
    issues.push(issue("contingencyPercent", "no_contingency", "major", "Contingency reserve should be included", "cost_baseline"));
  }

  return buildResult(issues);
}

// ── 7. Risk Field Validation ────────────────────────────────────────────────

export function validateRiskRegister(register: RiskRegister): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRequiredFields(register as unknown as Record<string, unknown>, "risk_register"),
  ];

  if (register.risks.length === 0) {
    issues.push(issue("risks", "no_risks", "critical", "At least one risk should be identified", "risk_register"));
  }
  for (const risk of register.risks) {
    if (!risk.mitigation) {
      issues.push(issue(`risks[${risk.id}].mitigation`, "missing_mitigation", "major",
        `Risk "${risk.title}" lacks mitigation strategy`, "risk_register"));
    }
    if (!risk.owner) {
      issues.push(issue(`risks[${risk.id}].owner`, "missing_owner", "critical",
        `Risk "${risk.title}" has no assigned owner`, "risk_register"));
    }
    if (!risk.trigger) {
      issues.push(issue(`risks[${risk.id}].trigger`, "missing_trigger", "minor",
        `Risk "${risk.title}" lacks a defined trigger`, "risk_register"));
    }
    const probMap = { low: 1, medium: 2, high: 3 };
    const expectedScore = probMap[risk.probability] * probMap[risk.impact];
    if (risk.riskScore !== expectedScore) {
      issues.push(issue(`risks[${risk.id}].riskScore`, "score_mismatch", "major",
        `Risk "${risk.title}" score (${risk.riskScore}) doesn't match P(${risk.probability})*I(${risk.impact})=${expectedScore}`, "risk_register"));
    }
  }
  if (register.mitigationCoveragePercent < 80) {
    issues.push(issue("mitigationCoveragePercent", "low_mitigation_coverage", "major",
      `Mitigation coverage is ${register.mitigationCoveragePercent}%, recommended ≥80%`, "risk_register"));
  }

  return buildResult(issues);
}

// ── 8. Communications Plan Validation ───────────────────────────────────────

export function validateCommunicationsPlan(plan: CommunicationsPlan): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRequiredFields(plan as unknown as Record<string, unknown>, "communications_plan"),
  ];

  if (plan.communications.length === 0) {
    issues.push(issue("communications", "no_items", "blocker", "Communications plan must have at least one item", "communications_plan"));
  }
  if (plan.escalationPath.length < 2) {
    issues.push(issue("escalationPath", "insufficient_escalation", "critical", "Escalation path should have at least 2 levels", "communications_plan"));
  }
  for (const comm of plan.communications) {
    if (comm.audience.length === 0) {
      issues.push(issue(`communications[${comm.id}].audience`, "no_audience", "major",
        `Communication "${comm.name}" has no defined audience`, "communications_plan"));
    }
    if (!comm.owner) {
      issues.push(issue(`communications[${comm.id}].owner`, "no_owner", "critical",
        `Communication "${comm.name}" has no owner`, "communications_plan"));
    }
  }

  return buildResult(issues);
}

// ── 9. Quality Plan Validation ──────────────────────────────────────────────

export function validateQualityPlan(plan: QualityPlan): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRequiredFields(plan as unknown as Record<string, unknown>, "quality_plan"),
  ];

  if (plan.standards.length === 0) {
    issues.push(issue("standards", "no_standards", "critical", "Quality plan must define at least one standard", "quality_plan"));
  }
  if (plan.acceptanceCriteria.length === 0) {
    issues.push(issue("acceptanceCriteria", "no_criteria", "blocker", "Acceptance criteria must be defined", "quality_plan"));
  }
  if (plan.definitionOfDone.length === 0) {
    issues.push(issue("definitionOfDone", "no_dod", "critical", "Definition of Done must be specified", "quality_plan"));
  }
  for (const std of plan.standards) {
    if (!std.metric) {
      issues.push(issue(`standards[${std.id}].metric`, "no_metric", "major",
        `Standard "${std.name}" lacks a measurable metric`, "quality_plan"));
    }
  }

  return buildResult(issues);
}

// ── 10. Change Control Plan Validation ──────────────────────────────────────

export function validateChangeControlPlan(plan: ChangeControlPlan): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRequiredFields(plan as unknown as Record<string, unknown>, "change_control_plan"),
  ];

  if (plan.changeProcess.length < 3) {
    issues.push(issue("changeProcess", "incomplete_process", "critical", "Change control process should have at least 3 steps", "change_control_plan"));
  }
  if (plan.changeCategories.length === 0) {
    issues.push(issue("changeCategories", "no_categories", "major", "Change categories should be defined", "change_control_plan"));
  }

  return buildResult(issues);
}

// ── 11. Gate Readiness Validation ───────────────────────────────────────────

export function validateGateReadinessReport(report: GateReadinessReport): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRequiredFields(report as unknown as Record<string, unknown>, "gate_readiness_report"),
  ];

  if (report.checks.length === 0) {
    issues.push(issue("checks", "no_checks", "blocker", "Readiness report must contain checks", "gate_readiness_report"));
  }
  const failedChecks = report.checks.filter((c) => c.status === "fail");
  if (failedChecks.length > 0) {
    for (const fc of failedChecks) {
      issues.push(issue(`checks[${fc.id}]`, "failed_check", fc.severity,
        `Check "${fc.item}" failed: ${fc.note}`, "gate_readiness_report", fc.artifactRef));
    }
  }

  return buildResult(issues);
}

// ── Cross-Artifact Consistency ──────────────────────────────────────────────

export function validateCrossArtifactConsistency(
  artifacts: Record<string, Record<string, unknown>>,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  const scope = artifacts.scope_statement as unknown as ScopeStatement | undefined;
  const wbs = artifacts.wbs as unknown as Wbs | undefined;
  const schedule = artifacts.schedule_baseline as unknown as ScheduleBaseline | undefined;
  const cost = artifacts.cost_baseline as unknown as CostBaseline | undefined;
  const risks = artifacts.risk_register as unknown as RiskRegister | undefined;
  const stakeholders = artifacts.stakeholder_register as unknown as StakeholderRegister | undefined;
  const comms = artifacts.communications_plan as unknown as CommunicationsPlan | undefined;
  const charter = artifacts.project_charter as unknown as ProjectCharter | undefined;

  // Scope deliverables should appear in WBS
  if (scope && wbs) {
    const wbsNodeNames = new Set(wbs.nodes.map((n) => n.name.toLowerCase()));
    for (const del of scope.deliverables) {
      if (!wbsNodeNames.has(del.name.toLowerCase())) {
        issues.push(issue("scope→wbs", "deliverable_not_in_wbs", "major",
          `Scope deliverable "${del.name}" not found in WBS`, "cross_artifact", del.id));
      }
    }
  }

  // WBS work packages should appear in schedule
  if (wbs && schedule) {
    const scheduleWbsRefs = new Set(schedule.tasks.map((t) => t.wbsRef));
    const workPackages = wbs.nodes.filter((n) => n.isWorkPackage);
    for (const wp of workPackages) {
      if (!scheduleWbsRefs.has(wp.id)) {
        issues.push(issue("wbs→schedule", "wp_not_scheduled", "major",
          `WBS work package "${wp.name}" (${wp.id}) has no corresponding schedule task`, "cross_artifact", wp.id));
      }
    }
  }

  // Schedule tasks should have cost line items
  if (schedule && cost) {
    const costWbsRefs = new Set(cost.lineItems.map((i) => i.wbsRef));
    for (const task of schedule.tasks) {
      if (!task.milestone && !costWbsRefs.has(task.wbsRef)) {
        issues.push(issue("schedule→cost", "task_not_costed", "minor",
          `Schedule task "${task.name}" has no cost line item`, "cross_artifact", task.id));
      }
    }
  }

  // Stakeholders should appear in communications plan
  if (stakeholders && comms) {
    const commAudiences = new Set(comms.communications.flatMap((c) => c.stakeholderRef));
    for (const sh of stakeholders.stakeholders) {
      if (sh.influence === "high" && !commAudiences.has(sh.id)) {
        issues.push(issue("stakeholder→comms", "high_influence_not_in_comms", "major",
          `High-influence stakeholder "${sh.name}" not referenced in communications plan`, "cross_artifact", sh.id));
      }
    }
  }

  // Charter scope should match scope statement
  if (charter && scope) {
    if (charter.projectName !== scope.projectName) {
      issues.push(issue("charter→scope", "name_mismatch", "critical",
        `Charter project name "${charter.projectName}" differs from scope "${scope.projectName}"`, "cross_artifact"));
    }
  }

  return buildResult(issues);
}

// ── Authority Validation ────────────────────────────────────────────────────

export function validateAuthorityCompliance(requestedAction: string, agentAlias: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  if ((DENIED_ACTIONS as readonly string[]).includes(requestedAction)) {
    issues.push(issue(
      "authority",
      "forbidden_action",
      "blocker",
      `Agent "${agentAlias}" attempted forbidden action "${requestedAction}". Denied by enterprise invariant.`,
      "authority_check",
    ));
  }

  return buildResult(issues);
}

// ── Validate Any Artifact ───────────────────────────────────────────────────

export function validateArtifact(artifactType: string, data: Record<string, unknown>): ValidationResult {
  switch (artifactType) {
    case "scope_statement": return validateScopeStatement(data as unknown as ScopeStatement);
    case "project_charter": return validateProjectCharter(data as unknown as ProjectCharter);
    case "stakeholder_register": return validateStakeholderRegister(data as unknown as StakeholderRegister);
    case "wbs": return validateWbs(data as unknown as Wbs);
    case "schedule_baseline": return validateScheduleBaseline(data as unknown as ScheduleBaseline);
    case "cost_baseline": return validateCostBaseline(data as unknown as CostBaseline);
    case "risk_register": return validateRiskRegister(data as unknown as RiskRegister);
    case "communications_plan": return validateCommunicationsPlan(data as unknown as CommunicationsPlan);
    case "quality_plan": return validateQualityPlan(data as unknown as QualityPlan);
    case "change_control_plan": return validateChangeControlPlan(data as unknown as ChangeControlPlan);
    case "gate_readiness_report": return validateGateReadinessReport(data as unknown as GateReadinessReport);
    default:
      return buildResult([issue("artifactType", "unknown_type", "blocker", `Unknown artifact type: ${artifactType}`, artifactType)]);
  }
}
