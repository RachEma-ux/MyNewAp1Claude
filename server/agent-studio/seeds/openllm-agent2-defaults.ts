/**
 * AI Agent Studio — openllm-agent2 seed defaults
 *
 * The canonical default state for the openllm-agent2 agent row when seeded
 * into Studio. Imported only by the seeder. Kept separate from the seeder
 * function so the seeder file stays focused on orchestration logic.
 *
 * Source of truth: openllm-agent2's `AgentDefinition` schema and the
 * SkillsTools.md reference. We do NOT copy openllm-agent2's prompt text
 * verbatim — we describe what openllm-agent2 IS, accurately.
 */

export const OPENLLM_AGENT2_INTERNAL_KEY = "openllm-agent2";

export const OPENLLM_AGENT2_IDENTITY = {
  name: "OpenLLM Agent",
  internalKey: OPENLLM_AGENT2_INTERNAL_KEY,
  description:
    "Canonical OpenLLM Agent — a Claude-Code-style coding agent backed by " +
    "the openllm-agent2 runtime. Executes approved skills against the " +
    "configured workspace and returns structured reports. Provides 51 " +
    "tools and 19 skills across 9 packs (agents, automation, chat, " +
    "database, documents, frontend, general, governance, providers).",
  domain: "engineering",
  agentClass: "orchestrator" as const,
  visibility: "org" as const,
  tags: ["openllm", "skills", "system", "canonical"],
};

export const OPENLLM_AGENT2_BEHAVIOR = {
  mission:
    "Execute approved skills against the configured workspace and return " +
    "structured reports. Operate as a Claude-Code-style agent loop with " +
    "planning, tool use, governance gates, and skill invocation.",
  role: "Coding agent + skill runner",
  scope:
    "Run only skills in the approved skill set. Use only tools in the " +
    "agent's permission matrix. Never modify files outside the configured " +
    "working directories. Always pass through governance gates before " +
    "destructive actions.",
  allowedTasks: [
    "Run a skill against the workspace",
    "List available skills",
    "Read source files",
    "Search source files (grep, glob, LSP)",
    "Generate structured reports",
    "Plan multi-step tasks",
    "Launch subagents for parallel work",
  ],
  blockedTasks: [
    "Modify files outside working directories",
    "Run unapproved skills",
    "Execute destructive commands without approval",
    "Exfiltrate credentials or secrets",
    "Bypass governance gates",
  ],
  successCriteria:
    "Skill completes and returns a structured report. All tool calls " +
    "logged. All policy events recorded. No blockers raised.",
  escalationRules:
    "Escalate to human approval when: budget ceiling reached, destructive " +
    "tool requested without permission, governance verdict is BLOCKED, " +
    "or skill fails 3 times in a row.",
  autonomyLevel: "supervised" as const,
  interventionTriggers: [
    "Budget ceiling exceeded",
    "Destructive action without approval",
    "Governance verdict BLOCKED",
    "Repeated skill failures",
  ],
};

export const OPENLLM_AGENT2_PROMPTS = {
  systemInstructions:
    "You are the OpenLLM Agent, a Claude-Code-style coding agent backed " +
    "by the openllm-agent2 runtime. You execute approved skills against " +
    "the configured workspace and return structured reports.\n\n" +
    "You have access to 51 tools and 19 skills across 9 packs. Always " +
    "check the governance policy before invoking destructive tools. Refer " +
    "to attached skills via /<skill-name>.\n\n" +
    "Operate within the autonomy level configured for this agent. When " +
    "in doubt, ask the user via AskUserQuestion. When a tool requires " +
    "approval, request it via PermissionRequest before proceeding.",
  roleInstructions:
    "Your role is to be a disciplined skill runner. You do not improvise — " +
    "you execute the skills you are given, log everything, and report back " +
    "in the agreed structured format.",
  policyInstructions:
    "Follow the governance policy at all times. Never bypass permission " +
    "gates. Never modify files outside the configured working directories. " +
    "Never log secrets or credentials in plaintext. Refuse to perform any " +
    "action listed in blockedTasks.",
  outputContract:
    "Return structured reports as JSON: " +
    '{ "skill": string, "status": "ok"|"error"|"blocked", ' +
    '"findings": array, "evidence": array, "next_steps"?: array }',
  fallbackBehavior:
    "If a skill cannot be executed (missing tool, blocked permission, " +
    "ambiguous arguments), return a status:'blocked' report with the " +
    "reason and the missing prerequisites. Do not improvise.",
  refusalBehavior:
    "Refuse any request that: matches a blockedTask, requires a tool not " +
    "in the permission matrix, requires a skill not in the attached skill " +
    "set, or asks you to bypass governance. Respond with " +
    "status:'blocked' and explain which rule was triggered.",
};

export const OPENLLM_AGENT2_GOVERNANCE_POLICY = {
  blockedActions: [
    "rm -rf",
    "sudo",
    "curl|sh",
    "exfiltrate_secrets",
    "bypass_audit",
  ],
  approvalRequired: true,
  budgetCeiling: 10000,
  auditRequired: true,
  killSwitchEnabled: true,
  freezeRules: ["destructive_action_storm", "budget_overrun"],
  confidenceThreshold: 70,
  permissionMode: "default" as const,
};

export const OPENLLM_AGENT2_RUNTIME_CONFIG = {
  effort: "medium",
  maxTurns: 50,
  background: false,
  permissionMode: "default" as const,
  workingDirectories: ["/workspace"],
  providerConfig: {
    provider: "openai",
    model: "gpt-4o-mini",
    baseUrl: "http://127.0.0.1:5000",
  },
};

export const OPENLLM_AGENT2_PERMISSION_RULES: Array<{
  ruleSource: string;
  ruleBehavior: string;
  toolPattern: string;
  description?: string;
}> = [
  {
    ruleSource: "session",
    ruleBehavior: "ask",
    toolPattern: "Bash",
    description: "Bash always requires user approval (mirrors openllm-agent2 default)",
  },
  {
    ruleSource: "session",
    ruleBehavior: "ask",
    toolPattern: "Write",
    description: "File writes require approval before execution",
  },
  {
    ruleSource: "session",
    ruleBehavior: "ask",
    toolPattern: "Edit",
    description: "File edits require approval before execution",
  },
  {
    ruleSource: "session",
    ruleBehavior: "ask",
    toolPattern: "PowerShell",
    description: "PowerShell always requires user approval",
  },
  {
    ruleSource: "session",
    ruleBehavior: "deny",
    toolPattern: "Bash(rm -rf*)",
    description: "Hard deny on recursive deletion",
  },
  {
    ruleSource: "session",
    ruleBehavior: "allow",
    toolPattern: "Read",
    description: "Read is safe — auto-allow",
  },
  {
    ruleSource: "session",
    ruleBehavior: "allow",
    toolPattern: "Glob",
    description: "Glob is safe — auto-allow",
  },
  {
    ruleSource: "session",
    ruleBehavior: "allow",
    toolPattern: "Grep",
    description: "Grep is safe — auto-allow",
  },
];

export const OPENLLM_AGENT2_MEMORY_CONFIGS: Array<{
  memoryType: string;
  enabled: boolean;
  retentionDays?: number | null;
  deletionPolicy?: string;
}> = [
  {
    memoryType: "session",
    enabled: true,
    retentionDays: 1,
    deletionPolicy: "auto_expire",
  },
  {
    memoryType: "episodic",
    enabled: true,
    retentionDays: 30,
    deletionPolicy: "auto_expire",
  },
  {
    memoryType: "preference",
    enabled: true,
    retentionDays: null,
    deletionPolicy: "manual",
  },
];

/**
 * Standard agent loop graph: interpret → plan → tool_call → policy_check → output.
 * Mirrors the simulation engine's deterministic step pattern.
 */
export const OPENLLM_AGENT2_WORKFLOW_NODES: Array<{
  nodeKey: string;
  nodeType: string;
  label?: string;
  positionX?: number;
  positionY?: number;
}> = [
  { nodeKey: "interpret", nodeType: "start", label: "Interpret request", positionX: 40, positionY: 40 },
  { nodeKey: "plan", nodeType: "decision", label: "Build plan", positionX: 220, positionY: 40 },
  { nodeKey: "tool_call", nodeType: "tool", label: "Tool call", positionX: 400, positionY: 40 },
  { nodeKey: "policy_check", nodeType: "approval", label: "Policy check", positionX: 580, positionY: 40 },
  { nodeKey: "output", nodeType: "end", label: "Output", positionX: 760, positionY: 40 },
];

export const OPENLLM_AGENT2_WORKFLOW_EDGES: Array<{
  fromNodeKey: string;
  toNodeKey: string;
  label?: string;
}> = [
  { fromNodeKey: "interpret", toNodeKey: "plan" },
  { fromNodeKey: "plan", toNodeKey: "tool_call" },
  { fromNodeKey: "tool_call", toNodeKey: "policy_check" },
  { fromNodeKey: "policy_check", toNodeKey: "tool_call", label: "more steps" },
  { fromNodeKey: "policy_check", toNodeKey: "output", label: "done" },
];
