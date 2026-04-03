/**
 * Code Studio — Constants and Enums
 */

export const JOB_STATUSES = [
  "draft",
  "queued",
  "preparing_workspace",
  "starting_session",
  "planning",
  "awaiting_approval",
  "building",
  "reviewing",
  "testing",
  "governance_check",
  "completed",
  "failed",
  "cancelled",
  "archived",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["queued", "cancelled"],
  queued: ["preparing_workspace", "cancelled", "failed"],
  preparing_workspace: ["starting_session", "failed", "cancelled"],
  starting_session: ["planning", "failed", "cancelled"],
  planning: ["awaiting_approval", "building", "failed", "cancelled"],
  awaiting_approval: ["building", "cancelled", "failed"],
  building: ["reviewing", "failed", "cancelled"],
  reviewing: ["testing", "failed", "cancelled"],
  testing: ["governance_check", "failed", "cancelled"],
  governance_check: ["completed", "failed", "cancelled"],
  completed: ["archived"],
  failed: ["queued"], // retry
  cancelled: [],
  archived: [],
};

export const AGENT_ROLES = [
  "coding-orchestrator",
  "planner",
  "builder",
  "reviewer",
  "tester",
  "governance",
  "explorer",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export const APPROVAL_DECISIONS = ["approved", "denied"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const APPROVAL_SCOPES = ["once", "session", "job", "repo_policy"] as const;
export type ApprovalScope = (typeof APPROVAL_SCOPES)[number];

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const WORKSPACE_STATUSES = ["active", "completed", "cleaning", "cleaned", "failed"] as const;

export const HANDOFF_DIRECTIONS = ["inbound", "outbound"] as const;

export const DIFF_TYPES = ["add", "modify", "delete"] as const;

export const DIFF_STATUSES = ["proposed", "approved", "applied", "reverted"] as const;

export const OPENCODE_DEFAULT_URL = "http://127.0.0.1:4096";
export const OPENCODE_DEFAULT_PORT = 4096;

// ── IDE Web Instances ────────────────────────────────────────────────────
export const IDE_INSTANCE_STATUSES = ["starting", "running", "stopping", "stopped", "failed", "expired"] as const;
export type IdeInstanceStatus = (typeof IDE_INSTANCE_STATUSES)[number];

export const OPENCODE_WEB_BASE_PORT = Number(process.env.OPENCODE_WEB_BASE_PORT) || 4200;
export const OPENCODE_WEB_MAX_PORT = Number(process.env.OPENCODE_WEB_MAX_PORT) || 4299;
export const OPENCODE_WEB_HOSTNAME = process.env.OPENCODE_WEB_HOSTNAME || "127.0.0.1";
export const OPENCODE_WEB_TTL_MINUTES = Number(process.env.OPENCODE_WEB_TTL_MINUTES) || 120;
export const OPENCODE_BINARY_PATH = process.env.OPENCODE_BINARY_PATH || "opencode";
