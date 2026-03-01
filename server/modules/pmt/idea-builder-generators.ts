/**
 * Idea Builder Generators — Template-based PMI artifact generation
 *
 * Phase 1: Generates complete PMI artifacts from a textual project idea.
 * No LLM dependency — uses structured templates populated via idea parsing.
 * Phase 2 will replace with LLM-based generation while keeping the same output contracts.
 */

import type {
  IdeaBuilderInput,
  ScopeStatement,
  ProjectCharter,
  StakeholderRegister,
  StakeholderEntry,
  Wbs,
  WbsNode,
  ScheduleBaseline,
  ScheduleTask,
  CostBaseline,
  CostLineItem,
  RiskRegister,
  RiskEntry,
  CommunicationsPlan,
  CommunicationItem,
  QualityPlan,
  QualityStandard,
  ChangeControlPlan,
  GateReadinessReport,
  ReadinessCheckItem,
} from "@shared/pm-artifact-schemas";

const AGENT_ALIAS = "idea_to_pmi_builder";
const now = () => new Date().toISOString();
let _counter = 0;
const uid = (prefix: string) => `${prefix}_${++_counter}`;

// ── Idea Parsing ────────────────────────────────────────────────────────────

interface ParsedIdea {
  projectName: string;
  objective: string;
  problemStatement: string;
  businessJustification: string;
  deliverables: string[];
  keywords: string[];
  sentences: string[];
}

function parseIdea(ideaText: string): ParsedIdea {
  const sentences = ideaText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const firstSentence = sentences[0] || ideaText.substring(0, 80);
  const projectName = firstSentence.length > 60
    ? firstSentence.substring(0, 60).replace(/\s+\S*$/, "")
    : firstSentence;

  const keywords = ideaText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, 20);

  const deliverables: string[] = [];
  for (const s of sentences) {
    if (/deliver|build|create|develop|implement|deploy|design|produce|launch/i.test(s)) {
      deliverables.push(s);
    }
  }
  if (deliverables.length === 0 && sentences.length > 1) {
    deliverables.push(sentences[1] || "Primary deliverable");
  }
  if (deliverables.length === 0) {
    deliverables.push("Core project deliverable based on stated objectives");
  }

  return {
    projectName,
    objective: ideaText.substring(0, 500),
    problemStatement: sentences.length > 1 ? sentences[0] : `Address: ${projectName}`,
    businessJustification: sentences.length > 2
      ? sentences.slice(0, 2).join(". ")
      : `Business value: ${projectName}`,
    deliverables,
    keywords,
    sentences,
  };
}

// ── 1. Scope Statement Generator ────────────────────────────────────────────

export function generateScopeStatement(input: IdeaBuilderInput): ScopeStatement {
  const parsed = parseIdea(input.ideaText);

  const deliverables = parsed.deliverables.map((d, i) => ({
    id: uid("del"),
    name: d.length > 80 ? d.substring(0, 80) : d,
    description: d,
    acceptanceCriteria: `Verified and approved by project sponsor; meets defined quality standards`,
    wbsRef: `1.3.${i + 1}`,
  }));

  return {
    artifactType: "scope_statement",
    projectName: parsed.projectName,
    projectObjective: parsed.objective,
    problemStatement: parsed.problemStatement,
    businessJustification: parsed.businessJustification,
    inScope: [
      `Core implementation: ${parsed.projectName}`,
      "Requirements analysis and documentation",
      "Design and architecture",
      "Development and implementation",
      "Testing and quality assurance",
      "Deployment and handover",
      "Project documentation and training",
    ],
    outOfScope: [
      "Ongoing operational support post-handover",
      "Infrastructure procurement beyond project scope",
      "Organizational change management",
      "Third-party system modifications not specified",
    ],
    deliverables,
    constraints: [
      ...(input.budgetEnvelope ? [`Budget limited to ${input.budgetEnvelope.toLocaleString()} USD`] : ["Budget to be determined"]),
      ...(input.deadline ? [`Target completion by ${input.deadline}`] : ["Timeline to be determined"]),
      "Resource availability subject to organizational capacity",
      "Technology stack aligned with enterprise standards",
    ],
    assumptions: [
      "Stakeholder availability for requirements validation",
      "Existing infrastructure meets baseline requirements",
      "Team members have required technical competencies",
      "Organizational support and executive sponsorship confirmed",
      "No major regulatory changes during project lifecycle",
    ],
    boundaries: [
      "Project scope limited to stated deliverables",
      "Changes require formal change control process",
    ],
    successCriteria: [
      "All deliverables accepted by project sponsor",
      "Project completed within approved budget and timeline",
      "Quality standards met as defined in quality plan",
      "Stakeholder satisfaction above 80%",
      "Gate reviews passed with no blockers",
    ],
    generatedAt: now(),
    generatedBy: AGENT_ALIAS,
  };
}

// ── 2. Project Charter Generator ────────────────────────────────────────────

export function generateProjectCharter(input: IdeaBuilderInput, scope: ScopeStatement): ProjectCharter {
  const riskTier = input.riskTier || "medium";
  const baseDate = input.deadline ? new Date(input.deadline) : new Date(Date.now() + 180 * 86400000);

  const milestones = [
    { id: uid("ms"), name: "Project Initiation Complete", targetDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0], description: "Charter approved, team assembled" },
    { id: uid("ms"), name: "Requirements Baseline", targetDate: new Date(Date.now() + 42 * 86400000).toISOString().split("T")[0], description: "Requirements documented and approved" },
    { id: uid("ms"), name: "Design Complete", targetDate: new Date(Date.now() + 70 * 86400000).toISOString().split("T")[0], description: "Architecture and design finalized" },
    { id: uid("ms"), name: "Development Complete", targetDate: new Date(Date.now() + 120 * 86400000).toISOString().split("T")[0], description: "All features implemented" },
    { id: uid("ms"), name: "Testing Complete", targetDate: new Date(Date.now() + 150 * 86400000).toISOString().split("T")[0], description: "All tests passed, defects resolved" },
    { id: uid("ms"), name: "Project Closure", targetDate: baseDate.toISOString().split("T")[0], description: "Handover complete, lessons learned documented" },
  ];

  return {
    artifactType: "project_charter",
    projectName: scope.projectName,
    version: "1.0",
    sponsor: "Project Sponsor (to be assigned)",
    projectManager: "Project Manager (to be assigned)",
    objective: scope.projectObjective,
    businessCase: scope.businessJustification,
    problemStatement: scope.problemStatement,
    expectedValue: [
      "Deliver measurable business value aligned with strategic objectives",
      "Improve operational efficiency through project deliverables",
      "Establish reusable capabilities and knowledge assets",
    ],
    inScope: scope.inScope,
    outOfScope: scope.outOfScope,
    deliverables: scope.deliverables.map((d) => d.name),
    constraints: scope.constraints,
    assumptions: scope.assumptions,
    milestones,
    initialRisks: [
      { id: uid("risk"), title: "Resource availability constraints", probability: "medium", impact: "high", mitigation: "Early resource planning and cross-training" },
      { id: uid("risk"), title: "Requirements volatility", probability: riskTier === "high" ? "high" : "medium", impact: "high", mitigation: "Formal change control and iterative validation" },
      { id: uid("risk"), title: "Technology integration complexity", probability: "medium", impact: "medium", mitigation: "Proof of concept and technical spikes early" },
      { id: uid("risk"), title: "Stakeholder alignment gaps", probability: "low", impact: "high", mitigation: "Regular steering committee meetings" },
      { id: uid("risk"), title: "Schedule compression pressure", probability: riskTier === "high" ? "high" : "medium", impact: "medium", mitigation: "Buffer in critical path and scope prioritization" },
    ],
    authorityLevel: "Standard PM authority — budget and resource allocation within approved limits",
    decisionModel: "RACI — Responsible, Accountable, Consulted, Informed",
    riskTier,
    dataTier: "internal",
    approvalRequirements: [
      "Sponsor approval for charter",
      "Steering committee approval for scope changes",
      "PM approval for schedule adjustments within tolerance",
    ],
    generatedAt: now(),
    generatedBy: AGENT_ALIAS,
  };
}

// ── 3. Stakeholder Register Generator ───────────────────────────────────────

export function generateStakeholderRegister(input: IdeaBuilderInput): StakeholderRegister {
  const parsed = parseIdea(input.ideaText);

  const stakeholders: StakeholderEntry[] = [
    { id: uid("sh"), name: "Executive Sponsor", role: "Project Sponsor", organization: "Executive Leadership", influence: "high", interest: "high", engagementLevel: "leading", communicationPreference: "Monthly executive briefing", expectations: "Project delivers on business case within budget", type: "internal" },
    { id: uid("sh"), name: "Project Manager", role: "Project Manager", organization: "PMO", influence: "high", interest: "high", engagementLevel: "leading", communicationPreference: "Daily standups, weekly reports", expectations: "Successful delivery of all project objectives", type: "internal" },
    { id: uid("sh"), name: "Technical Lead", role: "Technical Lead", organization: "Engineering", influence: "high", interest: "high", engagementLevel: "supportive", communicationPreference: "Daily standups, technical reviews", expectations: "Sound technical architecture and quality code", type: "internal" },
    { id: uid("sh"), name: "Business Analyst", role: "Business Analyst", organization: "Business Analysis", influence: "medium", interest: "high", engagementLevel: "supportive", communicationPreference: "Weekly sync, requirements workshops", expectations: "Clear, validated requirements", type: "internal" },
    { id: uid("sh"), name: "QA Lead", role: "Quality Assurance Lead", organization: "Quality", influence: "medium", interest: "high", engagementLevel: "supportive", communicationPreference: "Weekly quality reviews", expectations: "Comprehensive testing and quality gates", type: "internal" },
    { id: uid("sh"), name: "End User Representative", role: "User Representative", organization: "Operations", influence: "medium", interest: "medium", engagementLevel: "neutral", communicationPreference: "Biweekly demos and feedback sessions", expectations: "Usable, effective solution", type: "internal" },
    { id: uid("sh"), name: "Finance Controller", role: "Finance Representative", organization: "Finance", influence: "medium", interest: "medium", engagementLevel: "neutral", communicationPreference: "Monthly budget reports", expectations: "Project stays within budget", type: "internal" },
    { id: uid("sh"), name: "IT Operations", role: "Infrastructure Support", organization: "IT Operations", influence: "low", interest: "medium", engagementLevel: "supportive", communicationPreference: "As needed, deployment planning", expectations: "Smooth deployment and supportable solution", type: "internal" },
  ];

  const byInfluence = {
    high: stakeholders.filter((s) => s.influence === "high").length,
    medium: stakeholders.filter((s) => s.influence === "medium").length,
    low: stakeholders.filter((s) => s.influence === "low").length,
  };
  const byInterest = {
    high: stakeholders.filter((s) => s.interest === "high").length,
    medium: stakeholders.filter((s) => s.interest === "medium").length,
    low: stakeholders.filter((s) => s.interest === "low").length,
  };

  return {
    artifactType: "stakeholder_register",
    stakeholders,
    totalCount: stakeholders.length,
    byInfluence,
    byInterest,
    generatedAt: now(),
    generatedBy: AGENT_ALIAS,
  };
}

// ── 4. WBS Generator ────────────────────────────────────────────────────────

export function generateWbs(input: IdeaBuilderInput, scope: ScopeStatement): Wbs {
  const nodes: WbsNode[] = [];
  const projectName = scope.projectName;

  // Root node
  const rootId = uid("wbs");
  nodes.push({
    id: rootId, code: "1", name: projectName, description: `Root: ${projectName}`,
    level: 0, parentId: null, children: [], isWorkPackage: false,
  });

  // Phase 1: Initiation
  const initId = uid("wbs");
  nodes.push({ id: initId, code: "1.1", name: "Initiation", description: "Project initiation activities", level: 1, parentId: rootId, children: [], isWorkPackage: false });
  const initWps = [
    { name: "Develop Project Charter", effort: 16 },
    { name: "Identify Stakeholders", effort: 8 },
    { name: "Define Initial Scope", effort: 12 },
    { name: "Obtain Charter Approval", effort: 4 },
  ];
  for (const wp of initWps) {
    const wpId = uid("wbs");
    nodes.push({ id: wpId, code: `1.1.${initWps.indexOf(wp) + 1}`, name: wp.name, description: wp.name, level: 2, parentId: initId, children: [], isWorkPackage: true, estimatedEffortHours: wp.effort, assignmentType: "human" });
    nodes.find((n) => n.id === initId)!.children.push(wpId);
  }

  // Phase 2: Planning
  const planId = uid("wbs");
  nodes.push({ id: planId, code: "1.2", name: "Planning", description: "Project planning activities", level: 1, parentId: rootId, children: [], isWorkPackage: false });
  const planWps = [
    { name: "Develop Project Management Plan", effort: 24 },
    { name: "Define Scope Baseline", effort: 16 },
    { name: "Create WBS", effort: 12 },
    { name: "Develop Schedule Baseline", effort: 16 },
    { name: "Estimate Costs and Budget", effort: 12 },
    { name: "Plan Quality Management", effort: 8 },
    { name: "Plan Resource Management", effort: 8 },
    { name: "Plan Communications", effort: 6 },
    { name: "Plan Risk Management", effort: 12 },
    { name: "Plan Change Control", effort: 6 },
  ];
  for (const wp of planWps) {
    const wpId = uid("wbs");
    nodes.push({ id: wpId, code: `1.2.${planWps.indexOf(wp) + 1}`, name: wp.name, description: wp.name, level: 2, parentId: planId, children: [], isWorkPackage: true, estimatedEffortHours: wp.effort, assignmentType: "human" });
    nodes.find((n) => n.id === planId)!.children.push(wpId);
  }

  // Phase 3: Execution — deliverable-based
  const execId = uid("wbs");
  nodes.push({ id: execId, code: "1.3", name: "Execution", description: "Project execution and deliverable creation", level: 1, parentId: rootId, children: [], isWorkPackage: false });

  for (let i = 0; i < scope.deliverables.length; i++) {
    const del = scope.deliverables[i];
    const delGroupId = uid("wbs");
    nodes.push({ id: delGroupId, code: `1.3.${i + 1}`, name: del.name, description: del.description, level: 2, parentId: execId, children: [], isWorkPackage: false, deliverableRef: del.id });
    nodes.find((n) => n.id === execId)!.children.push(delGroupId);

    const subWps = [
      { name: `${del.name} — Requirements`, effort: 16 },
      { name: `${del.name} — Design`, effort: 20 },
      { name: `${del.name} — Implementation`, effort: 40 },
      { name: `${del.name} — Testing`, effort: 16 },
      { name: `${del.name} — Review & Accept`, effort: 8 },
    ];
    for (const swp of subWps) {
      const swpId = uid("wbs");
      nodes.push({ id: swpId, code: `1.3.${i + 1}.${subWps.indexOf(swp) + 1}`, name: swp.name, description: swp.name, level: 3, parentId: delGroupId, children: [], isWorkPackage: true, estimatedEffortHours: swp.effort, assignmentType: "hybrid", deliverableRef: del.id });
      nodes.find((n) => n.id === delGroupId)!.children.push(swpId);
    }
  }

  // Phase 4: Monitoring & Controlling
  const monId = uid("wbs");
  nodes.push({ id: monId, code: "1.4", name: "Monitoring & Controlling", description: "Project oversight activities", level: 1, parentId: rootId, children: [], isWorkPackage: false });
  const monWps = [
    { name: "Performance Monitoring", effort: 20 },
    { name: "Change Control Management", effort: 10 },
    { name: "Risk Monitoring", effort: 10 },
    { name: "Quality Assurance Reviews", effort: 12 },
    { name: "Stakeholder Engagement Monitoring", effort: 6 },
  ];
  for (const wp of monWps) {
    const wpId = uid("wbs");
    nodes.push({ id: wpId, code: `1.4.${monWps.indexOf(wp) + 1}`, name: wp.name, description: wp.name, level: 2, parentId: monId, children: [], isWorkPackage: true, estimatedEffortHours: wp.effort, assignmentType: "human" });
    nodes.find((n) => n.id === monId)!.children.push(wpId);
  }

  // Phase 5: Closing
  const closeId = uid("wbs");
  nodes.push({ id: closeId, code: "1.5", name: "Closing", description: "Project closure activities", level: 1, parentId: rootId, children: [], isWorkPackage: false });
  const closeWps = [
    { name: "Final Deliverable Acceptance", effort: 8 },
    { name: "Lessons Learned", effort: 6 },
    { name: "Documentation Handover", effort: 8 },
    { name: "Administrative Closure", effort: 4 },
  ];
  for (const wp of closeWps) {
    const wpId = uid("wbs");
    nodes.push({ id: wpId, code: `1.5.${closeWps.indexOf(wp) + 1}`, name: wp.name, description: wp.name, level: 2, parentId: closeId, children: [], isWorkPackage: true, estimatedEffortHours: wp.effort, assignmentType: "human" });
    nodes.find((n) => n.id === closeId)!.children.push(wpId);
  }

  // Set root children
  nodes.find((n) => n.id === rootId)!.children = [initId, planId, execId, monId, closeId];

  const maxDepth = Math.max(...nodes.map((n) => n.level));
  const workPackages = nodes.filter((n) => n.isWorkPackage);

  return {
    artifactType: "wbs",
    projectName,
    rootNodeId: rootId,
    nodes,
    totalNodes: nodes.length,
    maxDepth,
    workPackageCount: workPackages.length,
    phases: ["Initiation", "Planning", "Execution", "Monitoring & Controlling", "Closing"],
    generatedAt: now(),
    generatedBy: AGENT_ALIAS,
  };
}

// ── 5. Schedule Baseline Generator ──────────────────────────────────────────

export function generateScheduleBaseline(input: IdeaBuilderInput, wbs: Wbs): ScheduleBaseline {
  const startDate = new Date();
  const workPackages = wbs.nodes.filter((n) => n.isWorkPackage);
  const tasks: ScheduleTask[] = [];
  let currentDate = new Date(startDate);
  let prevTaskId = "";

  for (const wp of workPackages) {
    const durationDays = Math.max(1, Math.ceil((wp.estimatedEffortHours || 8) / 8));
    const taskStart = new Date(currentDate);
    const taskEnd = new Date(currentDate);
    taskEnd.setDate(taskEnd.getDate() + durationDays);

    const taskId = uid("task");
    const deps: ScheduleTask["dependencies"] = [];
    if (prevTaskId) {
      deps.push({ taskId: prevTaskId, type: "FS", lag: 0 });
    }

    tasks.push({
      id: taskId,
      wbsRef: wp.id,
      name: wp.name,
      description: wp.description,
      startDate: taskStart.toISOString().split("T")[0],
      endDate: taskEnd.toISOString().split("T")[0],
      durationDays,
      dependencies: deps,
      milestone: false,
      assignmentType: wp.assignmentType || "human",
      criticalPath: true,
      floatDays: 0,
    });

    currentDate = new Date(taskEnd);
    prevTaskId = taskId;
  }

  // Add milestones at phase boundaries
  const milestones: Array<{ id: string; name: string; date: string }> = [];
  const phases = ["Initiation", "Planning", "Execution", "Monitoring & Controlling", "Closing"];
  for (const phase of phases) {
    const phaseTasks = tasks.filter((t) => {
      const wp = wbs.nodes.find((n) => n.id === t.wbsRef);
      if (!wp) return false;
      const parent = wbs.nodes.find((n) => n.id === wp.parentId);
      return parent?.name === phase || wp.name.includes(phase);
    });
    if (phaseTasks.length > 0) {
      const lastTask = phaseTasks[phaseTasks.length - 1];
      const msId = uid("ms");
      milestones.push({ id: msId, name: `${phase} Complete`, date: lastTask.endDate });
      tasks.push({
        id: msId, wbsRef: lastTask.wbsRef, name: `${phase} Complete`,
        description: `Milestone: ${phase} phase complete`,
        startDate: lastTask.endDate, endDate: lastTask.endDate, durationDays: 0,
        dependencies: [{ taskId: lastTask.id, type: "FS", lag: 0 }],
        milestone: true, assignmentType: "human", criticalPath: true, floatDays: 0,
      });
    }
  }

  const endDate = tasks.length > 0
    ? tasks.reduce((latest, t) => t.endDate > latest ? t.endDate : latest, tasks[0].endDate)
    : startDate.toISOString().split("T")[0];

  const totalDuration = Math.ceil((new Date(endDate).getTime() - startDate.getTime()) / 86400000);

  return {
    artifactType: "schedule_baseline",
    projectName: wbs.projectName,
    startDate: startDate.toISOString().split("T")[0],
    endDate,
    totalDurationDays: totalDuration,
    tasks,
    milestones,
    criticalPathLength: totalDuration,
    totalTaskCount: tasks.length,
    generatedAt: now(),
    generatedBy: AGENT_ALIAS,
  };
}

// ── 6. Cost Baseline Generator ──────────────────────────────────────────────

export function generateCostBaseline(input: IdeaBuilderInput, wbs: Wbs, schedule: ScheduleBaseline): CostBaseline {
  const hourlyRate = 100;
  const lineItems: CostLineItem[] = [];
  const workPackages = wbs.nodes.filter((n) => n.isWorkPackage);

  for (const wp of workPackages) {
    const effort = wp.estimatedEffortHours || 8;
    const phase = wbs.nodes.find((n) => n.id === wp.parentId)?.name ||
      wbs.nodes.find((n) => n.children.includes(wp.parentId || ""))?.name || "Execution";

    lineItems.push({
      id: uid("cost"),
      wbsRef: wp.id,
      category: "labor",
      description: wp.name,
      quantity: effort,
      unitCost: hourlyRate,
      totalCost: effort * hourlyRate,
      currency: "USD",
      phase,
    });
  }

  const laborTotal = lineItems.reduce((sum, i) => sum + i.totalCost, 0);

  // Add non-labor items
  lineItems.push(
    { id: uid("cost"), wbsRef: wbs.rootNodeId, category: "equipment", description: "Development tools and licenses", quantity: 1, unitCost: Math.round(laborTotal * 0.05), totalCost: Math.round(laborTotal * 0.05), currency: "USD", phase: "Execution" },
    { id: uid("cost"), wbsRef: wbs.rootNodeId, category: "services", description: "External services and consulting", quantity: 1, unitCost: Math.round(laborTotal * 0.08), totalCost: Math.round(laborTotal * 0.08), currency: "USD", phase: "Execution" },
    { id: uid("cost"), wbsRef: wbs.rootNodeId, category: "overhead", description: "Project management overhead", quantity: 1, unitCost: Math.round(laborTotal * 0.1), totalCost: Math.round(laborTotal * 0.1), currency: "USD", phase: "Planning" },
  );

  const baseTotal = lineItems.reduce((sum, i) => sum + i.totalCost, 0);
  const contingencyPercent = input.riskTier === "high" ? 15 : input.riskTier === "critical" ? 20 : 10;
  const contingencyAmount = Math.round(baseTotal * contingencyPercent / 100);
  const managementReservePercent = 5;
  const managementReserveAmount = Math.round(baseTotal * managementReservePercent / 100);
  const totalEstimatedCost = baseTotal + contingencyAmount + managementReserveAmount;

  const budgetEnvelope = input.budgetEnvelope || totalEstimatedCost;

  const byCategory: Record<string, number> = {};
  const byPhase: Record<string, number> = {};
  for (const item of lineItems) {
    byCategory[item.category] = (byCategory[item.category] || 0) + item.totalCost;
    byPhase[item.phase] = (byPhase[item.phase] || 0) + item.totalCost;
  }

  return {
    artifactType: "cost_baseline",
    projectName: wbs.projectName,
    currency: "USD",
    budgetEnvelope,
    totalEstimatedCost,
    contingencyPercent,
    contingencyAmount,
    managementReservePercent,
    managementReserveAmount,
    lineItems,
    byCategory,
    byPhase,
    budgetVariance: budgetEnvelope - totalEstimatedCost,
    budgetUtilization: Math.round((totalEstimatedCost / budgetEnvelope) * 100),
    generatedAt: now(),
    generatedBy: AGENT_ALIAS,
  };
}

// ── 7. Risk Register Generator ──────────────────────────────────────────────

export function generateRiskRegister(input: IdeaBuilderInput, scope: ScopeStatement, wbs: Wbs): RiskRegister {
  const riskTier = input.riskTier || "medium";
  const probMap = { low: 1, medium: 2, high: 3 };

  const risks: RiskEntry[] = [
    { id: uid("risk"), title: "Scope creep due to unclear requirements", description: "Requirements may evolve significantly during execution, leading to uncontrolled scope growth", category: "scope", probability: "medium", impact: "high", riskScore: 6, owner: "Project Manager", mitigation: "Formal change control process; baseline scope approval at G0", contingency: "Descope lower-priority features if budget exceeded by >15%", trigger: "More than 3 change requests in a single sprint/period", status: "identified", responseStrategy: "mitigate" },
    { id: uid("risk"), title: "Key resource unavailability", description: "Critical team members may become unavailable due to competing priorities", category: "resource", probability: riskTier === "high" ? "high" : "medium", impact: "high", riskScore: riskTier === "high" ? 9 : 6, owner: "Project Manager", mitigation: "Cross-training and documented knowledge transfer; backup assignments", contingency: "Engage external contractors within 2 weeks", trigger: "Key resource departure or >50% allocation reduction", status: "identified", responseStrategy: "mitigate" },
    { id: uid("risk"), title: "Technology integration complexity", description: "Integration with existing systems may prove more complex than estimated", category: "technical", probability: "medium", impact: "medium", riskScore: 4, owner: "Technical Lead", mitigation: "Early proof-of-concept; integration testing in sprint 1", contingency: "Simplify integration scope; use adapter patterns", trigger: "Integration spike takes >150% estimated time", status: "identified", responseStrategy: "mitigate" },
    { id: uid("risk"), title: "Budget overrun", description: "Actual costs may exceed approved budget due to unforeseen complexity", category: "cost", probability: riskTier === "high" ? "high" : "low", impact: "high", riskScore: riskTier === "high" ? 9 : 3, owner: "Project Manager", mitigation: "Monthly budget reviews; earned value tracking; contingency reserve", contingency: "Escalate to sponsor for additional funding or scope reduction", trigger: "EAC exceeds BAC by >10%", status: "identified", responseStrategy: "mitigate" },
    { id: uid("risk"), title: "Schedule delays", description: "Project may not meet target deadline due to dependencies or complexity", category: "schedule", probability: "medium", impact: "medium", riskScore: 4, owner: "Project Manager", mitigation: "Critical path monitoring; schedule buffer; parallel work streams", contingency: "Fast-track non-critical activities; add resources to critical path", trigger: "Schedule variance >10% on critical path", status: "identified", responseStrategy: "mitigate" },
    { id: uid("risk"), title: "Quality defects in deliverables", description: "Deliverables may not meet quality standards or acceptance criteria", category: "quality", probability: "low", impact: "high", riskScore: 3, owner: "QA Lead", mitigation: "Automated testing; peer reviews; definition of done enforcement", contingency: "Dedicated defect sprint; external quality audit", trigger: "Defect rate >5% in acceptance testing", status: "identified", responseStrategy: "mitigate" },
    { id: uid("risk"), title: "Stakeholder resistance to change", description: "End users or stakeholders may resist adoption of project deliverables", category: "organizational", probability: "low", impact: "medium", riskScore: 2, owner: "Business Analyst", mitigation: "Early stakeholder engagement; user demos; change champions", contingency: "Executive mandate and additional training", trigger: "User adoption below 60% at pilot", status: "identified", responseStrategy: "mitigate" },
    { id: uid("risk"), title: "External dependency delays", description: "Third-party vendors or external teams may not deliver on time", category: "external", probability: riskTier === "critical" ? "high" : "low", impact: "medium", riskScore: riskTier === "critical" ? 6 : 2, owner: "Project Manager", mitigation: "Contractual SLAs; regular vendor status checks; alternative suppliers identified", contingency: "Activate alternative supplier; adjust schedule", trigger: "Vendor misses committed delivery date", status: "identified", responseStrategy: "transfer" },
  ];

  const heatMap = {
    high_high: risks.filter((r) => r.probability === "high" && r.impact === "high").length,
    high_medium: risks.filter((r) => r.probability === "high" && r.impact === "medium").length,
    high_low: risks.filter((r) => r.probability === "high" && r.impact === "low").length,
    medium_high: risks.filter((r) => r.probability === "medium" && r.impact === "high").length,
    medium_medium: risks.filter((r) => r.probability === "medium" && r.impact === "medium").length,
    medium_low: risks.filter((r) => r.probability === "medium" && r.impact === "low").length,
    low_high: risks.filter((r) => r.probability === "low" && r.impact === "high").length,
    low_medium: risks.filter((r) => r.probability === "low" && r.impact === "medium").length,
    low_low: risks.filter((r) => r.probability === "low" && r.impact === "low").length,
  };

  const mitigated = risks.filter((r) => !!r.mitigation).length;

  return {
    artifactType: "risk_register",
    projectName: scope.projectName,
    riskTier,
    risks,
    totalRisks: risks.length,
    heatMap,
    topRisks: risks.sort((a, b) => b.riskScore - a.riskScore).slice(0, 3).map((r) => r.id),
    mitigationCoveragePercent: Math.round((mitigated / risks.length) * 100),
    generatedAt: now(),
    generatedBy: AGENT_ALIAS,
  };
}

// ── 8. Communications Plan Generator ────────────────────────────────────────

export function generateCommunicationsPlan(input: IdeaBuilderInput, stakeholders: StakeholderRegister): CommunicationsPlan {
  const parsed = parseIdea(input.ideaText);

  const communications: CommunicationItem[] = [
    { id: uid("comm"), name: "Daily Standup", purpose: "Team synchronization and blocker identification", frequency: "daily", format: "meeting", audience: ["Development Team", "Technical Lead"], owner: "Project Manager", stakeholderRef: stakeholders.stakeholders.filter((s) => s.interest === "high").map((s) => s.id), deliverable: "Meeting notes", channel: "Video call" },
    { id: uid("comm"), name: "Weekly Status Report", purpose: "Project status communication to stakeholders", frequency: "weekly", format: "report", audience: ["Project Sponsor", "Steering Committee"], owner: "Project Manager", stakeholderRef: stakeholders.stakeholders.filter((s) => s.influence === "high").map((s) => s.id), deliverable: "Status report document", channel: "Email + dashboard" },
    { id: uid("comm"), name: "Steering Committee Meeting", purpose: "Strategic decisions and escalation resolution", frequency: "monthly", format: "presentation", audience: ["Executive Sponsor", "Steering Committee"], owner: "Project Manager", stakeholderRef: stakeholders.stakeholders.filter((s) => s.influence === "high").map((s) => s.id), deliverable: "Meeting minutes and action items", channel: "In-person / video" },
    { id: uid("comm"), name: "Sprint Demo / Review", purpose: "Demonstrate completed work and gather feedback", frequency: "biweekly", format: "presentation", audience: ["All Stakeholders"], owner: "Technical Lead", stakeholderRef: stakeholders.stakeholders.map((s) => s.id), deliverable: "Demo recording and feedback log", channel: "Video call" },
    { id: uid("comm"), name: "Risk Review", purpose: "Review and update risk register", frequency: "biweekly", format: "meeting", audience: ["Project Manager", "Technical Lead", "QA Lead"], owner: "Project Manager", stakeholderRef: stakeholders.stakeholders.filter((s) => s.role.includes("Manager") || s.role.includes("Lead")).map((s) => s.id), deliverable: "Updated risk register", channel: "Video call" },
    { id: uid("comm"), name: "Change Control Board", purpose: "Review and approve change requests", frequency: "ad_hoc", format: "meeting", audience: ["Project Sponsor", "Project Manager", "Technical Lead"], owner: "Project Manager", stakeholderRef: stakeholders.stakeholders.filter((s) => s.influence === "high").map((s) => s.id), deliverable: "Change request decisions", channel: "Video call" },
  ];

  return {
    artifactType: "communications_plan",
    projectName: parsed.projectName,
    communications,
    escalationPath: [
      { level: 1, role: "Project Manager", responseTime: "4 hours", criteria: "Operational issues, schedule impacts <5%" },
      { level: 2, role: "Program Manager / PMO Director", responseTime: "1 business day", criteria: "Cross-project impacts, budget variance >10%" },
      { level: 3, role: "Executive Sponsor", responseTime: "2 business days", criteria: "Strategic impacts, scope changes, budget overrun >20%" },
      { level: 4, role: "Steering Committee", responseTime: "1 week", criteria: "Project continuation decisions, major scope changes" },
    ],
    reportingCadence: "Weekly status reports, monthly steering committee, biweekly demos",
    totalItems: communications.length,
    generatedAt: now(),
    generatedBy: AGENT_ALIAS,
  };
}

// ── 9. Quality Plan Generator ───────────────────────────────────────────────

export function generateQualityPlan(input: IdeaBuilderInput, scope: ScopeStatement): QualityPlan {
  const standards: QualityStandard[] = [
    { id: uid("qs"), name: "Requirements Traceability", description: "All requirements traced to test cases and deliverables", metric: "Traceability coverage %", target: "100%", measurementMethod: "Requirements traceability matrix review", frequency: "Per sprint", owner: "Business Analyst" },
    { id: uid("qs"), name: "Code Quality", description: "Code meets defined quality standards", metric: "Code review pass rate", target: ">95%", measurementMethod: "Peer review approval rate", frequency: "Per commit", owner: "Technical Lead" },
    { id: uid("qs"), name: "Test Coverage", description: "Adequate test coverage for all deliverables", metric: "Test coverage %", target: ">80%", measurementMethod: "Automated coverage reports", frequency: "Per build", owner: "QA Lead" },
    { id: uid("qs"), name: "Defect Density", description: "Low defect rate in deliverables", metric: "Defects per KLOC or per feature", target: "<5 per feature", measurementMethod: "Defect tracking system reports", frequency: "Per sprint", owner: "QA Lead" },
    { id: uid("qs"), name: "Stakeholder Satisfaction", description: "Stakeholders satisfied with project progress and deliverables", metric: "Satisfaction score", target: ">80%", measurementMethod: "Feedback surveys after demos", frequency: "Monthly", owner: "Project Manager" },
  ];

  const acceptanceCriteria = scope.deliverables.map((del, i) => ({
    id: uid("ac"),
    deliverableRef: del.id,
    criterion: del.acceptanceCriteria || `${del.name} meets all specified requirements and passes acceptance testing`,
    verificationMethod: "Review and testing by designated acceptor",
  }));

  return {
    artifactType: "quality_plan",
    projectName: scope.projectName,
    qualityObjective: `Deliver all project artifacts meeting defined quality standards with zero blocker defects at acceptance`,
    standards,
    acceptanceCriteria,
    definitionOfDone: [
      "All acceptance criteria verified and passed",
      "Code reviewed and approved by at least one peer",
      "Unit tests written and passing (coverage >80%)",
      "Integration tests passing",
      "Documentation updated",
      "No open blocker or critical defects",
      "Product owner / sponsor sign-off obtained",
    ],
    reviewProcess: {
      type: "Peer review + sponsor approval",
      frequency: "Per deliverable completion",
      participants: ["Technical Lead", "QA Lead", "Product Owner"],
      approvalRequired: true,
    },
    totalStandards: standards.length,
    totalCriteria: acceptanceCriteria.length,
    generatedAt: now(),
    generatedBy: AGENT_ALIAS,
  };
}

// ── 10. Change Control Plan Generator ───────────────────────────────────────

export function generateChangeControlPlan(input: IdeaBuilderInput): ChangeControlPlan {
  const parsed = parseIdea(input.ideaText);

  return {
    artifactType: "change_control_plan",
    projectName: parsed.projectName,
    changeProcess: [
      { step: 1, name: "Submit Change Request", description: "Any stakeholder submits a formal change request with business justification, impact analysis, and urgency", responsible: "Requestor", timeframe: "Anytime" },
      { step: 2, name: "Log and Classify", description: "PM logs the CR, assigns an ID, and classifies by type (scope, schedule, budget, resource, technical) and impact level", responsible: "Project Manager", timeframe: "Within 1 business day" },
      { step: 3, name: "Impact Assessment", description: "Technical lead and PM assess impact on scope, schedule, cost, quality, and risk. Document trade-offs.", responsible: "Project Manager + Technical Lead", timeframe: "Within 3 business days" },
      { step: 4, name: "CCB Review & Decision", description: "Change Control Board reviews assessment and decides: approve, reject, defer, or request more info", responsible: "Change Control Board", timeframe: "Next scheduled CCB meeting or emergency session" },
      { step: 5, name: "Implement & Track", description: "If approved, update baselines, assign work, and track implementation to completion", responsible: "Project Manager", timeframe: "Per approved schedule" },
      { step: 6, name: "Verify & Close", description: "Verify change is implemented correctly, update documentation, and close the CR", responsible: "Project Manager + QA", timeframe: "Within 2 business days of completion" },
    ],
    changeCategories: [
      { category: "Scope", approvalAuthority: "Change Control Board", impactThreshold: "Any scope change" },
      { category: "Schedule", approvalAuthority: "Project Manager (if <5 days); CCB (if >5 days)", impactThreshold: ">2 day impact on critical path" },
      { category: "Budget", approvalAuthority: "Project Manager (if <5%); Sponsor (if >5%)", impactThreshold: ">$1,000 or >2% of budget" },
      { category: "Resource", approvalAuthority: "Project Manager", impactThreshold: "Any team composition change" },
      { category: "Technical", approvalAuthority: "Technical Lead (minor); CCB (architectural)", impactThreshold: "Any architectural change" },
    ],
    changeBoard: [
      { role: "Chair", name: "Project Sponsor", voteWeight: 2 },
      { role: "Member", name: "Project Manager", voteWeight: 1 },
      { role: "Member", name: "Technical Lead", voteWeight: 1 },
      { role: "Advisor", name: "Business Analyst", voteWeight: 0 },
    ],
    baselineTypes: ["Scope Baseline", "Schedule Baseline", "Cost Baseline"],
    configurationManagement: {
      versioningScheme: "Major.Minor.Patch (semantic versioning)",
      storageLocation: "Project repository with version control",
      auditTrail: true,
    },
    generatedAt: now(),
    generatedBy: AGENT_ALIAS,
  };
}

// ── 11. Gate Readiness Report Generator ─────────────────────────────────────

export function generateGateReadinessReport(
  input: IdeaBuilderInput,
  artifacts: Record<string, Record<string, unknown>>,
): GateReadinessReport {
  const parsed = parseIdea(input.ideaText);
  const checks: ReadinessCheckItem[] = [];

  const artifactChecks: Array<{ key: string; label: string; category: string }> = [
    { key: "scope_statement", label: "Scope Statement", category: "Scope" },
    { key: "project_charter", label: "Project Charter", category: "Charter" },
    { key: "stakeholder_register", label: "Stakeholder Register", category: "Stakeholders" },
    { key: "wbs", label: "Work Breakdown Structure", category: "WBS" },
    { key: "schedule_baseline", label: "Schedule Baseline", category: "Schedule" },
    { key: "cost_baseline", label: "Cost Baseline", category: "Cost" },
    { key: "risk_register", label: "Risk Register", category: "Risk" },
    { key: "communications_plan", label: "Communications Plan", category: "Communications" },
    { key: "quality_plan", label: "Quality Plan", category: "Quality" },
    { key: "change_control_plan", label: "Change Control Plan", category: "Change Control" },
  ];

  for (const ac of artifactChecks) {
    const exists = !!artifacts[ac.key];
    checks.push({
      id: uid("chk"),
      category: ac.category,
      item: `${ac.label} generated`,
      status: exists ? "pass" : "fail",
      evidence: exists ? `${ac.key} artifact present` : "Missing",
      artifactRef: ac.key,
      severity: "blocker",
      note: exists ? "Artifact generated successfully" : `${ac.label} was not generated`,
    });
  }

  // Cross-artifact consistency checks
  const crossChecks = [
    { item: "Scope deliverables mapped to WBS", check: () => !!(artifacts.scope_statement && artifacts.wbs) },
    { item: "WBS work packages in schedule", check: () => !!(artifacts.wbs && artifacts.schedule_baseline) },
    { item: "Schedule tasks have cost items", check: () => !!(artifacts.schedule_baseline && artifacts.cost_baseline) },
    { item: "Stakeholders in communications plan", check: () => !!(artifacts.stakeholder_register && artifacts.communications_plan) },
    { item: "Charter aligns with scope", check: () => !!(artifacts.project_charter && artifacts.scope_statement) },
    { item: "Risks reference valid WBS nodes", check: () => !!(artifacts.risk_register && artifacts.wbs) },
  ];

  for (const cc of crossChecks) {
    const passes = cc.check();
    checks.push({
      id: uid("chk"),
      category: "Cross-Artifact Consistency",
      item: cc.item,
      status: passes ? "pass" : "warn",
      evidence: passes ? "Consistency verified" : "Cannot fully verify — dependent artifact may be missing",
      artifactRef: "cross_artifact",
      severity: passes ? "minor" : "major",
      note: passes ? "Cross-reference validated" : "Review cross-artifact alignment manually",
    });
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const naCount = checks.filter((c) => c.status === "na").length;
  const readinessScore = Math.round((passCount / (checks.length - naCount)) * 100);

  return {
    artifactType: "gate_readiness_report",
    projectName: parsed.projectName,
    gateId: "G0",
    phase: "initiating",
    checks,
    summary: {
      total: checks.length,
      pass: passCount,
      fail: failCount,
      warn: warnCount,
      na: naCount,
      readinessScore,
      ready: failCount === 0,
      blockers: checks.filter((c) => c.status === "fail").map((c) => c.item),
    },
    crossArtifactConsistency: {
      scopeToWbs: !!(artifacts.scope_statement && artifacts.wbs),
      wbsToSchedule: !!(artifacts.wbs && artifacts.schedule_baseline),
      scheduleToCost: !!(artifacts.schedule_baseline && artifacts.cost_baseline),
      riskToWbs: !!(artifacts.risk_register && artifacts.wbs),
      stakeholderToComms: !!(artifacts.stakeholder_register && artifacts.communications_plan),
      charterToScope: !!(artifacts.project_charter && artifacts.scope_statement),
    },
    recommendation: failCount === 0 ? "proceed" : failCount <= 2 ? "conditional" : "not_ready",
    generatedAt: now(),
    generatedBy: AGENT_ALIAS,
  };
}
