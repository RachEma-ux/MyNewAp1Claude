/**
 * Canonical Agent Schema
 * 
 * This is the single source of truth for agent structure.
 * The wizard is a compiler: inputs → canonical Agent → validate → admit
 */

import { z } from "zod";

// ============================================================================
// ENUMS
// ============================================================================

export const AgentOriginType = z.enum([
  "template",      // Created from pre-built template
  "scratch",       // Manual configuration
  "clone",         // Forked from existing agent
  "workflow",      // Generated from workflow automation
  "conversation",  // Extracted from conversation intent
  "event",         // Created from event trigger
  "import",        // Imported from JSON/YAML spec
]);

export type AgentOriginType = z.infer<typeof AgentOriginType>;

export const AgentLifecycleState = z.enum([
  "draft",         // Work in progress, not yet admitted
  "sandbox",       // Admitted to sandbox environment (testing)
  "governed",      // Promoted to production with policy proof
  "disabled",      // Explicitly disabled (terminal state)
]);

export type AgentLifecycleState = z.infer<typeof AgentLifecycleState>;

export const AgentTriggerType = z.enum([
  "manual",        // User-initiated only
  "workflow",      // Triggered by workflow step
  "event",         // Triggered by event
  "schedule",      // Cron-based schedule
  "none",          // No automatic triggers
]);

export type AgentTriggerType = z.infer<typeof AgentTriggerType>;

export const AgentDiffMode = z.enum([
  "structured",    // Field-by-field comparison
  "side-by-side",  // Full JSON side-by-side
]);

export type AgentDiffMode = z.infer<typeof AgentDiffMode>;

export const PolicyImpactStatus = z.enum([
  "allow",         // Policy allows this configuration
  "warn",          // Policy warns but allows
  "deny",          // Policy blocks this configuration
  "locked",        // Field is locked by policy
  "mutated",       // Policy auto-adjusted this value
]);

export type PolicyImpactStatus = z.infer<typeof PolicyImpactStatus>;

export const AgentRoleClass = z.enum([
  "assistant",     // General-purpose assistant
  "analyst",       // Data analysis and insights
  "support",       // Customer support
  "reviewer",      // Code/content review
  "automator",     // Task automation
  "monitor",       // System monitoring
  "custom",        // Custom role
]);

export type AgentRoleClass = z.infer<typeof AgentRoleClass>;

// ============================================================================
// CORE SCHEMAS
// ============================================================================

/**
 * Agent Identity
 */
export const AgentIdentity = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(2000),
  tags: z.array(z.string()).default([]),
  roleClass: AgentRoleClass,
});

export type AgentIdentity = z.infer<typeof AgentIdentity>;

/**
 * LLM Configuration
 */
export const AgentLLMConfig = z.object({
  provider: z.string(), // e.g., "openai", "anthropic"
  model: z.string(),    // e.g., "gpt-4", "claude-3"
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
});

export type AgentLLMConfig = z.infer<typeof AgentLLMConfig>;

/**
 * Agent Capabilities (Tools & Actions)
 */
export const AgentCapabilities = z.object({
  tools: z.array(z.string()).default([]), // Tool IDs
  actions: z.array(z.string()).default([]), // Action IDs
  allowExternalWrite: z.boolean().default(false),
  allowDataAccess: z.boolean().default(false),
});

export type AgentCapabilities = z.infer<typeof AgentCapabilities>;

/**
 * Agent Memory Configuration
 */
export const AgentMemory = z.object({
  mode: z.enum(["stateless", "session", "persistent"]).default("stateless"),
  scope: z.enum(["user", "workspace", "global"]).optional(),
  retentionDays: z.number().int().positive().optional(),
});

export type AgentMemory = z.infer<typeof AgentMemory>;

/**
 * Agent Triggers
 */
export const AgentTrigger = z.object({
  type: AgentTriggerType,
  workflowId: z.string().optional(),
  eventSource: z.string().optional(),
  schedule: z.string().optional(), // Cron expression
  conditions: z.record(z.any()).optional(),
});

export type AgentTrigger = z.infer<typeof AgentTrigger>;

/**
 * Agent Limits & Constraints
 */
export const AgentLimits = z.object({
  // Rate limits
  maxRequestsPerMinute: z.number().int().positive().optional(),
  maxRequestsPerHour: z.number().int().positive().optional(),
  maxRequestsPerDay: z.number().int().positive().optional(),
  
  // Cost limits
  maxCostPerRequest: z.number().positive().optional(),
  maxCostPerDay: z.number().positive().optional(),
  maxCostPerMonth: z.number().positive().optional(),
  
  // Execution limits
  maxExecutionTimeSeconds: z.number().int().positive().default(300),
  maxRetries: z.number().int().nonnegative().default(3),
  
  // Expiry
  expiresAt: z.string().datetime().optional(), // ISO 8601
});

export type AgentLimits = z.infer<typeof AgentLimits>;

/**
 * Agent Anatomy (Core Behavior)
 */
export const AgentAnatomy = z.object({
  systemPrompt: z.string().min(1),
  llm: AgentLLMConfig,
  capabilities: AgentCapabilities,
  memory: AgentMemory,
  constraints: z.record(z.any()).optional(),
});

export type AgentAnatomy = z.infer<typeof AgentAnatomy>;

/**
 * Policy Context (for validation)
 */
export const PolicyContext = z.object({
  policyDigest: z.string(), // SHA-256 of policy bundle
  policySetHash: z.string(), // Hash of effective policy set
  evaluatedAt: z.string().datetime(),
  violations: z.array(z.object({
    policyId: z.string(),
    message: z.string(),
    severity: z.enum(["error", "warning"]),
    runbookUrl: z.string().url().optional(),
  })).default([]),
  warnings: z.array(z.object({
    policyId: z.string(),
    message: z.string(),
    runbookUrl: z.string().url().optional(),
  })).default([]),
  lockedFields: z.array(z.string()).default([]),
  mutations: z.array(z.object({
    field: z.string(),
    oldValue: z.any(),
    newValue: z.any(),
    reason: z.string(),
  })).default([]),
});

export type PolicyContext = z.infer<typeof PolicyContext>;

/**
 * Agent Lifecycle Metadata
 */
export const AgentLifecycle = z.object({
  state: AgentLifecycleState,
  version: z.number().int().positive().default(1), // Increments on fork/promote
  origin: AgentOriginType,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string(), // User ID
  promotedAt: z.string().datetime().optional(),
  promotedBy: z.string().optional(),
  disabledAt: z.string().datetime().optional(),
  disabledBy: z.string().optional(),
  disabledReason: z.string().optional(),
});

export type AgentLifecycle = z.infer<typeof AgentLifecycle>;

/**
 * Governance Proof (for governed agents)
 */
export const GovernanceProof = z.object({
  proofHash: z.string(), // SHA-256 of proof bundle
  policyDigest: z.string(),
  policySetHash: z.string(),
  specHash: z.string(), // Hash of agent spec at promotion time
  signature: z.string(),
  timestamp: z.string().datetime(),
  approvedBy: z.array(z.string()).optional(), // Approver user IDs
});

export type GovernanceProof = z.infer<typeof GovernanceProof>;

// ============================================================================
// CANONICAL AGENT SCHEMA
// ============================================================================

/**
 * Draft Agent (partial schema for work-in-progress)
 */
export const DraftAgent = z.object({
  id: z.string().optional(),
  identity: AgentIdentity.partial(),
  anatomy: AgentAnatomy.partial(),
  trigger: AgentTrigger.optional(),
  limits: AgentLimits.partial(),
  lifecycle: AgentLifecycle.partial(),
});

export type DraftAgent = z.infer<typeof DraftAgent>;

/**
 * Sandbox Agent (full schema, admitted to sandbox)
 */
export const SandboxAgent = z.object({
  id: z.string(),
  identity: AgentIdentity,
  anatomy: AgentAnatomy,
  trigger: AgentTrigger.optional(),
  limits: AgentLimits,
  lifecycle: AgentLifecycle,
  policyContext: PolicyContext.optional(),
});

export type SandboxAgent = z.infer<typeof SandboxAgent>;

/**
 * Governed Agent (promoted to production with proof)
 */
export const GovernedAgent = SandboxAgent.extend({
  governanceProof: GovernanceProof,
});

export type GovernedAgent = z.infer<typeof GovernedAgent>;

/**
 * Canonical Agent (union of all states)
 */
export const CanonicalAgent = z.discriminatedUnion("lifecycle.state", [
  DraftAgent.extend({ lifecycle: z.object({ state: z.literal("draft") }).passthrough() }),
  SandboxAgent.extend({ lifecycle: z.object({ state: z.literal("sandbox") }).passthrough() }),
  GovernedAgent.extend({ lifecycle: z.object({ state: z.literal("governed") }).passthrough() }),
  SandboxAgent.extend({ lifecycle: z.object({ state: z.literal("disabled") }).passthrough() }),
]);

export type CanonicalAgent = z.infer<typeof CanonicalAgent>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Compute spec hash for tamper detection
 */
export function computeSpecHash(agent: SandboxAgent | GovernedAgent): string {
  const spec = {
    identity: agent.identity,
    anatomy: agent.anatomy,
    trigger: agent.trigger,
    limits: agent.limits,
  };
  // In production, use crypto.subtle.digest
  return `sha256:${JSON.stringify(spec)}`;
}

/**
 * Increment version on fork/promote
 */
export function incrementVersion(currentVersion: number): number {
  return currentVersion + 1;
}

/**
 * Check if agent is governed
 */
export function isGoverned(agent: CanonicalAgent): agent is GovernedAgent {
  return agent.lifecycle.state === "governed";
}

/**
 * Check if agent is sandbox
 */
export function isSandbox(agent: CanonicalAgent): agent is SandboxAgent {
  return agent.lifecycle.state === "sandbox";
}

/**
 * Check if agent is draft
 */
export function isDraft(agent: CanonicalAgent): agent is DraftAgent {
  return agent.lifecycle.state === "draft";
}
