/**
 * AI Agent Studio — Zod Input Schemas
 *
 * Validation schemas for tRPC procedures.
 */

import { z } from "zod";
import {
  AGS_AGENT_CLASSES,
  AGS_AUTONOMY_LEVELS,
  AGS_ENVIRONMENTS,
  AGS_HOOK_EVENTS,
  AGS_LIFECYCLE_STATES,
  AGS_MCP_TRANSPORTS,
  AGS_MEMORY_SCOPES,
  AGS_MEMORY_TYPES,
  AGS_PERMISSION_BEHAVIORS,
  AGS_PERMISSION_MODES,
  AGS_PERMISSION_SOURCES,
  AGS_PLUGIN_TYPES,
  AGS_VISIBILITIES,
} from "./constants";

export const agentIdSchema = z.object({
  agentId: z.number().int().positive(),
});

export const draftIdSchema = z.object({
  draftId: z.number().int().positive(),
});

export const listAgentsSchema = z
  .object({
    state: z.enum(AGS_LIFECYCLE_STATES).optional(),
    ownerId: z.number().int().positive().optional(),
    search: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .default({ limit: 100 });

// ── Creation ────────────────────────────────────────────────────────────────

export const createBlankAgentSchema = z.object({
  name: z.string().min(1).max(200),
  internalKey: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9_-]+$/, "internal key must be lowercase, digits, _ or -"),
  description: z.string().optional(),
  agentClass: z.enum(AGS_AGENT_CLASSES).default("assistant"),
  visibility: z.enum(AGS_VISIBILITIES).default("private"),
});

export const createFromTemplateSchema = z.object({
  templateKey: z.string().min(1),
  name: z.string().min(1).max(200),
  internalKey: z.string().min(2).max(120),
});

export const importDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  internalKey: z.string().min(2).max(120),
  definition: z.record(z.string(), z.any()),
});

// Phase 2: clone-as-template — copies an existing agent's full state into
// a brand-new draft agent. Internal key must be unique; name is the user's
// label for the new agent.
export const cloneAgentSchema = z.object({
  sourceAgentId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  internalKey: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9_-]+$/, "internal key must be lowercase, digits, _ or -"),
  description: z.string().optional(),
});

// Phase 3: interactive permission requests — list pending and decide.
export const listPendingPermissionRequestsSchema = z.object({
  runtimeRunId: z.number().int().positive(),
});

export const decidePermissionRequestSchema = z.object({
  requestId: z.number().int().positive(),
  allowed: z.boolean(),
  reason: z.string().optional(),
});

// Phase 6: slash command execution against a live runtime run.
export const executeSlashCommandSchema = z.object({
  runtimeRunId: z.number().int().positive(),
  // Limit raw input length to prevent abuse — long inputs aren't valid
  // slash commands anyway.
  rawInput: z.string().min(1).max(500),
});

// Phase 10: schedule config CRUD. The scheduler ticks every minute and
// fires runSimulation when the cron matches.
export const setScheduleConfigSchema = z.object({
  agentId: z.number().int().positive(),
  enabled: z.boolean(),
  cron: z
    .string()
    .min(1)
    .max(120)
    .refine((s) => s.trim().split(/\s+/).length === 5, {
      message: "cron expression must be 5 fields",
    }),
  timezone: z.string().max(64).default("UTC"),
  payload: z.record(z.string(), z.any()).optional(),
});

// Phase 11: resume / compact prior runs.
export const resumeRunSchema = z.object({
  sourceRunId: z.number().int().positive(),
  newInput: z.string().min(1).max(10_000),
});

export const compactRunSchema = z.object({
  sourceRunId: z.number().int().positive(),
});

// Phase 8: subagent invocation. The runs page surfaces a "spawn child"
// button on a parent run for manual testing; the live runtime path will
// also call this when the agent loop emits a Task tool call.
export const invokeSubagentSchema = z.object({
  parentRunId: z.number().int().positive(),
  subagentName: z.string().min(1).max(200),
  input: z.string().min(1).max(10_000),
});

export const getRunTreeSchema = z.object({
  runId: z.number().int().positive(),
});

// Phase 9: plugin loader — validate a plugin path before enabling, and
// load the merged contributions for a draft.
export const validatePluginSchema = z.object({
  agentId: z.number().int().positive(),
  path: z.string().min(1).max(500),
});

// ── Identity ────────────────────────────────────────────────────────────────

export const updateIdentitySchema = z.object({
  agentId: z.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  ownerId: z.number().int().positive().nullable().optional(),
  domain: z.string().max(120).nullable().optional(),
  tags: z.array(z.string()).optional(),
  agentClass: z.enum(AGS_AGENT_CLASSES).optional(),
  visibility: z.enum(AGS_VISIBILITIES).optional(),
  supportedEnvironments: z.array(z.enum(AGS_ENVIRONMENTS)).optional(),
  lifecycleState: z.enum(AGS_LIFECYCLE_STATES).optional(),
});

// ── Behavior ────────────────────────────────────────────────────────────────

export const updateBehaviorSchema = z.object({
  agentId: z.number().int().positive(),
  mission: z.string().optional(),
  role: z.string().optional(),
  scope: z.string().optional(),
  allowedTasks: z.array(z.string()).optional(),
  blockedTasks: z.array(z.string()).optional(),
  successCriteria: z.string().optional(),
  escalationRules: z.string().optional(),
  autonomyLevel: z.enum(AGS_AUTONOMY_LEVELS).optional(),
  interventionTriggers: z.array(z.string()).optional(),
});

// ── Prompts ─────────────────────────────────────────────────────────────────

export const updatePromptPackSchema = z.object({
  agentId: z.number().int().positive(),
  systemInstructions: z.string().optional(),
  roleInstructions: z.string().optional(),
  policyInstructions: z.string().optional(),
  outputContract: z.string().optional(),
  promptExamples: z.array(z.any()).optional(),
  fallbackBehavior: z.string().optional(),
  refusalBehavior: z.string().optional(),
});

export const comparePromptPackSchema = z.object({
  agentId: z.number().int().positive(),
  versionA: z.number().int().positive().optional(),
  versionB: z.number().int().positive().optional(),
});

// ── Tools ───────────────────────────────────────────────────────────────────

export const attachToolSchema = z.object({
  agentId: z.number().int().positive(),
  toolKey: z.string().min(1).max(120),
  toolName: z.string().min(1),
  permissionMatrix: z.record(z.string(), z.any()).optional(),
  allowedActions: z.array(z.string()).optional(),
  blockedActions: z.array(z.string()).optional(),
  requiresApproval: z.boolean().optional(),
  rateLimit: z.record(z.string(), z.any()).optional(),
  auditRequired: z.boolean().optional(),
});

export const updateToolBindingSchema = z.object({
  bindingId: z.number().int().positive(),
  permissionMatrix: z.record(z.string(), z.any()).optional(),
  allowedActions: z.array(z.string()).optional(),
  blockedActions: z.array(z.string()).optional(),
  requiresApproval: z.boolean().optional(),
  rateLimit: z.record(z.string(), z.any()).optional(),
  auditRequired: z.boolean().optional(),
});

export const removeToolSchema = z.object({
  bindingId: z.number().int().positive(),
});

export const simulateToolCallSchema = z.object({
  agentId: z.number().int().positive(),
  toolKey: z.string().min(1),
  payload: z.record(z.string(), z.any()).default({}),
});

// ── Knowledge ───────────────────────────────────────────────────────────────

export const updateKnowledgeConfigSchema = z.object({
  agentId: z.number().int().positive(),
  config: z.record(z.string(), z.any()),
  bindings: z
    .array(
      z.object({
        sourceKey: z.string().min(1),
        sourceName: z.string().min(1),
        priority: z.number().int().optional(),
        freshness: z.string().optional(),
        groundingMode: z.string().optional(),
        retrievalDepth: z.number().int().optional(),
        contextBudget: z.number().int().optional(),
      })
    )
    .optional(),
});

export const previewRetrievalSchema = z.object({
  agentId: z.number().int().positive(),
  query: z.string().min(1),
});

// ── Memory ──────────────────────────────────────────────────────────────────

export const updateMemoryConfigSchema = z.object({
  agentId: z.number().int().positive(),
  configs: z.array(
    z.object({
      memoryType: z.enum(AGS_MEMORY_TYPES),
      enabled: z.boolean(),
      retentionDays: z.number().int().nullable().optional(),
      readPermissions: z.array(z.string()).optional(),
      writePermissions: z.array(z.string()).optional(),
      deletionPolicy: z.string().optional(),
      privacyRules: z.record(z.string(), z.any()).optional(),
    })
  ),
});

// ── Workflow ────────────────────────────────────────────────────────────────

export const updateWorkflowConfigSchema = z.object({
  agentId: z.number().int().positive(),
  config: z.record(z.string(), z.any()),
  nodes: z
    .array(
      z.object({
        nodeKey: z.string().min(1),
        nodeType: z.string().min(1),
        label: z.string().optional(),
        config: z.record(z.string(), z.any()).optional(),
        positionX: z.number().int().optional(),
        positionY: z.number().int().optional(),
      })
    )
    .optional(),
  edges: z
    .array(
      z.object({
        fromNodeKey: z.string().min(1),
        toNodeKey: z.string().min(1),
        label: z.string().optional(),
        condition: z.record(z.string(), z.any()).optional(),
      })
    )
    .optional(),
});

// ── Governance ──────────────────────────────────────────────────────────────

export const updateGovernancePolicySchema = z.object({
  agentId: z.number().int().positive(),
  policy: z.record(z.string(), z.any()),
});

// ── Simulation ──────────────────────────────────────────────────────────────

export const saveSimulationScenarioSchema = z.object({
  agentId: z.number().int().positive(),
  scenarioId: z.number().int().positive().optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  inputPayload: z.record(z.string(), z.any()).default({}),
  toggles: z.record(z.string(), z.any()).default({}),
});

export const runSimulationSchema = z.object({
  agentId: z.number().int().positive(),
  scenarioId: z.number().int().positive().optional(),
  inputPayload: z.record(z.string(), z.any()).optional(),
  toggles: z
    .object({
      mockedTools: z.boolean().default(true),
      sandboxMemory: z.boolean().default(true),
      strictPolicy: z.boolean().default(true),
      fullOrchestration: z.boolean().default(false),
      stepByStep: z.boolean().default(false),
    })
    .partial()
    .default({}),
});

export const getSimulationRunSchema = z.object({
  runId: z.number().int().positive(),
});

export const compareSimulationRunsSchema = z.object({
  runIdA: z.number().int().positive(),
  runIdB: z.number().int().positive(),
});

export const promoteSimulationToTestSchema = z.object({
  runId: z.number().int().positive(),
  suiteId: z.number().int().positive().optional(),
  caseName: z.string().min(1),
});

// ── Testing ─────────────────────────────────────────────────────────────────

export const saveTestSuiteSchema = z.object({
  agentId: z.number().int().positive(),
  suiteId: z.number().int().positive().optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
});

export const runTestSuiteSchema = z.object({
  suiteId: z.number().int().positive(),
});

export const saveTestCaseSchema = z.object({
  suiteId: z.number().int().positive(),
  caseId: z.number().int().positive().optional(),
  name: z.string().min(1).max(200),
  inputPayload: z.record(z.string(), z.any()).default({}),
  expected: z.record(z.string(), z.any()).optional(),
  assertions: z.array(z.any()).optional(),
});

export const removeTestCaseSchema = z.object({
  caseId: z.number().int().positive(),
});

// ── Runs ────────────────────────────────────────────────────────────────────

export const listRunsSchema = z.object({
  agentId: z.number().int().positive(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(50),
});

export const getRunDetailSchema = z.object({
  runId: z.number().int().positive(),
});

// ── Versions ────────────────────────────────────────────────────────────────

export const createVersionSchema = z.object({
  agentId: z.number().int().positive(),
  label: z.string().min(1).max(200),
  summary: z.string().optional(),
});

export const compareVersionsSchema = z.object({
  agentId: z.number().int().positive(),
  versionAId: z.number().int().positive(),
  versionBId: z.number().int().positive(),
});

export const rollbackToVersionSchema = z.object({
  agentId: z.number().int().positive(),
  versionId: z.number().int().positive(),
});

// ── Publish ─────────────────────────────────────────────────────────────────

export const publishVersionSchema = z.object({
  agentId: z.number().int().positive(),
  versionId: z.number().int().positive(),
  targetEnvironment: z.enum(AGS_ENVIRONMENTS),
  releaseNotes: z.string().optional(),
});

export const submitForReviewSchema = z.object({
  agentId: z.number().int().positive(),
  versionId: z.number().int().positive().optional(),
  targetEnvironment: z.enum(AGS_ENVIRONMENTS),
  notes: z.string().optional(),
});

export const archiveAgentSchema = z.object({
  agentId: z.number().int().positive(),
  reason: z.string().optional(),
});

export const decideApprovalStepSchema = z.object({
  stepId: z.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().optional(),
});

export const withdrawPublishRequestSchema = z.object({
  publishRequestId: z.number().int().positive(),
});

// ── Phase 0b: openllm-agent2 native parity schemas ──────────────────────────

// Hooks (27 lifecycle events)
export const saveHookSchema = z.object({
  agentId: z.number().int().positive(),
  hookId: z.number().int().positive().optional(),
  eventName: z.enum(AGS_HOOK_EVENTS),
  matcher: z.string().nullable().optional(),
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().nullable().optional(),
  requiresApproval: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const removeHookSchema = z.object({
  hookId: z.number().int().positive(),
});

// MCP servers
export const saveMcpServerSchema = z.object({
  agentId: z.number().int().positive(),
  serverId: z.number().int().positive().optional(),
  name: z.string().min(1).max(120),
  transport: z.enum(AGS_MCP_TRANSPORTS),
  command: z.string().nullable().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

export const removeMcpServerSchema = z.object({
  serverId: z.number().int().positive(),
});

// Skills (attached from local catalog)
export const attachSkillSchema = z.object({
  agentId: z.number().int().positive(),
  packKey: z.string().min(1),
  skillKey: z.string().min(1),
  skillName: z.string().min(1),
  allowedTools: z.array(z.string()).optional(),
  blockedTools: z.array(z.string()).optional(),
  requiresApproval: z.boolean().optional(),
  argsSchema: z.record(z.string(), z.any()).optional(),
});

export const removeSkillSchema = z.object({
  skillId: z.number().int().positive(),
});

// Subagents
export const saveSubagentSchema = z.object({
  agentId: z.number().int().positive(),
  subagentId: z.number().int().positive().optional(),
  name: z.string().min(1).max(120),
  description: z.string().nullable().optional(),
  prompt: z.string().min(1),
  tools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  model: z.string().nullable().optional(),
  maxTurns: z.number().int().positive().nullable().optional(),
  background: z.boolean().optional(),
  effort: z.string().nullable().optional(),
  permissionMode: z.enum(AGS_PERMISSION_MODES).nullable().optional(),
  memory: z.enum(AGS_MEMORY_SCOPES).nullable().optional(),
  initialPrompt: z.string().nullable().optional(),
  criticalSystemReminder: z.string().nullable().optional(),
});

export const removeSubagentSchema = z.object({
  subagentId: z.number().int().positive(),
});

// Plugins
export const savePluginSchema = z.object({
  agentId: z.number().int().positive(),
  pluginId: z.number().int().positive().optional(),
  type: z.enum(AGS_PLUGIN_TYPES).default("local"),
  path: z.string().min(1),
  enabled: z.boolean().optional(),
});

export const removePluginSchema = z.object({
  pluginId: z.number().int().positive(),
});

// Permission rules
export const savePermissionRuleSchema = z.object({
  agentId: z.number().int().positive(),
  ruleId: z.number().int().positive().optional(),
  ruleSource: z.enum(AGS_PERMISSION_SOURCES),
  ruleBehavior: z.enum(AGS_PERMISSION_BEHAVIORS),
  toolPattern: z.string().min(1),
  contentPattern: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const removePermissionRuleSchema = z.object({
  ruleId: z.number().int().positive(),
});

// Runtime config (the 8 new draft columns surfaced via a single sub-router)
export const updateRuntimeConfigSchema = z.object({
  agentId: z.number().int().positive(),
  effort: z.string().nullable().optional(),
  maxTurns: z.number().int().positive().nullable().optional(),
  background: z.boolean().optional(),
  initialPrompt: z.string().nullable().optional(),
  criticalSystemReminder: z.string().nullable().optional(),
  permissionMode: z.enum(AGS_PERMISSION_MODES).nullable().optional(),
  workingDirectories: z.array(z.string()).optional(),
  providerConfig: z.record(z.string(), z.any()).optional(),
  // Phase 12: presentation
  outputStyle: z.enum(["plain", "markdown", "json"]).nullable().optional(),
  statusLineConfig: z.record(z.string(), z.any()).optional(),
  theme: z.enum(["dark", "light", "monokai"]).nullable().optional(),
});
