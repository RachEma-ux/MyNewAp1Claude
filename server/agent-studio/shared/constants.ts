/**
 * AI Agent Studio — Shared Constants
 *
 * Lifecycle states, agent classes, autonomy levels, environments, and verdicts
 * used across the AI Agent Studio module.
 */

export const AGS_LIFECYCLE_STATES = [
  "new",
  "draft",
  "in_design",
  "simulated",
  "tested",
  "review_required",
  "blocked",
  "ready_to_publish",
  "published",
  "deprecated",
  "archived",
] as const;
export type AgsLifecycleState = (typeof AGS_LIFECYCLE_STATES)[number];

// ============================================================================
// Per-lifecycle-state operator-facing metadata (T-S.1)
// ============================================================================

export interface AgsLifecycleStateMetadata {
  /** Display label rendered in the agent-studio dashboard / state badge. */
  readonly label: string;
  /** Short operator-facing description of what the state represents. */
  readonly description: string;
  /** Closed-taxonomy classification:
   *  - `in_development`: agent is being built (new/draft/in_design).
   *  - `under_validation`: agent is being verified (simulated/tested/
   *    review_required).
   *  - `blocked`: agent has a hard issue preventing forward progress.
   *  - `release_candidate`: agent is ready to publish.
   *  - `active`: agent is published and runnable.
   *  - `retired`: agent is deprecated or archived. */
  readonly phase:
    | "in_development"
    | "under_validation"
    | "blocked"
    | "release_candidate"
    | "active"
    | "retired";
  /** Whether the agent can be invoked at runtime (true) — only
   *  `published` agents are invocable. */
  readonly runnable: boolean;
}

export const AGS_LIFECYCLE_STATE_METADATA: Readonly<
  Record<AgsLifecycleState, AgsLifecycleStateMetadata>
> = {
  new: {
    label: "New",
    description:
      "Agent has been created but has no draft fields populated yet — initial empty-shell state.",
    phase: "in_development",
    runnable: false,
  },
  draft: {
    label: "Draft",
    description:
      "Agent has been actively authored — drafts on agent fields exist, simulation may still be missing.",
    phase: "in_development",
    runnable: false,
  },
  in_design: {
    label: "In Design",
    description:
      "Agent is being designed — system instructions, scope, and policy boundaries are taking shape.",
    phase: "in_development",
    runnable: false,
  },
  simulated: {
    label: "Simulated",
    description:
      "Agent has been exercised in simulation mode — preliminary validation against simulation harness has passed.",
    phase: "under_validation",
    runnable: false,
  },
  tested: {
    label: "Tested",
    description:
      "Agent has passed the formal test suite — regression / golden-question validation completed.",
    phase: "under_validation",
    runnable: false,
  },
  review_required: {
    label: "Review Required",
    description:
      "Agent is waiting on human review — governance verdict pending or operator approval needed before publish.",
    phase: "under_validation",
    runnable: false,
  },
  blocked: {
    label: "Blocked",
    description:
      "Agent has a hard issue preventing publish — governance rejected, dependencies missing, or breaking-change discovered.",
    phase: "blocked",
    runnable: false,
  },
  ready_to_publish: {
    label: "Ready to Publish",
    description:
      "Agent has passed all gates and is ready for the operator to flip to `published`. Last manual approval gate.",
    phase: "release_candidate",
    runnable: false,
  },
  published: {
    label: "Published",
    description:
      "Agent is live and runnable — runtime invocations are accepted; release-version tracking is active.",
    phase: "active",
    runnable: true,
  },
  deprecated: {
    label: "Deprecated",
    description:
      "Agent has been replaced by a newer version or marked end-of-life — still runnable for legacy traffic but flagged for retirement.",
    phase: "retired",
    runnable: false,
  },
  archived: {
    label: "Archived",
    description:
      "Agent is fully retired — runtime invocations refused. Configuration preserved for audit / rollback.",
    phase: "retired",
    runnable: false,
  },
};

export function getAgsLifecycleStateMetadata(
  state: AgsLifecycleState,
): AgsLifecycleStateMetadata {
  return AGS_LIFECYCLE_STATE_METADATA[state];
}

export const AGS_AGENT_CLASSES = [
  "assistant",
  "specialist",
  "orchestrator",
  "automation",
  "researcher",
  "auditor",
] as const;
export type AgsAgentClass = (typeof AGS_AGENT_CLASSES)[number];

// ============================================================================
// Per-agent-class operator-facing metadata (T-S.2)
// ============================================================================

export interface AgsAgentClassMetadata {
  /** Display label rendered in the agent-studio picker / class badge. */
  readonly label: string;
  /** Short operator-facing description of the agent class's role. */
  readonly description: string;
  /** Whether agents of this class typically invoke other agents
   *  (orchestrators / automations) vs. answer queries directly. */
  readonly invokesOtherAgents: boolean;
  /** Default autonomy floor — agents of this class should not be
   *  configured with a lower autonomy level by default. The runtime
   *  enforces this only as guidance; operators may still override. */
  readonly recommendedAutonomyFloor:
    | "manual"
    | "supervised"
    | "semi_autonomous"
    | "autonomous";
}

export const AGS_AGENT_CLASS_METADATA: Readonly<
  Record<AgsAgentClass, AgsAgentClassMetadata>
> = {
  assistant: {
    label: "Assistant",
    description:
      "General-purpose conversational agent — fields free-form user queries and threads context across turns.",
    invokesOtherAgents: false,
    recommendedAutonomyFloor: "supervised",
  },
  specialist: {
    label: "Specialist",
    description:
      "Domain-focused agent with deep knowledge of a specific area — designed to answer narrow, expert-level questions.",
    invokesOtherAgents: false,
    recommendedAutonomyFloor: "supervised",
  },
  orchestrator: {
    label: "Orchestrator",
    description:
      "Coordinates other agents — delegates sub-tasks, aggregates results, and decides the next agent to invoke.",
    invokesOtherAgents: true,
    recommendedAutonomyFloor: "semi_autonomous",
  },
  automation: {
    label: "Automation",
    description:
      "Workflow-driven agent — runs on triggers/schedules and executes a deterministic pipeline. May invoke specialists.",
    invokesOtherAgents: true,
    recommendedAutonomyFloor: "autonomous",
  },
  researcher: {
    label: "Researcher",
    description:
      "Investigation-focused agent — runs deep multi-step retrieval/synthesis chains and produces structured findings.",
    invokesOtherAgents: false,
    recommendedAutonomyFloor: "supervised",
  },
  auditor: {
    label: "Auditor",
    description:
      "Read-only agent that inspects state and produces compliance / safety reports — no mutations, no tool dispatches.",
    invokesOtherAgents: false,
    recommendedAutonomyFloor: "manual",
  },
};

export function getAgsAgentClassMetadata(
  cls: AgsAgentClass,
): AgsAgentClassMetadata {
  return AGS_AGENT_CLASS_METADATA[cls];
}

export const AGS_AUTONOMY_LEVELS = [
  "manual",
  "supervised",
  "semi_autonomous",
  "autonomous",
] as const;
export type AgsAutonomyLevel = (typeof AGS_AUTONOMY_LEVELS)[number];

// ============================================================================
// Per-autonomy-level operator-facing metadata (T-S.3)
// ============================================================================

export interface AgsAutonomyLevelMetadata {
  /** Display label rendered in the autonomy picker / agent card. */
  readonly label: string;
  /** Short operator-facing description of what this level entails. */
  readonly description: string;
  /** Stable rank 0-3 used for comparator-style "minimum autonomy"
   *  checks. 0 = manual (most restrictive), 3 = autonomous
   *  (least restrictive). */
  readonly rank: 0 | 1 | 2 | 3;
  /** Whether actions at this level require a human-in-the-loop
   *  approval before tool dispatch (true for manual/supervised). */
  readonly requiresHumanApproval: boolean;
  /** Whether the agent runs continuously without prompt (true for
   *  autonomous only). */
  readonly runsContinuously: boolean;
}

export const AGS_AUTONOMY_LEVEL_METADATA: Readonly<
  Record<AgsAutonomyLevel, AgsAutonomyLevelMetadata>
> = {
  manual: {
    label: "Manual",
    description:
      "Operator approves every tool invocation — agent never acts without explicit per-call go-ahead.",
    rank: 0,
    requiresHumanApproval: true,
    runsContinuously: false,
  },
  supervised: {
    label: "Supervised",
    description:
      "Operator approves at strategic decision points but not every micro-action. Default for new agents.",
    rank: 1,
    requiresHumanApproval: true,
    runsContinuously: false,
  },
  semi_autonomous: {
    label: "Semi-Autonomous",
    description:
      "Agent acts on its own within a defined sandbox — escalates only for out-of-scope decisions or governance breaches.",
    rank: 2,
    requiresHumanApproval: false,
    runsContinuously: false,
  },
  autonomous: {
    label: "Autonomous",
    description:
      "Agent runs continuously on its own — operator inspects results via dashboards rather than per-action approval.",
    rank: 3,
    requiresHumanApproval: false,
    runsContinuously: true,
  },
};

export function getAgsAutonomyLevelMetadata(
  level: AgsAutonomyLevel,
): AgsAutonomyLevelMetadata {
  return AGS_AUTONOMY_LEVEL_METADATA[level];
}

export const AGS_ENVIRONMENTS = [
  "draft",
  "sandbox",
  "staging",
  "production",
] as const;
export type AgsEnvironment = (typeof AGS_ENVIRONMENTS)[number];

// ============================================================================
// Per-environment operator-facing metadata (T-S.4)
// ============================================================================

export interface AgsEnvironmentMetadata {
  /** Display label rendered in the environment picker / banner. */
  readonly label: string;
  /** Short operator-facing description of the environment. */
  readonly description: string;
  /** Stable rank 0-3 for promotion-order comparison. 0=draft (least
   *  promoted), 3=production (most promoted). */
  readonly rank: 0 | 1 | 2 | 3;
  /** Whether real users / customers interact with this environment
   *  (true for production only). Governance treats this as a hard
   *  promotion gate. */
  readonly customerFacing: boolean;
  /** Whether mutations in this environment are persistent (true for
   *  staging + production) vs. ephemeral (draft + sandbox can be
   *  reset). */
  readonly persistent: boolean;
}

export const AGS_ENVIRONMENT_METADATA: Readonly<
  Record<AgsEnvironment, AgsEnvironmentMetadata>
> = {
  draft: {
    label: "Draft",
    description:
      "Pre-promotion authoring environment — every change is local to the operator's draft scope. Resets freely.",
    rank: 0,
    customerFacing: false,
    persistent: false,
  },
  sandbox: {
    label: "Sandbox",
    description:
      "Isolated test environment for trying agent configurations against synthetic data. Resettable on demand.",
    rank: 1,
    customerFacing: false,
    persistent: false,
  },
  staging: {
    label: "Staging",
    description:
      "Pre-production environment mirroring production data and infrastructure — final integration testing before promotion.",
    rank: 2,
    customerFacing: false,
    persistent: true,
  },
  production: {
    label: "Production",
    description:
      "Live customer-facing environment — every mutation affects real users. Governance gates are strictest here.",
    rank: 3,
    customerFacing: true,
    persistent: true,
  },
};

export function getAgsEnvironmentMetadata(
  env: AgsEnvironment,
): AgsEnvironmentMetadata {
  return AGS_ENVIRONMENT_METADATA[env];
}

export const AGS_GOVERNANCE_VERDICTS = ["pass", "warning", "blocked"] as const;
export type AgsGovernanceVerdict = (typeof AGS_GOVERNANCE_VERDICTS)[number];

export const AGS_MEMORY_TYPES = [
  "session",
  "persistent",
  "episodic",
  "preference",
  "shared",
] as const;
export type AgsMemoryType = (typeof AGS_MEMORY_TYPES)[number];

export const AGS_VISIBILITIES = ["private", "team", "org", "public"] as const;
export type AgsVisibility = (typeof AGS_VISIBILITIES)[number];

export const AGS_RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type AgsRunStatus = (typeof AGS_RUN_STATUSES)[number];

export const AGS_TEST_VERDICTS = ["pass", "fail", "skipped", "error"] as const;
export type AgsTestVerdict = (typeof AGS_TEST_VERDICTS)[number];

/** Required fields for an agent to reach the "Ready to Publish" state. */
export const AGS_REQUIRED_PUBLISH_FIELDS = [
  "name",
  "internalKey",
  "ownerId",
  "agentClass",
  "mission",
  "scope",
  "systemInstructions",
  "outputContract",
] as const;

// ── Phase 0a: openllm-agent2 native parity enums ────────────────────────────

/**
 * Lifecycle hook events sourced from openllm-agent2's `coreSchemas.ts:355-385`.
 * 27 events covering tool use, sessions, subagents, compaction, permissions,
 * tasks, elicitation, worktrees, files, and config changes.
 */
export const AGS_HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Notification",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "PermissionRequest",
  "PermissionDenied",
  "Setup",
  "TeammateIdle",
  "TaskCreated",
  "TaskCompleted",
  "Elicitation",
  "ElicitationResult",
  "ConfigChange",
  "WorktreeCreate",
  "WorktreeRemove",
  "InstructionsLoaded",
  "CwdChanged",
  "FileChanged",
] as const;
export type AgsHookEvent = (typeof AGS_HOOK_EVENTS)[number];

/**
 * Permission modes from openllm-agent2's `PermissionModeSchema`.
 *  - default: prompts for dangerous operations
 *  - acceptEdits: auto-accept file edits
 *  - bypassPermissions: skip all permission checks (requires allowDangerouslySkipPermissions)
 *  - plan: planning mode, no actual tool execution
 *  - dontAsk: deny if not pre-approved, never prompt
 */
export const AGS_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "dontAsk",
] as const;
export type AgsPermissionMode = (typeof AGS_PERMISSION_MODES)[number];

/** Permission rule behavior — applied when a tool invocation matches the rule pattern. */
export const AGS_PERMISSION_BEHAVIORS = ["allow", "deny", "ask"] as const;
export type AgsPermissionBehavior = (typeof AGS_PERMISSION_BEHAVIORS)[number];

/** Permission rule source — where the rule originated from. */
export const AGS_PERMISSION_SOURCES = [
  "userSettings",
  "projectSettings",
  "localSettings",
  "cliArg",
  "session",
] as const;
export type AgsPermissionSource = (typeof AGS_PERMISSION_SOURCES)[number];

/** MCP server transport types from openllm-agent2's `coreSchemas.ts:110-160`. */
// Phase 15a: added "websocket" to match the upstream MCP spec's full transport set
export const AGS_MCP_TRANSPORTS = [
  "stdio",
  "sse",
  "http",
  "sdk",
  "websocket",
] as const;
export type AgsMcpTransport = (typeof AGS_MCP_TRANSPORTS)[number];

/** MCP server connection status. */
export const AGS_MCP_STATUSES = [
  "pending",
  "connected",
  "disconnected",
  "error",
] as const;
export type AgsMcpStatus = (typeof AGS_MCP_STATUSES)[number];

/**
 * 15 LLM providers supported by openllm-agent2 (per `SkillsTools.md`).
 * Used for the runtime config provider picker.
 */
export const AGS_PROVIDER_KEYS = [
  "ollama",
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "groq",
  "together",
  "fireworks",
  "mistral",
  "openrouter",
  "github_models",
  "lmstudio",
  "bedrock",
  "vertex",
  "atomic_chat",
] as const;
export type AgsProviderKey = (typeof AGS_PROVIDER_KEYS)[number];

/** Reasoning effort levels (per openllm `AgentDefinition.effort`). */
export const AGS_EFFORT_LEVELS = ["low", "medium", "high", "max"] as const;
export type AgsEffortLevel = (typeof AGS_EFFORT_LEVELS)[number];

/** Memory scope (filesystem-based, per openllm `AgentDefinition.memory`). */
export const AGS_MEMORY_SCOPES = ["user", "project", "local"] as const;
export type AgsMemoryScope = (typeof AGS_MEMORY_SCOPES)[number];

/** Plugin loader type (per openllm `SdkPluginConfigSchema`). */
export const AGS_PLUGIN_TYPES = ["local"] as const;
export type AgsPluginType = (typeof AGS_PLUGIN_TYPES)[number];

// ── Phase 13 — Catalog (user-authored tools + skills) ───────────────────────

/**
 * Tool invocation kinds for user-authored catalog tools.
 *
 *   "shell"   → spawn argv via child_process.spawn (sandboxed env, hard
 *               timeout, refuses to run without a working directory)
 *   "http"    → fetch POST/GET against a URL with headers from
 *               invocationConfig
 *   "mcp_ref" → proxy to an existing MCP-discovered tool (serverId +
 *               toolName) — useful for renaming or wrapping an MCP tool
 *               under a friendlier alias
 *   "builtin" → reserved; refers to one of the static 51 — used by the
 *               merged catalog adapter, not user-creatable via the API
 */
export const AGS_TOOL_INVOCATION_KINDS = [
  "shell",
  "http",
  "mcp_ref",
  "builtin",
] as const;
export type AgsToolInvocationKind = (typeof AGS_TOOL_INVOCATION_KINDS)[number];

/**
 * Where a catalog skill came from. Drives merge logic in
 * skill-catalog-adapter.ts and the source-filter chip on the UI.
 */
export const AGS_SKILL_SOURCES = [
  "db",
  "imported",
  "vendored",
  "marketplace",
  "mcp_prompt",
] as const;
export type AgsSkillSource = (typeof AGS_SKILL_SOURCES)[number];

/**
 * Categories for catalog tools — kept open-ended via "custom" so users
 * can add new domains without a schema change.
 */
export const AGS_TOOL_CATEGORIES = [
  "filesystem",
  "compute",
  "communication",
  "network",
  "search",
  "custom",
] as const;
export type AgsToolCategory = (typeof AGS_TOOL_CATEGORIES)[number];
