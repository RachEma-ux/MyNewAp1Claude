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

export const AGS_AGENT_CLASSES = [
  "assistant",
  "specialist",
  "orchestrator",
  "automation",
  "researcher",
  "auditor",
] as const;
export type AgsAgentClass = (typeof AGS_AGENT_CLASSES)[number];

export const AGS_AUTONOMY_LEVELS = [
  "manual",
  "supervised",
  "semi_autonomous",
  "autonomous",
] as const;
export type AgsAutonomyLevel = (typeof AGS_AUTONOMY_LEVELS)[number];

export const AGS_ENVIRONMENTS = [
  "draft",
  "sandbox",
  "staging",
  "production",
] as const;
export type AgsEnvironment = (typeof AGS_ENVIRONMENTS)[number];

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
export const AGS_MCP_TRANSPORTS = ["stdio", "sse", "http", "sdk"] as const;
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
