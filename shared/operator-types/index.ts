/**
 * Operator Types — Shared Contract
 *
 * Defines all interfaces shared between:
 *   - Orchestrator (job dispatch)
 *   - Operators (plan generation)
 *   - Syscall Kernel (execution)
 *   - Governance (policy enforcement)
 *   - Audit (evidence logging)
 */

// ============================================================================
// Autonomy Tiers
// ============================================================================

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const AUTONOMY_TIERS: Record<AutonomyLevel, { label: string; description: string }> = {
  0: { label: "plan-only", description: "Generate plans, no execution" },
  1: { label: "local-artifacts", description: "Local file writes only" },
  2: { label: "dev-branch", description: "Dev branch commits allowed" },
  3: { label: "pr-creation", description: "Pull request creation allowed" },
  4: { label: "ci-trigger", description: "CI pipeline trigger allowed" },
  5: { label: "production", description: "Production deployment allowed" },
};

// ============================================================================
// Intent — User request
// ============================================================================

export interface Intent {
  intentId: string;
  description: string;
  context?: Record<string, unknown>;
  workspaceId?: number;
  requestedBy: string;
  autonomyLevel: AutonomyLevel;
  createdAt: string;
}

// ============================================================================
// Operator Constraints
// ============================================================================

export interface OperatorConstraints {
  maxSyscalls: number;
  allowedActions: string[];
  deniedActions: string[];
  maxTokens: number;
  temperature: number;
  autonomyLevel: AutonomyLevel;
  timeoutMs: number;
}

// ============================================================================
// Operator Job
// ============================================================================

export type OperatorName = "builder" | "auditor" | "governance" | "deploy";

export type JobStatus =
  | "pending"
  | "routing"
  | "generating"
  | "validating"
  | "executing"
  | "completed"
  | "failed"
  | "denied";

export interface OperatorJob {
  jobId: string;
  operator: OperatorName;
  intent: Intent;
  constraints: OperatorConstraints;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  traceId: string;
  result?: SyscallBatch | null;
  executionResult?: ExecutionResult | null;
  error?: string | null;
}

// ============================================================================
// Syscall — Single atomic action
// ============================================================================

export type SyscallAction =
  | "fs.write"
  | "fs.read"
  | "fs.delete"
  | "fs.mkdir"
  | "git.commit"
  | "git.push"
  | "git.branch"
  | "git.pr"
  | "db.query"
  | "db.insert"
  | "db.update"
  | "db.delete"
  | "ci.trigger"
  | "ci.status"
  | "artifact.generate"
  | "artifact.upload"
  | "workflow.trigger"
  | "notification.send";

export interface Syscall {
  action: SyscallAction;
  args: Record<string, unknown>;
  description: string;
  riskLevel: "low" | "medium" | "high";
  requiredAutonomyLevel: AutonomyLevel;
}

// ============================================================================
// Syscall Batch — Operator output
// ============================================================================

export interface SyscallBatch {
  jobId: string;
  operator: OperatorName;
  plan: Syscall[];
  explain: string;
  risk: {
    level: "low" | "medium" | "high";
    reasoning: string;
  };
  generatedAt: string;
  modelUsed: string;
  providerUsed: string;
}

// ============================================================================
// Governance Verdict
// ============================================================================

export type GovernanceVerdict = "allow" | "deny" | "escalate";

export interface GovernanceDecision {
  verdict: GovernanceVerdict;
  reason: string;
  policyRef: string;
  evaluatedAt: string;
  syscallIndex: number;
  action: SyscallAction;
}

// ============================================================================
// Execution Result
// ============================================================================

export type SyscallResultStatus = "success" | "failed" | "denied" | "skipped";

export interface SyscallResult {
  syscallIndex: number;
  action: SyscallAction;
  status: SyscallResultStatus;
  governanceDecision: GovernanceDecision;
  output?: unknown;
  error?: string;
  durationMs: number;
  executedAt: string;
}

export interface ExecutionResult {
  jobId: string;
  operator: OperatorName;
  results: SyscallResult[];
  totalDurationMs: number;
  completedAt: string;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    denied: number;
    skipped: number;
  };
}

// ============================================================================
// Provider Hub Request/Response
// ============================================================================

export interface ProviderHubRequest {
  operator: OperatorName;
  jobId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
  responseFormat: "json";
  traceId: string;
  /**
   * PMB Phase 29.5 — workspace context required for the workspace-default
   * `classifier` binding lookup. Without it, callProviderHub throws
   * `OperatorBindingError("workspace_required")`. The orchestrator threads
   * this from `job.intent.workspaceId` (which is itself optional on
   * `Intent` — operators that can't resolve a workspace cannot call the
   * hub at all post-29.5).
   */
  workspaceId: number;
}

export interface ProviderHubResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed: number;
  latencyMs: number;
  traceId: string;
  fallbackUsed: boolean;
}

// ============================================================================
// Operator Capability Matrix
// ============================================================================

export interface OperatorCapability {
  operator: OperatorName;
  allowedActions: SyscallAction[];
  deniedActions: SyscallAction[];
  maxAutonomyLevel: AutonomyLevel;
  canExecute: boolean;
  description: string;
}

export const OPERATOR_CAPABILITIES: Record<OperatorName, OperatorCapability> = {
  builder: {
    operator: "builder",
    allowedActions: [
      "fs.write", "fs.read", "fs.delete", "fs.mkdir",
      "git.commit", "git.push", "git.branch", "git.pr",
      "artifact.generate", "artifact.upload",
      "db.query", "db.insert", "db.update",
    ],
    deniedActions: ["ci.trigger", "ci.status"],
    maxAutonomyLevel: 3,
    canExecute: false,
    description: "Generates code, files, and artifacts. Commits to dev branches and creates PRs.",
  },
  auditor: {
    operator: "auditor",
    allowedActions: [
      "fs.read", "db.query", "artifact.generate",
    ],
    deniedActions: [
      "fs.write", "fs.delete", "fs.mkdir",
      "git.commit", "git.push", "git.branch", "git.pr",
      "db.insert", "db.update", "db.delete",
      "ci.trigger", "ci.status",
      "artifact.upload", "workflow.trigger", "notification.send",
    ],
    maxAutonomyLevel: 1,
    canExecute: false,
    description: "Read-only auditing. Scans code, queries data, generates reports.",
  },
  governance: {
    operator: "governance",
    allowedActions: [
      "fs.read", "db.query", "artifact.generate", "notification.send",
    ],
    deniedActions: [
      "fs.write", "fs.delete", "fs.mkdir",
      "git.commit", "git.push", "git.branch", "git.pr",
      "db.insert", "db.update", "db.delete",
      "ci.trigger", "ci.status", "artifact.upload", "workflow.trigger",
    ],
    maxAutonomyLevel: 0,
    canExecute: false,
    description: "Policy evaluation and compliance checking. Read-only with notification capability.",
  },
  deploy: {
    operator: "deploy",
    allowedActions: [
      "fs.read", "git.branch", "git.pr", "git.push",
      "ci.trigger", "ci.status",
      "artifact.generate", "artifact.upload",
      "workflow.trigger", "notification.send",
    ],
    deniedActions: [
      "fs.write", "fs.delete", "fs.mkdir",
      "git.commit",
      "db.insert", "db.update", "db.delete",
    ],
    maxAutonomyLevel: 5,
    canExecute: false,
    description: "Deployment orchestration. Creates PRs, triggers CI, manages releases.",
  },
};

// ============================================================================
// Routing Rules
// ============================================================================

export interface IntentRoutingRule {
  keywords: string[];
  operator: OperatorName;
  priority: number;
}

export const INTENT_ROUTING_RULES: IntentRoutingRule[] = [
  { keywords: ["audit", "scan", "review", "check", "inspect", "analyze"], operator: "auditor", priority: 1 },
  { keywords: ["policy", "compliance", "governance", "rule", "enforce"], operator: "governance", priority: 2 },
  { keywords: ["deploy", "release", "pr", "pipeline", "ci", "cd", "ship"], operator: "deploy", priority: 3 },
  { keywords: ["generate", "build", "implement", "create", "write", "code", "fix", "refactor"], operator: "builder", priority: 4 },
];
