/**
 * PM Method Packs — Operational Method Configuration
 *
 * Each MethodPack defines how a methodology shapes the PMI wizard:
 *   - Workflow states, ceremonies, metrics
 *   - Required/optional artifacts
 *   - Planning form adaptations (labels, requirements)
 *   - Sidebar view emphasis
 *   - Automations
 *
 * PMI governance (G0–G4 gates, charter, baselines) remains mandatory
 * regardless of method. Packs configure *how* PMI is implemented.
 */

// ── MethodPack interface ────────────────────────────────────────────────────

export interface MethodPack {
  id: string;                     // matches MethodDefinition.id
  methodName: string;
  deliveryApproach: "predictive" | "agile" | "hybrid";
  category?: string;              // "lean", "predictive", "agile", etc.
  leanMode?: "kanban" | "value_stream" | "small_project";
  constraints?: {
    maxDurationDays?: number;
    maxBudgetAmount?: number;
    allowedRiskTiers?: string[];
  };

  workflow: {
    taskStates: string[];
    defaultState: string;
  };

  requiredArtifacts: string[];    // must exist for G1
  optionalArtifacts: string[];

  primaryViews: string[];         // sidebar tools emphasized
  hiddenViews: string[];          // de-emphasized (not removed)

  ceremonies: Array<{ name: string; cadence: string; description: string }>;

  metrics: Array<{ name: string; type: string; enabled: boolean }>;

  planningAdaptations: {
    scopeLabel: string;           // "WBS" vs "Product Backlog"
    scheduleLabel: string;        // "Gantt Schedule" vs "Release Roadmap"
    scopeDescription: string;
    scheduleDescription: string;
    sprintCadenceDefault?: number;
    wbsRequired: boolean;
    ganttRequired: boolean;
  };

  automations: Array<{ name: string; trigger: string; action: string }>;
}

// ── DEFAULT_PACK — Generic PMI behavior ─────────────────────────────────────

export const DEFAULT_PACK: MethodPack = {
  id: "default",
  methodName: "Generic PMI",
  deliveryApproach: "hybrid",

  workflow: {
    taskStates: ["todo", "in_progress", "review", "done"],
    defaultState: "todo",
  },

  requiredArtifacts: [
    "scope_baseline", "schedule_baseline", "cost_baseline",
    "quality_plan", "risk_register", "communications_plan",
    "resource_plan", "engagement_plan",
  ],
  optionalArtifacts: ["procurement_plan"],

  primaryViews: ["dashboard", "tasks", "gantt", "risks", "budget"],
  hiddenViews: [],

  ceremonies: [
    { name: "Status Meeting", cadence: "Weekly", description: "Regular project status review with team" },
    { name: "Steering Committee", cadence: "Bi-weekly", description: "Governance review with stakeholders" },
    { name: "Gate Review", cadence: "Per gate", description: "Formal gate evaluation (G0–G4)" },
  ],

  metrics: [
    { name: "Schedule Variance (SV)", type: "evm", enabled: true },
    { name: "Cost Variance (CV)", type: "evm", enabled: true },
    { name: "Risk Exposure", type: "risk", enabled: true },
    { name: "Milestone Progress", type: "progress", enabled: true },
  ],

  planningAdaptations: {
    scopeLabel: "Scope Plan & WBS",
    scheduleLabel: "Schedule Plan",
    scopeDescription: "Build WBS tree, map deliverables to WBS nodes. Produces scope baseline.",
    scheduleDescription: "Task network, dependencies, milestones, timeline. Produces schedule baseline.",
    wbsRequired: true,
    ganttRequired: true,
  },

  automations: [],
};

// ── Waterfall Pack ──────────────────────────────────────────────────────────

const WATERFALL_PACK: MethodPack = {
  id: "waterfall",
  methodName: "Waterfall",
  deliveryApproach: "predictive",

  workflow: {
    taskStates: ["requirements", "design", "implementation", "testing", "deployment", "done"],
    defaultState: "requirements",
  },

  requiredArtifacts: [
    "scope_baseline", "schedule_baseline", "cost_baseline",
    "quality_plan", "risk_register", "communications_plan",
    "resource_plan", "engagement_plan",
  ],
  optionalArtifacts: ["procurement_plan", "change_log"],

  primaryViews: ["dashboard", "gantt", "wbs", "budget", "risks"],
  hiddenViews: ["kanban", "sprints"],

  ceremonies: [
    { name: "Phase Gate Review", cadence: "End of each phase", description: "Formal review before entering next phase" },
    { name: "Status Report", cadence: "Weekly", description: "Written status report to stakeholders" },
    { name: "Change Control Board", cadence: "As needed", description: "Evaluate and approve scope/schedule changes" },
  ],

  metrics: [
    { name: "Schedule Variance (SV)", type: "evm", enabled: true },
    { name: "Cost Variance (CV)", type: "evm", enabled: true },
    { name: "Schedule Performance Index (SPI)", type: "evm", enabled: true },
    { name: "Cost Performance Index (CPI)", type: "evm", enabled: true },
    { name: "Milestone Completion %", type: "progress", enabled: true },
    { name: "Defect Density", type: "quality", enabled: true },
  ],

  planningAdaptations: {
    scopeLabel: "WBS (Work Breakdown Structure)",
    scheduleLabel: "Gantt Schedule",
    scopeDescription: "Full hierarchical WBS with deliverable mapping. Each work package traceable to requirements.",
    scheduleDescription: "Task-by-task Gantt chart with dependencies, critical path, and milestones.",
    wbsRequired: true,
    ganttRequired: true,
  },

  automations: [
    { name: "Phase completion", trigger: "All tasks in phase done", action: "Notify PM for gate review" },
    { name: "Milestone alert", trigger: "Milestone date approaching (7d)", action: "Send stakeholder reminder" },
  ],
};

// ── Scrum Pack ──────────────────────────────────────────────────────────────

const SCRUM_PACK: MethodPack = {
  id: "scrum",
  methodName: "Scrum",
  deliveryApproach: "agile",

  workflow: {
    taskStates: ["backlog", "selected", "in_progress", "review", "done"],
    defaultState: "backlog",
  },

  requiredArtifacts: [
    "scope_baseline", "cost_baseline",
    "quality_plan", "risk_register", "communications_plan",
    "resource_plan", "engagement_plan",
  ],
  optionalArtifacts: ["schedule_baseline", "procurement_plan"],

  primaryViews: ["dashboard", "kanban", "sprints", "backlog", "burndown"],
  hiddenViews: ["gantt", "wbs"],

  ceremonies: [
    { name: "Sprint Planning", cadence: "Start of each sprint", description: "Select backlog items, define sprint goal, estimate effort" },
    { name: "Daily Standup", cadence: "Daily (15 min)", description: "What I did, what I'll do, blockers" },
    { name: "Sprint Review", cadence: "End of each sprint", description: "Demo completed work to stakeholders" },
    { name: "Sprint Retrospective", cadence: "End of each sprint", description: "Team reflection — what went well, what to improve" },
    { name: "Backlog Refinement", cadence: "Weekly / as needed", description: "Groom and estimate upcoming backlog items" },
  ],

  metrics: [
    { name: "Sprint Velocity", type: "agile", enabled: true },
    { name: "Sprint Burndown", type: "agile", enabled: true },
    { name: "Release Burnup", type: "agile", enabled: true },
    { name: "Sprint Goal Success Rate", type: "agile", enabled: true },
    { name: "Cycle Time", type: "flow", enabled: false },
    { name: "Risk Exposure", type: "risk", enabled: true },
  ],

  planningAdaptations: {
    scopeLabel: "Product Backlog",
    scheduleLabel: "Release Roadmap",
    scopeDescription: "Prioritized product backlog with user stories, acceptance criteria, and story points.",
    scheduleDescription: "Sprint cadence configuration and release roadmap with target dates.",
    sprintCadenceDefault: 14,
    wbsRequired: false,
    ganttRequired: false,
  },

  automations: [
    { name: "Sprint auto-close", trigger: "Sprint end date reached", action: "Move incomplete items back to backlog" },
    { name: "Velocity tracking", trigger: "Sprint closed", action: "Update velocity metrics" },
    { name: "Standup reminder", trigger: "Daily at 9:00", action: "Send standup reminder to team" },
  ],
};

// ── Kanban Pack ──────────────────────────────────────────────────────────────

const KANBAN_PACK: MethodPack = {
  id: "kanban",
  methodName: "Kanban",
  deliveryApproach: "agile",

  workflow: {
    taskStates: ["backlog", "ready", "in_progress", "review", "done"],
    defaultState: "backlog",
  },

  requiredArtifacts: [
    "scope_baseline", "cost_baseline",
    "quality_plan", "risk_register", "communications_plan",
    "resource_plan", "engagement_plan",
  ],
  optionalArtifacts: ["schedule_baseline", "procurement_plan"],

  primaryViews: ["dashboard", "kanban", "cumulative-flow", "lead-time"],
  hiddenViews: ["gantt", "wbs", "sprints"],

  ceremonies: [
    { name: "Replenishment Meeting", cadence: "Weekly", description: "Pull new items into ready column based on capacity" },
    { name: "Delivery Cadence Review", cadence: "Bi-weekly", description: "Review delivered items and cycle times" },
    { name: "Service Delivery Review", cadence: "Monthly", description: "Analyze flow metrics, identify improvement areas" },
  ],

  metrics: [
    { name: "Lead Time", type: "flow", enabled: true },
    { name: "Cycle Time", type: "flow", enabled: true },
    { name: "Throughput", type: "flow", enabled: true },
    { name: "WIP Count", type: "flow", enabled: true },
    { name: "Cumulative Flow", type: "flow", enabled: true },
    { name: "Blocked Items", type: "flow", enabled: true },
  ],

  planningAdaptations: {
    scopeLabel: "Work Item Backlog",
    scheduleLabel: "Flow Targets",
    scopeDescription: "Prioritized work item backlog with service classes and WIP limits per column.",
    scheduleDescription: "Target lead times by service class. No fixed timeline — continuous flow delivery.",
    wbsRequired: false,
    ganttRequired: false,
  },

  automations: [
    { name: "WIP limit alert", trigger: "Column WIP exceeds limit", action: "Notify team lead" },
    { name: "Aging alert", trigger: "Item in column > 5 days", action: "Flag as blocked" },
    { name: "Throughput report", trigger: "Weekly", action: "Generate throughput chart" },
  ],
};

// ── SAFe Pack ───────────────────────────────────────────────────────────────

const SAFE_PACK: MethodPack = {
  id: "safe",
  methodName: "SAFe (Scaled Agile Framework)",
  deliveryApproach: "hybrid",

  workflow: {
    taskStates: ["funnel", "analyzing", "backlog", "implementing", "validating", "done"],
    defaultState: "funnel",
  },

  requiredArtifacts: [
    "scope_baseline", "schedule_baseline", "cost_baseline",
    "quality_plan", "risk_register", "communications_plan",
    "resource_plan", "engagement_plan",
  ],
  optionalArtifacts: ["procurement_plan", "pi_objectives"],

  primaryViews: ["dashboard", "kanban", "sprints", "roadmap", "risks", "program-board"],
  hiddenViews: [],

  ceremonies: [
    { name: "PI Planning", cadence: "Every 8–12 weeks", description: "Program Increment planning event — align teams on objectives" },
    { name: "Sprint Planning", cadence: "Start of each sprint", description: "Team-level sprint planning within PI" },
    { name: "Daily Standup", cadence: "Daily (15 min)", description: "Team synchronization" },
    { name: "System Demo", cadence: "End of each sprint", description: "Integrated demo across teams" },
    { name: "Inspect & Adapt", cadence: "End of each PI", description: "PI retrospective and improvement planning" },
    { name: "Scrum of Scrums", cadence: "2–3x per week", description: "Cross-team coordination" },
  ],

  metrics: [
    { name: "PI Predictability", type: "safe", enabled: true },
    { name: "Feature Cycle Time", type: "flow", enabled: true },
    { name: "Sprint Velocity (per team)", type: "agile", enabled: true },
    { name: "Program Velocity", type: "safe", enabled: true },
    { name: "Release Progress", type: "progress", enabled: true },
    { name: "Risk Exposure", type: "risk", enabled: true },
  ],

  planningAdaptations: {
    scopeLabel: "Program Backlog & Features",
    scheduleLabel: "PI Roadmap",
    scopeDescription: "Epics and features prioritized by WSJF (Weighted Shortest Job First). Team backlogs derived from features.",
    scheduleDescription: "Program Increment timeline with PI objectives, sprint cadence, and cross-team milestones.",
    sprintCadenceDefault: 14,
    wbsRequired: false,
    ganttRequired: true,
  },

  automations: [
    { name: "PI boundary", trigger: "PI end date reached", action: "Trigger Inspect & Adapt session" },
    { name: "WSJF recalculation", trigger: "Feature updated", action: "Recalculate WSJF priority" },
    { name: "Cross-team dependency alert", trigger: "Dependency at risk", action: "Notify both teams" },
  ],
};

// ── PRINCE2 Pack ────────────────────────────────────────────────────────────

const PRINCE2_PACK: MethodPack = {
  id: "prince2",
  methodName: "PRINCE2",
  deliveryApproach: "predictive",

  workflow: {
    taskStates: ["starting_up", "initiating", "controlling", "delivering", "closing", "done"],
    defaultState: "starting_up",
  },

  requiredArtifacts: [
    "scope_baseline", "schedule_baseline", "cost_baseline",
    "quality_plan", "risk_register", "communications_plan",
    "resource_plan", "engagement_plan",
  ],
  optionalArtifacts: ["procurement_plan", "lessons_log", "issue_register"],

  primaryViews: ["dashboard", "stages", "gantt", "risks", "issues", "budget"],
  hiddenViews: ["kanban", "sprints"],

  ceremonies: [
    { name: "Stage Gate Review", cadence: "End of each stage", description: "Project Board evaluates stage completion and authorizes next stage" },
    { name: "Highlight Report", cadence: "Per tolerance cycle", description: "PM reports stage status to Project Board" },
    { name: "Checkpoint Report", cadence: "Per work package", description: "Team Manager reports work package progress" },
    { name: "End Stage Assessment", cadence: "End of each stage", description: "Review stage performance and plan next stage" },
    { name: "Lessons Review", cadence: "End of each stage + closure", description: "Capture and record lessons learned" },
  ],

  metrics: [
    { name: "Stage Tolerance (time)", type: "prince2", enabled: true },
    { name: "Stage Tolerance (cost)", type: "prince2", enabled: true },
    { name: "Issue Count", type: "quality", enabled: true },
    { name: "Risk Exposure", type: "risk", enabled: true },
    { name: "Benefits Delivery", type: "prince2", enabled: true },
    { name: "Quality Review Defects", type: "quality", enabled: true },
  ],

  planningAdaptations: {
    scopeLabel: "Product Breakdown Structure (PBS)",
    scheduleLabel: "Stage Plan",
    scopeDescription: "Product Breakdown Structure with product descriptions and quality criteria for each product.",
    scheduleDescription: "Stage-level plan with management products, work packages, and stage boundaries.",
    wbsRequired: true,
    ganttRequired: true,
  },

  automations: [
    { name: "Tolerance breach", trigger: "Stage tolerance exceeded", action: "Escalate to Project Board (Exception Report)" },
    { name: "Stage boundary", trigger: "All stage work packages complete", action: "Trigger End Stage Assessment" },
    { name: "Issue escalation", trigger: "Issue exceeds PM authority", action: "Escalate to Project Board" },
  ],
};

// ── Agile-Waterfall Hybrid Pack ─────────────────────────────────────────────

const AGILE_WATERFALL_PACK: MethodPack = {
  id: "agile-waterfall",
  methodName: "Agile-Waterfall Hybrid",
  deliveryApproach: "hybrid",

  workflow: {
    taskStates: ["backlog", "analysis", "in_progress", "review", "testing", "done"],
    defaultState: "backlog",
  },

  requiredArtifacts: [
    "scope_baseline", "schedule_baseline", "cost_baseline",
    "quality_plan", "risk_register", "communications_plan",
    "resource_plan", "engagement_plan",
  ],
  optionalArtifacts: ["procurement_plan"],

  primaryViews: ["dashboard", "kanban", "gantt", "sprints", "risks", "budget"],
  hiddenViews: [],

  ceremonies: [
    { name: "Phase Gate Review", cadence: "End of predictive phases", description: "Formal review at requirements/design/closure gates" },
    { name: "Sprint Planning", cadence: "Start of each sprint (execution)", description: "Plan iteration work during agile execution phase" },
    { name: "Sprint Review", cadence: "End of each sprint", description: "Demo iteration deliverables to stakeholders" },
    { name: "Sprint Retrospective", cadence: "End of each sprint", description: "Team reflection and process improvement" },
    { name: "Status Report", cadence: "Weekly", description: "Combined status across predictive + agile phases" },
  ],

  metrics: [
    { name: "Milestone Completion %", type: "progress", enabled: true },
    { name: "Sprint Velocity", type: "agile", enabled: true },
    { name: "Schedule Variance (SV)", type: "evm", enabled: true },
    { name: "Cost Variance (CV)", type: "evm", enabled: true },
    { name: "Sprint Burndown", type: "agile", enabled: true },
    { name: "Risk Exposure", type: "risk", enabled: true },
  ],

  planningAdaptations: {
    scopeLabel: "Hybrid Scope (WBS + Backlog)",
    scheduleLabel: "Phase Timeline + Sprint Cadence",
    scopeDescription: "WBS for predictive phases (requirements, design) combined with product backlog for agile execution.",
    scheduleDescription: "Gantt-level milestones for phase gates plus sprint cadence for iterative delivery.",
    sprintCadenceDefault: 14,
    wbsRequired: true,
    ganttRequired: true,
  },

  automations: [
    { name: "Phase transition", trigger: "Phase gate passed", action: "Switch from predictive to agile mode" },
    { name: "Sprint auto-close", trigger: "Sprint end date reached", action: "Move incomplete items back to backlog" },
    { name: "Combined status", trigger: "Weekly", action: "Generate combined phase + sprint status report" },
  ],
};

// ── Lean Kanban Pack ────────────────────────────────────────────────────────

const LEAN_KANBAN_PACK: MethodPack = {
  id: "lean-kanban",
  methodName: "Lean — Kanban Execution",
  deliveryApproach: "agile",
  category: "lean",
  leanMode: "kanban",

  workflow: {
    taskStates: ["backlog", "ready", "in_progress", "review", "done"],
    defaultState: "backlog",
  },

  requiredArtifacts: [
    "flow_policy", "kanban_board_config", "service_level_expectation",
    "budget_guardrails", "risk_register", "communications_plan",
    "quality_plan", "resource_plan", "engagement_plan",
  ],
  optionalArtifacts: ["procurement_plan"],

  primaryViews: ["dashboard", "kanban", "cumulative-flow", "lead-time"],
  hiddenViews: ["gantt", "wbs", "sprints"],

  ceremonies: [
    { name: "Replenishment Meeting", cadence: "Weekly", description: "Pull new items into ready column based on capacity" },
    { name: "Delivery Cadence Review", cadence: "Bi-weekly", description: "Review delivered items and cycle times" },
    { name: "Service Delivery Review", cadence: "Monthly", description: "Analyze flow metrics, identify improvement areas" },
  ],

  metrics: [
    { name: "Lead Time", type: "flow", enabled: true },
    { name: "Cycle Time", type: "flow", enabled: true },
    { name: "Throughput", type: "flow", enabled: true },
    { name: "WIP Trend", type: "flow", enabled: true },
    { name: "Cumulative Flow", type: "flow", enabled: true },
  ],

  planningAdaptations: {
    scopeLabel: "Flow Backlog",
    scheduleLabel: "Flow Targets",
    scopeDescription: "Prioritized flow backlog with WIP limits and service-level expectations. No WBS required.",
    scheduleDescription: "Target lead times by service class. Continuous flow delivery — no fixed timeline.",
    wbsRequired: false,
    ganttRequired: false,
  },

  automations: [
    { name: "WIP limit alert", trigger: "Column WIP exceeds limit", action: "Notify team lead" },
    { name: "Aging alert", trigger: "Item in column > 5 days", action: "Flag as blocked" },
    { name: "Throughput report", trigger: "Weekly", action: "Generate throughput chart" },
  ],
};

// ── Lean Value Stream Pack ─────────────────────────────────────────────────

const LEAN_VALUE_STREAM_PACK: MethodPack = {
  id: "lean-value-stream",
  methodName: "Lean — Value Stream Management",
  deliveryApproach: "agile",
  category: "lean",
  leanMode: "value_stream",

  workflow: {
    taskStates: ["intake", "ready", "in_progress", "validation", "done"],
    defaultState: "intake",
  },

  requiredArtifacts: [
    "flow_policy", "kanban_board_config", "service_level_expectation",
    "budget_guardrails", "risk_register", "communications_plan",
    "quality_plan", "resource_plan", "engagement_plan",
    "value_stream_map", "capacity_model", "bottleneck_register",
  ],
  optionalArtifacts: ["procurement_plan"],

  primaryViews: ["dashboard", "kanban", "value-stream", "cumulative-flow", "capacity"],
  hiddenViews: ["gantt", "wbs", "sprints"],

  ceremonies: [
    { name: "Replenishment Meeting", cadence: "Weekly", description: "Pull new items into ready column based on capacity" },
    { name: "Delivery Cadence Review", cadence: "Bi-weekly", description: "Review delivered items and cycle times" },
    { name: "Service Delivery Review", cadence: "Monthly", description: "Analyze flow metrics, identify improvement areas" },
    { name: "Bottleneck Review", cadence: "Bi-weekly", description: "Identify and resolve value-stream bottlenecks" },
    { name: "Capacity Planning", cadence: "Monthly", description: "Model capacity and forecast throughput" },
  ],

  metrics: [
    { name: "Lead Time", type: "flow", enabled: true },
    { name: "Cycle Time", type: "flow", enabled: true },
    { name: "Throughput", type: "flow", enabled: true },
    { name: "WIP Trend", type: "flow", enabled: true },
    { name: "Cumulative Flow", type: "flow", enabled: true },
    { name: "Flow Efficiency", type: "flow", enabled: true },
    { name: "Predictability Index", type: "flow", enabled: true },
  ],

  planningAdaptations: {
    scopeLabel: "Value Stream Backlog",
    scheduleLabel: "Value Stream Targets",
    scopeDescription: "Value-stream-mapped backlog with bottleneck register and capacity model. Enterprise Lean planning.",
    scheduleDescription: "Capacity-modeled targets with flow efficiency thresholds. Bottleneck-aware scheduling.",
    wbsRequired: false,
    ganttRequired: false,
  },

  automations: [
    { name: "WIP limit alert", trigger: "Column WIP exceeds limit", action: "Notify team lead" },
    { name: "Bottleneck detection", trigger: "Stage wait time > threshold", action: "Flag bottleneck in register" },
    { name: "Capacity forecast", trigger: "Monthly", action: "Generate capacity model update" },
    { name: "Flow efficiency alert", trigger: "Flow efficiency < 15%", action: "Escalate to value stream manager" },
  ],
};

// ── Lean Small Project Pack ────────────────────────────────────────────────

const LEAN_SMALL_PROJECT_PACK: MethodPack = {
  id: "lean-small-project",
  methodName: "Lean — Small Project",
  deliveryApproach: "agile",
  category: "lean",
  leanMode: "small_project",
  constraints: {
    maxDurationDays: 30,
    maxBudgetAmount: 20000,
    allowedRiskTiers: ["low", "medium"],
  },

  workflow: {
    taskStates: ["todo", "doing", "done"],
    defaultState: "todo",
  },

  requiredArtifacts: [
    "risk_register", "communications_plan", "quality_plan",
    "resource_plan", "engagement_plan", "budget_guardrails",
  ],
  optionalArtifacts: [],

  primaryViews: ["dashboard", "kanban"],
  hiddenViews: ["gantt", "wbs", "sprints", "cumulative-flow", "value-stream"],

  ceremonies: [
    { name: "Status Check", cadence: "Weekly (15 min)", description: "Lightweight team status and blocker review" },
    { name: "Completion Review", cadence: "At closure", description: "Final review of deliverables and lessons learned" },
  ],

  metrics: [
    { name: "Cycle Time", type: "flow", enabled: true },
    { name: "Throughput", type: "flow", enabled: true },
    { name: "Overdue Items", type: "progress", enabled: true },
  ],

  planningAdaptations: {
    scopeLabel: "Simplified Scope",
    scheduleLabel: "Milestone Targets",
    scopeDescription: "Lightweight scope definition. No WBS — just deliverables and acceptance criteria.",
    scheduleDescription: "Simple milestone targets within the 30-day constraint. No Gantt required.",
    wbsRequired: false,
    ganttRequired: false,
  },

  automations: [
    { name: "Budget alert", trigger: "Spend > 80% of budget cap", action: "Notify PM" },
    { name: "Duration alert", trigger: "5 days before deadline", action: "Send closure reminder" },
    { name: "Overdue alert", trigger: "Item overdue > 2 days", action: "Flag in dashboard" },
  ],
};

// ── Lean sub-packs export ───────────────────────────────────────────────────

export const LEAN_SUB_PACKS = [LEAN_KANBAN_PACK, LEAN_VALUE_STREAM_PACK, LEAN_SMALL_PROJECT_PACK];

// ── Pack registry ───────────────────────────────────────────────────────────

export const ALL_METHOD_PACKS: MethodPack[] = [
  WATERFALL_PACK,
  SCRUM_PACK,
  KANBAN_PACK,
  SAFE_PACK,
  PRINCE2_PACK,
  AGILE_WATERFALL_PACK,
  LEAN_KANBAN_PACK,
  LEAN_VALUE_STREAM_PACK,
  LEAN_SMALL_PROJECT_PACK,
];

const PACK_MAP = new Map<string, MethodPack>(
  ALL_METHOD_PACKS.map((p) => [p.id, p]),
);

/** Get the method pack for a given method ID. Returns DEFAULT_PACK if no specialized pack exists. */
export function getMethodPack(methodId: string | undefined | null): MethodPack {
  if (!methodId) return DEFAULT_PACK;
  return PACK_MAP.get(methodId) || DEFAULT_PACK;
}

/** Check if a method has a specialized pack */
export function hasMethodPack(methodId: string): boolean {
  return PACK_MAP.has(methodId);
}

/** IDs of methods that have operational packs */
export const METHOD_PACK_IDS = ALL_METHOD_PACKS.map((p) => p.id);
