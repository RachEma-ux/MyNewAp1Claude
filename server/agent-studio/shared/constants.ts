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

// ============================================================================
// Per-verdict operator-facing metadata (T-S.5)
// ============================================================================

export interface AgsGovernanceVerdictMetadata {
  /** Display label rendered in governance result cards / promotion banners. */
  readonly label: string;
  /** Short operator-facing description of what the verdict means. */
  readonly description: string;
  /** Whether downstream promotion / publish flows may proceed after
   *  this verdict (true for pass/warning, false for blocked). */
  readonly allowsPromotion: boolean;
  /** Whether the verdict warrants an operator review prompt
   *  (true for warning/blocked; false for pass). */
  readonly requiresOperatorAttention: boolean;
}

export const AGS_GOVERNANCE_VERDICT_METADATA: Readonly<
  Record<AgsGovernanceVerdict, AgsGovernanceVerdictMetadata>
> = {
  pass: {
    label: "Pass",
    description:
      "Governance evaluation passed — all gates green. Downstream promotion flows may proceed without prompt.",
    allowsPromotion: true,
    requiresOperatorAttention: false,
  },
  warning: {
    label: "Warning",
    description:
      "Governance flagged advisory issues — promotion may proceed but operator should review the warnings first.",
    allowsPromotion: true,
    requiresOperatorAttention: true,
  },
  blocked: {
    label: "Blocked",
    description:
      "Governance hard-blocked the action — at least one gate failed. Promotion cannot proceed without remediation.",
    allowsPromotion: false,
    requiresOperatorAttention: true,
  },
};

export function getAgsGovernanceVerdictMetadata(
  verdict: AgsGovernanceVerdict,
): AgsGovernanceVerdictMetadata {
  return AGS_GOVERNANCE_VERDICT_METADATA[verdict];
}

export const AGS_MEMORY_TYPES = [
  "session",
  "persistent",
  "episodic",
  "preference",
  "shared",
] as const;
export type AgsMemoryType = (typeof AGS_MEMORY_TYPES)[number];

// ============================================================================
// Per-memory-type operator-facing metadata (T-S.6)
// ============================================================================

export interface AgsMemoryTypeMetadata {
  /** Display label rendered in the memory configuration picker. */
  readonly label: string;
  /** Short operator-facing description of what this memory holds. */
  readonly description: string;
  /** Whether memory of this type survives session boundaries. */
  readonly persistsAcrossSessions: boolean;
  /** Closed-taxonomy scope:
   *  - `single_agent`: memory is per-agent-instance (session,
   *    persistent, episodic, preference).
   *  - `cross_agent`: memory is shared across agents (shared). */
  readonly scope: "single_agent" | "cross_agent";
}

export const AGS_MEMORY_TYPE_METADATA: Readonly<
  Record<AgsMemoryType, AgsMemoryTypeMetadata>
> = {
  session: {
    label: "Session",
    description:
      "Conversation-scoped working memory — context and intermediate state for the current run. Discarded after session ends.",
    persistsAcrossSessions: false,
    scope: "single_agent",
  },
  persistent: {
    label: "Persistent",
    description:
      "Long-term agent knowledge that survives across sessions — facts the agent has learned about its domain or user.",
    persistsAcrossSessions: true,
    scope: "single_agent",
  },
  episodic: {
    label: "Episodic",
    description:
      "Time-anchored record of prior agent interactions — operator can review what happened when. Indexed by timestamp + topic.",
    persistsAcrossSessions: true,
    scope: "single_agent",
  },
  preference: {
    label: "Preference",
    description:
      "User-specific tuning — preferences, response style, format choices the agent should respect for this user.",
    persistsAcrossSessions: true,
    scope: "single_agent",
  },
  shared: {
    label: "Shared",
    description:
      "Cross-agent knowledge accessible to multiple agents in the workspace — team-level memory, governance policies, common terminology.",
    persistsAcrossSessions: true,
    scope: "cross_agent",
  },
};

export function getAgsMemoryTypeMetadata(
  type: AgsMemoryType,
): AgsMemoryTypeMetadata {
  return AGS_MEMORY_TYPE_METADATA[type];
}

export const AGS_VISIBILITIES = ["private", "team", "org", "public"] as const;
export type AgsVisibility = (typeof AGS_VISIBILITIES)[number];

// ============================================================================
// Per-visibility operator-facing metadata (T-S.7)
// ============================================================================

export interface AgsVisibilityMetadata {
  /** Display label rendered in the visibility picker / badge. */
  readonly label: string;
  /** Short operator-facing description of who can see this scope. */
  readonly description: string;
  /** Stable rank 0-3 for visibility-comparison (0=most restrictive
   *  / 3=least restrictive). */
  readonly rank: 0 | 1 | 2 | 3;
  /** Whether content at this visibility is accessible to users
   *  outside the owning organization (true for `public` only). */
  readonly external: boolean;
}

export const AGS_VISIBILITY_METADATA: Readonly<
  Record<AgsVisibility, AgsVisibilityMetadata>
> = {
  private: {
    label: "Private",
    description:
      "Only the owner can see this — restricted to the single user who created it.",
    rank: 0,
    external: false,
  },
  team: {
    label: "Team",
    description:
      "Visible to the owner's team — workspace-scoped members beyond just the creator.",
    rank: 1,
    external: false,
  },
  org: {
    label: "Organization",
    description:
      "Visible to everyone in the owning organization — broader than team but still gated by org membership.",
    rank: 2,
    external: false,
  },
  public: {
    label: "Public",
    description:
      "Visible to anyone — external users / unauthenticated traffic can access. Strongest governance checks apply.",
    rank: 3,
    external: true,
  },
};

export function getAgsVisibilityMetadata(
  visibility: AgsVisibility,
): AgsVisibilityMetadata {
  return AGS_VISIBILITY_METADATA[visibility];
}

export const AGS_RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type AgsRunStatus = (typeof AGS_RUN_STATUSES)[number];

// ============================================================================
// Per-run-status operator-facing metadata (T-S.8)
// ============================================================================

export interface AgsRunStatusMetadata {
  /** Display label rendered in run dashboards / runtime trace. */
  readonly label: string;
  /** Short operator-facing description of the run state. */
  readonly description: string;
  /** Whether the run is in a terminal state (true for completed /
   *  failed / cancelled). */
  readonly terminal: boolean;
  /** Whether the run finished successfully (true for completed only;
   *  always false when terminal=false). */
  readonly successful: boolean;
}

export const AGS_RUN_STATUS_METADATA: Readonly<
  Record<AgsRunStatus, AgsRunStatusMetadata>
> = {
  queued: {
    label: "Queued",
    description:
      "Run is scheduled and awaiting executor pickup — has not yet started any work.",
    terminal: false,
    successful: false,
  },
  running: {
    label: "Running",
    description:
      "Run is actively executing — heartbeat is current; runtime trace is being recorded.",
    terminal: false,
    successful: false,
  },
  completed: {
    label: "Completed",
    description:
      "Run finished successfully — all steps reached terminal accept state with the expected output shape.",
    terminal: true,
    successful: true,
  },
  failed: {
    label: "Failed",
    description:
      "Run terminated with an error — runtime trace captures the failure cause; operator inspects in the trace UI.",
    terminal: true,
    successful: false,
  },
  cancelled: {
    label: "Cancelled",
    description:
      "Run was cancelled by the operator or by the runtime (e.g. budget cap exceeded) — terminal without explicit success/failure.",
    terminal: true,
    successful: false,
  },
};

export function getAgsRunStatusMetadata(
  status: AgsRunStatus,
): AgsRunStatusMetadata {
  return AGS_RUN_STATUS_METADATA[status];
}

export const AGS_TEST_VERDICTS = ["pass", "fail", "skipped", "error"] as const;
export type AgsTestVerdict = (typeof AGS_TEST_VERDICTS)[number];

// ============================================================================
// Per-test-verdict operator-facing metadata (T-S.9)
// ============================================================================

export interface AgsTestVerdictMetadata {
  /** Display label rendered in test result rows. */
  readonly label: string;
  /** Short operator-facing description of the verdict. */
  readonly description: string;
  /** Whether this verdict counts as a passing run for aggregate
   *  "X/Y pass" metrics (true for `pass` only). */
  readonly countedAsPass: boolean;
  /** Whether this verdict indicates the test actually executed
   *  (true for pass/fail/error; false for skipped). */
  readonly executed: boolean;
}

export const AGS_TEST_VERDICT_METADATA: Readonly<
  Record<AgsTestVerdict, AgsTestVerdictMetadata>
> = {
  pass: {
    label: "Pass",
    description:
      "Test executed and produced the expected result — assertion satisfied.",
    countedAsPass: true,
    executed: true,
  },
  fail: {
    label: "Fail",
    description:
      "Test executed but produced an unexpected result — assertion failed; the test author or production code needs investigation.",
    countedAsPass: false,
    executed: true,
  },
  skipped: {
    label: "Skipped",
    description:
      "Test did not execute — gated by environment / feature flag / `.skip` marker. Not a pass, not a failure.",
    countedAsPass: false,
    executed: false,
  },
  error: {
    label: "Error",
    description:
      "Test infrastructure threw before the assertion ran — fixture failure, setup error, or harness bug. Distinct from a normal fail.",
    countedAsPass: false,
    executed: true,
  },
};

export function getAgsTestVerdictMetadata(
  verdict: AgsTestVerdict,
): AgsTestVerdictMetadata {
  return AGS_TEST_VERDICT_METADATA[verdict];
}

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

// ============================================================================
// Per-permission-mode operator-facing metadata (T-S.11)
// ============================================================================

export interface AgsPermissionModeMetadata {
  /** Display label rendered in the permission mode picker. */
  readonly label: string;
  /** Short operator-facing description of what the mode does. */
  readonly description: string;
  /** Whether tool invocation may proceed (true) — only `plan` blocks
   *  tool execution entirely. */
  readonly allowsToolExecution: boolean;
  /** Whether the mode prompts the user on dangerous operations (true
   *  for `default` only). */
  readonly promptsOnDangerous: boolean;
  /** Whether this mode requires explicit `allowDangerouslySkipPermissions`
   *  to be set (true for `bypassPermissions` only). */
  readonly requiresBypassFlag: boolean;
}

export const AGS_PERMISSION_MODE_METADATA: Readonly<
  Record<AgsPermissionMode, AgsPermissionModeMetadata>
> = {
  default: {
    label: "Default",
    description:
      "Standard permission flow — prompts the user on dangerous tool operations and uses pre-approved rules for safe ones.",
    allowsToolExecution: true,
    promptsOnDangerous: true,
    requiresBypassFlag: false,
  },
  acceptEdits: {
    label: "Accept Edits",
    description:
      "Auto-accept file edit operations without prompting — useful for trusted automation paths.",
    allowsToolExecution: true,
    promptsOnDangerous: false,
    requiresBypassFlag: false,
  },
  bypassPermissions: {
    label: "Bypass Permissions",
    description:
      "Skip all permission checks — only allowed when `allowDangerouslySkipPermissions` is set. Used for fully-trusted sandboxes.",
    allowsToolExecution: true,
    promptsOnDangerous: false,
    requiresBypassFlag: true,
  },
  plan: {
    label: "Plan",
    description:
      "Planning mode — agent produces a plan but does not execute any tools. Used for review-before-execute workflows.",
    allowsToolExecution: false,
    promptsOnDangerous: false,
    requiresBypassFlag: false,
  },
  dontAsk: {
    label: "Don't Ask",
    description:
      "Strictest mode — deny any tool invocation that isn't pre-approved by an explicit rule. Never prompt the user.",
    allowsToolExecution: true,
    promptsOnDangerous: false,
    requiresBypassFlag: false,
  },
};

export function getAgsPermissionModeMetadata(
  mode: AgsPermissionMode,
): AgsPermissionModeMetadata {
  return AGS_PERMISSION_MODE_METADATA[mode];
}

/** Permission rule behavior — applied when a tool invocation matches the rule pattern. */
export const AGS_PERMISSION_BEHAVIORS = ["allow", "deny", "ask"] as const;
export type AgsPermissionBehavior = (typeof AGS_PERMISSION_BEHAVIORS)[number];

// ============================================================================
// Per-permission-behavior operator-facing metadata (T-S.12)
// ============================================================================

export interface AgsPermissionBehaviorMetadata {
  /** Display label rendered in the permission rule editor. */
  readonly label: string;
  /** Short operator-facing description of the behavior. */
  readonly description: string;
  /** Whether the matching tool invocation proceeds (true for `allow`
   *  only). */
  readonly proceeds: boolean;
  /** Whether the matching invocation prompts the user (true for
   *  `ask` only). */
  readonly prompts: boolean;
}

export const AGS_PERMISSION_BEHAVIOR_METADATA: Readonly<
  Record<AgsPermissionBehavior, AgsPermissionBehaviorMetadata>
> = {
  allow: {
    label: "Allow",
    description:
      "Matching tool invocation proceeds without further checks — operator has pre-authorized this pattern.",
    proceeds: true,
    prompts: false,
  },
  deny: {
    label: "Deny",
    description:
      "Matching tool invocation is refused — execution aborts with a permission-denied error.",
    proceeds: false,
    prompts: false,
  },
  ask: {
    label: "Ask",
    description:
      "Matching tool invocation prompts the user before proceeding — operator decides per-call.",
    proceeds: false,
    prompts: true,
  },
};

export function getAgsPermissionBehaviorMetadata(
  behavior: AgsPermissionBehavior,
): AgsPermissionBehaviorMetadata {
  return AGS_PERMISSION_BEHAVIOR_METADATA[behavior];
}

/** Permission rule source — where the rule originated from. */
export const AGS_PERMISSION_SOURCES = [
  "userSettings",
  "projectSettings",
  "localSettings",
  "cliArg",
  "session",
] as const;
export type AgsPermissionSource = (typeof AGS_PERMISSION_SOURCES)[number];

// ============================================================================
// Per-permission-source operator-facing metadata (T-S.15)
// ============================================================================

export interface AgsPermissionSourceMetadata {
  /** Display label rendered in the permission rule trace. */
  readonly label: string;
  /** Short operator-facing description of where the rule originated. */
  readonly description: string;
  /** Stable precedence rank — higher rank wins in case of conflict.
   *  Mirrors the resolver: session > cliArg > localSettings >
   *  projectSettings > userSettings. */
  readonly precedence: 0 | 1 | 2 | 3 | 4;
  /** Whether this rule source survives across sessions (true for
   *  the settings tiers; false for cliArg + session). */
  readonly persistent: boolean;
}

export const AGS_PERMISSION_SOURCE_METADATA: Readonly<
  Record<AgsPermissionSource, AgsPermissionSourceMetadata>
> = {
  userSettings: {
    label: "User Settings",
    description:
      "Rule defined in the user-level settings file — applies across all projects this user touches.",
    precedence: 0,
    persistent: true,
  },
  projectSettings: {
    label: "Project Settings",
    description:
      "Rule defined in the project-level settings file — applies to anyone working in this project.",
    precedence: 1,
    persistent: true,
  },
  localSettings: {
    label: "Local Settings",
    description:
      "Rule defined in the local-only settings file — typically operator overrides not checked into version control.",
    precedence: 2,
    persistent: true,
  },
  cliArg: {
    label: "CLI Argument",
    description:
      "Rule passed as a command-line argument — overrides settings tiers for this CLI invocation only.",
    precedence: 3,
    persistent: false,
  },
  session: {
    label: "Session",
    description:
      "Rule established during this interactive session (e.g. an `allow once` decision) — highest precedence; dies with the session.",
    precedence: 4,
    persistent: false,
  },
};

export function getAgsPermissionSourceMetadata(
  source: AgsPermissionSource,
): AgsPermissionSourceMetadata {
  return AGS_PERMISSION_SOURCE_METADATA[source];
}

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

// ============================================================================
// Per-MCP-transport operator-facing metadata (T-S.14)
// ============================================================================

export interface AgsMcpTransportMetadata {
  /** Display label rendered in the MCP server config picker. */
  readonly label: string;
  /** Short operator-facing description of the transport. */
  readonly description: string;
  /** Whether the transport is bidirectional/streaming (true for sse,
   *  sdk, websocket) vs. request/response (false for stdio, http). */
  readonly streaming: boolean;
  /** Whether the transport runs in-process (true for sdk) vs. across
   *  a network/process boundary (false for stdio/sse/http/websocket). */
  readonly inProcess: boolean;
}

export const AGS_MCP_TRANSPORT_METADATA: Readonly<
  Record<AgsMcpTransport, AgsMcpTransportMetadata>
> = {
  stdio: {
    label: "stdio",
    description:
      "Standard-input/output transport — MCP server runs as a subprocess; messages exchanged over stdin/stdout pipes.",
    streaming: false,
    inProcess: false,
  },
  sse: {
    label: "Server-Sent Events",
    description:
      "Long-lived HTTP connection with server→client streaming via SSE — useful for low-latency tool result delivery.",
    streaming: true,
    inProcess: false,
  },
  http: {
    label: "HTTP",
    description:
      "Plain request/response HTTP — most compatible transport but no server-push capability.",
    streaming: false,
    inProcess: false,
  },
  sdk: {
    label: "SDK",
    description:
      "In-process SDK integration — MCP server runs in the same Node.js process; lowest-latency option.",
    streaming: true,
    inProcess: true,
  },
  websocket: {
    label: "WebSocket",
    description:
      "Full-duplex WebSocket transport — bidirectional streaming over a single persistent connection.",
    streaming: true,
    inProcess: false,
  },
};

export function getAgsMcpTransportMetadata(
  transport: AgsMcpTransport,
): AgsMcpTransportMetadata {
  return AGS_MCP_TRANSPORT_METADATA[transport];
}

/** MCP server connection status. */
export const AGS_MCP_STATUSES = [
  "pending",
  "connected",
  "disconnected",
  "error",
] as const;
export type AgsMcpStatus = (typeof AGS_MCP_STATUSES)[number];

// ============================================================================
// Per-MCP-status operator-facing metadata (T-S.10)
// ============================================================================

export interface AgsMcpStatusMetadata {
  /** Display label rendered on the MCP server card. */
  readonly label: string;
  /** Short operator-facing description of the connection state. */
  readonly description: string;
  /** Whether tool dispatch to this MCP server can proceed (true for
   *  `connected` only). */
  readonly dispatchable: boolean;
  /** Whether this state is an error condition warranting an operator
   *  banner (true for `error`/`disconnected`). */
  readonly errorState: boolean;
}

export const AGS_MCP_STATUS_METADATA: Readonly<
  Record<AgsMcpStatus, AgsMcpStatusMetadata>
> = {
  pending: {
    label: "Pending",
    description:
      "MCP server is being negotiated — connection handshake in progress. Tool dispatch waits or fails fast.",
    dispatchable: false,
    errorState: false,
  },
  connected: {
    label: "Connected",
    description:
      "MCP server is healthy and ready — tools registered via this server are dispatchable.",
    dispatchable: true,
    errorState: false,
  },
  disconnected: {
    label: "Disconnected",
    description:
      "MCP server lost its connection — reconnection attempts may be in flight. Tools are unavailable until reconnect.",
    dispatchable: false,
    errorState: true,
  },
  error: {
    label: "Error",
    description:
      "MCP server handshake or runtime threw an unrecoverable error — operator must investigate; auto-reconnect won't help.",
    dispatchable: false,
    errorState: true,
  },
};

export function getAgsMcpStatusMetadata(
  status: AgsMcpStatus,
): AgsMcpStatusMetadata {
  return AGS_MCP_STATUS_METADATA[status];
}

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

// ============================================================================
// Per-effort-level operator-facing metadata (T-S.13)
// ============================================================================

export interface AgsEffortLevelMetadata {
  /** Display label rendered in the agent reasoning-effort picker. */
  readonly label: string;
  /** Short operator-facing description of what this effort level
   *  buys the agent. */
  readonly description: string;
  /** Stable rank 0-3 for effort comparison (0=low / 3=max). */
  readonly rank: 0 | 1 | 2 | 3;
  /** Whether this level expects to invoke higher-cost reasoning
   *  modes (true for high / max). */
  readonly highCost: boolean;
}

export const AGS_EFFORT_LEVEL_METADATA: Readonly<
  Record<AgsEffortLevel, AgsEffortLevelMetadata>
> = {
  low: {
    label: "Low",
    description:
      "Fast, cheap reasoning — short chain of thought, minimal exploration. Best for quick lookups.",
    rank: 0,
    highCost: false,
  },
  medium: {
    label: "Medium",
    description:
      "Balanced reasoning — moderate exploration with reasonable budget. Default for typical agent tasks.",
    rank: 1,
    highCost: false,
  },
  high: {
    label: "High",
    description:
      "Deep reasoning — extended chain of thought, multi-step exploration. Used for complex analysis.",
    rank: 2,
    highCost: true,
  },
  max: {
    label: "Max",
    description:
      "Maximum reasoning effort — full budget, deep exploration, longest latency. Used for the hardest questions.",
    rank: 3,
    highCost: true,
  },
};

export function getAgsEffortLevelMetadata(
  level: AgsEffortLevel,
): AgsEffortLevelMetadata {
  return AGS_EFFORT_LEVEL_METADATA[level];
}

/** Memory scope (filesystem-based, per openllm `AgentDefinition.memory`). */
export const AGS_MEMORY_SCOPES = ["user", "project", "local"] as const;
export type AgsMemoryScope = (typeof AGS_MEMORY_SCOPES)[number];

// ============================================================================
// Per-memory-scope operator-facing metadata (T-S.16)
// ============================================================================

export interface AgsMemoryScopeMetadata {
  /** Display label rendered in the memory-scope picker. */
  readonly label: string;
  /** Short operator-facing description of where the memory lives. */
  readonly description: string;
  /** Whether the memory is shared across projects (true for `user`
   *  only). */
  readonly crossProject: boolean;
  /** Whether the memory survives `git clone` (true for user/project;
   *  false for local because local is typically gitignored). */
  readonly survivesClone: boolean;
}

export const AGS_MEMORY_SCOPE_METADATA: Readonly<
  Record<AgsMemoryScope, AgsMemoryScopeMetadata>
> = {
  user: {
    label: "User",
    description:
      "User-level memory in `~/.claude/projects/*` — shared across every project the user works on.",
    crossProject: true,
    survivesClone: true,
  },
  project: {
    label: "Project",
    description:
      "Project-level memory checked into the repo — shared across the team via `git`.",
    crossProject: false,
    survivesClone: true,
  },
  local: {
    label: "Local",
    description:
      "Local-only memory not checked in (typically gitignored) — operator-specific overrides that don't ship to teammates.",
    crossProject: false,
    survivesClone: false,
  },
};

export function getAgsMemoryScopeMetadata(
  scope: AgsMemoryScope,
): AgsMemoryScopeMetadata {
  return AGS_MEMORY_SCOPE_METADATA[scope];
}

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

// ============================================================================
// Per-invocation-kind operator-facing metadata (T-S.17)
// ============================================================================

export interface AgsToolInvocationKindMetadata {
  /** Display label rendered in the tool catalog. */
  readonly label: string;
  /** Short operator-facing description of how the kind invokes. */
  readonly description: string;
  /** Whether this kind is user-creatable via the catalog API
   *  (true for shell/http/mcp_ref; false for `builtin`). */
  readonly userCreatable: boolean;
  /** Whether the invocation crosses a network/process boundary
   *  (true for shell/http; false for mcp_ref/builtin which stay in
   *  the existing MCP dispatcher path / in-process). */
  readonly crossesNetworkBoundary: boolean;
}

export const AGS_TOOL_INVOCATION_KIND_METADATA: Readonly<
  Record<AgsToolInvocationKind, AgsToolInvocationKindMetadata>
> = {
  shell: {
    label: "Shell",
    description:
      "Spawns argv via child_process.spawn — sandboxed env, hard timeout, refuses to run without a working directory.",
    userCreatable: true,
    crossesNetworkBoundary: true,
  },
  http: {
    label: "HTTP",
    description:
      "Fetch POST/GET against a URL with headers from invocationConfig — outbound HTTP call.",
    userCreatable: true,
    crossesNetworkBoundary: true,
  },
  mcp_ref: {
    label: "MCP Reference",
    description:
      "Proxy to an existing MCP-discovered tool (serverId + toolName) — useful for renaming or wrapping an MCP tool.",
    userCreatable: true,
    crossesNetworkBoundary: false,
  },
  builtin: {
    label: "Builtin",
    description:
      "Reserved — refers to one of the static built-in tools. Used by the merged catalog adapter; not user-creatable via the API.",
    userCreatable: false,
    crossesNetworkBoundary: false,
  },
};

export function getAgsToolInvocationKindMetadata(
  kind: AgsToolInvocationKind,
): AgsToolInvocationKindMetadata {
  return AGS_TOOL_INVOCATION_KIND_METADATA[kind];
}

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

// ============================================================================
// Per-skill-source operator-facing metadata (T-S.18)
// ============================================================================

export interface AgsSkillSourceMetadata {
  /** Display label rendered in the skill catalog source filter. */
  readonly label: string;
  /** Short operator-facing description of where the skill came from. */
  readonly description: string;
  /** Whether the skill row is user-editable from the catalog UI
   *  (true for `db` only — the others are read-only). */
  readonly editable: boolean;
  /** Whether the skill is sourced from outside the local DB (true for
   *  imported/vendored/marketplace/mcp_prompt; false for `db`). */
  readonly external: boolean;
}

export const AGS_SKILL_SOURCE_METADATA: Readonly<
  Record<AgsSkillSource, AgsSkillSourceMetadata>
> = {
  db: {
    label: "Database",
    description:
      "User-authored skill stored in the local database — fully editable via the catalog UI.",
    editable: true,
    external: false,
  },
  imported: {
    label: "Imported",
    description:
      "Skill imported from a file or upstream source — read-only mirror; edit the upstream source to update.",
    editable: false,
    external: true,
  },
  vendored: {
    label: "Vendored",
    description:
      "Skill packaged with the application binary — read-only; updates require a redeploy.",
    editable: false,
    external: true,
  },
  marketplace: {
    label: "Marketplace",
    description:
      "Skill installed from the marketplace — read-only; updates flow through marketplace publish.",
    editable: false,
    external: true,
  },
  mcp_prompt: {
    label: "MCP Prompt",
    description:
      "Prompt-style skill exposed by an attached MCP server — read-only; the MCP server owns the content.",
    editable: false,
    external: true,
  },
};

export function getAgsSkillSourceMetadata(
  source: AgsSkillSource,
): AgsSkillSourceMetadata {
  return AGS_SKILL_SOURCE_METADATA[source];
}

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

// ============================================================================
// Per-tool-category operator-facing metadata (T-S.19)
// ============================================================================

export interface AgsToolCategoryMetadata {
  /** Display label rendered in the tool catalog category filter. */
  readonly label: string;
  /** Short operator-facing description of what tools belong here. */
  readonly description: string;
  /** Whether tools in this category typically mutate system state
   *  (true for filesystem/communication/network; false for
   *  compute/search/custom which read or process). */
  readonly mutatesState: boolean;
  /** Whether the category is open-ended (true for `custom`; false
   *  for the 5 closed categories). */
  readonly openEnded: boolean;
}

export const AGS_TOOL_CATEGORY_METADATA: Readonly<
  Record<AgsToolCategory, AgsToolCategoryMetadata>
> = {
  filesystem: {
    label: "Filesystem",
    description:
      "Tools that read, write, or modify files — Read/Edit/Write/Glob and shell file operations.",
    mutatesState: true,
    openEnded: false,
  },
  compute: {
    label: "Compute",
    description:
      "Pure-computation tools — calculators, formatters, transformers. Do not touch external state.",
    mutatesState: false,
    openEnded: false,
  },
  communication: {
    label: "Communication",
    description:
      "Tools that send messages or interact with external services — Slack, email, GitHub PR comments.",
    mutatesState: true,
    openEnded: false,
  },
  network: {
    label: "Network",
    description:
      "Tools that issue network calls — HTTP fetches, gRPC clients, third-party API integrations.",
    mutatesState: true,
    openEnded: false,
  },
  search: {
    label: "Search",
    description:
      "Read-only tools that surface results from a backing index — search APIs, vector retrievers.",
    mutatesState: false,
    openEnded: false,
  },
  custom: {
    label: "Custom",
    description:
      "Catch-all category for user-authored tools that don't fit the closed taxonomy. Open-ended.",
    mutatesState: false,
    openEnded: true,
  },
};

export function getAgsToolCategoryMetadata(
  category: AgsToolCategory,
): AgsToolCategoryMetadata {
  return AGS_TOOL_CATEGORY_METADATA[category];
}
