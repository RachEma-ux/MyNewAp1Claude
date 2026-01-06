/**
 * COMPREHENSIVE AGENT TYPE DEFINITION
 * Single source of truth for all agent-related types
 * Created from scratch with ALL required fields
 */

// ============================================================================
// ENUMS - Runtime constants + inferred types
// ============================================================================

// AgentLifecycleState
export const AgentLifecycleState = {
  DRAFT: "draft",
  SANDBOX: "sandbox",
  GOVERNED: "governed",
  DISABLED: "disabled",
} as const;
export type AgentLifecycleState = typeof AgentLifecycleState[keyof typeof AgentLifecycleState];

// AgentOrigin
export const AgentOrigin = {
  TEMPLATE: "template",
  SCRATCH: "scratch",
  CLONE: "clone",
  WORKFLOW: "workflow",
  CONVERSATION: "conversation",
  EVENT: "event",
  IMPORT: "import",
} as const;
export type AgentOrigin = typeof AgentOrigin[keyof typeof AgentOrigin];

// AgentMode
export const AgentMode = {
  SANDBOX: "sandbox",
  GOVERNED: "governed",
} as const;
export type AgentMode = typeof AgentMode[keyof typeof AgentMode];

// GovernanceStatus
export const GovernanceStatus = {
  SANDBOX: "SANDBOX",
  GOVERNED_VALID: "GOVERNED_VALID",
  GOVERNED_RESTRICTED: "GOVERNED_RESTRICTED",
  GOVERNED_INVALIDATED: "GOVERNED_INVALIDATED",
} as const;
export type GovernanceStatus = typeof GovernanceStatus[keyof typeof GovernanceStatus];

// AgentRoleClass
export const AgentRoleClass = {
  COMPLIANCE: "compliance",
  ANALYSIS: "analysis",
  IDEATION: "ideation",
  ASSISTANT: "assistant",
  ANALYST: "analyst",
  SUPPORT: "support",
  REVIEWER: "reviewer",
  AUTOMATOR: "automator",
  MONITOR: "monitor",
  CUSTOM: "custom",
} as const;
export type AgentRoleClass = typeof AgentRoleClass[keyof typeof AgentRoleClass];

// ============================================================================
// CORE AGENT TYPE - ALL FIELDS
// ============================================================================

export interface Agent {
  // Identity
  id: number;
  workspaceId: number;
  name: string;
  description: string | null;
  
  // Configuration
  systemPrompt: string;
  modelId: number | null;
  temperature: string;
  
  // Capabilities
  hasDocumentAccess: boolean;
  hasToolAccess: boolean;
  allowedTools: any | null; // JSON
  
  // Behavior
  maxIterations: number;
  autoSummarize: boolean;
  
  // Lifecycle & Governance
  lifecycleState: AgentLifecycleState;
  lifecycleVersion: number;
  origin: AgentOrigin;
  trigger: any | null; // JSON
  limits: any | null; // JSON
  anatomy: any | null; // JSON
  policyContext: any | null; // JSON
  
  // Governance (extended fields)
  mode?: AgentMode;
  governanceStatus?: GovernanceStatus;
  version?: string;
  roleClass?: AgentRoleClass;
  governance?: {
    economics?: {
      monthly_budget_usd?: number;
      rate_limit_per_min?: number;
    };
    security?: {
      allowed_domains?: string[];
      forbidden_actions?: string[];
    };
  };
  expiresAt?: string | null;
  proofId?: number | null;
  
  // Metadata
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// INSERT TYPE (for creating new agents)
// ============================================================================

export interface InsertAgent {
  workspaceId: number;
  name: string;
  description?: string | null;
  systemPrompt: string;
  modelId?: number | null;
  temperature?: string;
  hasDocumentAccess?: boolean;
  hasToolAccess?: boolean;
  allowedTools?: any | null;
  maxIterations?: number;
  autoSummarize?: boolean;
  lifecycleState?: AgentLifecycleState;
  lifecycleVersion?: number;
  origin?: AgentOrigin;
  trigger?: any | null;
  limits?: any | null;
  anatomy?: any | null;
  policyContext?: any | null;
  mode?: AgentMode;
  governanceStatus?: GovernanceStatus;
  version?: string;
  roleClass?: AgentRoleClass;
  governance?: any | null;
  expiresAt?: string | null;
  proofId?: number | null;
  createdBy: number;
}

// ============================================================================
// PARTIAL UPDATE TYPE
// ============================================================================

export type UpdateAgent = Partial<InsertAgent> & { id: number };

// ============================================================================
// AGENT WITH RELATIONS
// ============================================================================

export interface AgentWithRelations extends Agent {
  workspace?: {
    id: number;
    name: string;
  };
  model?: {
    id: number;
    name: string;
    provider: string;
  };
  creator?: {
    id: number;
    name: string;
  };
}

// ============================================================================
// AGENT HISTORY
// ============================================================================

export interface AgentHistory {
  id: number;
  agentId: number;
  version: number;
  snapshot: any; // JSON - full agent state
  changeType: "created" | "updated" | "promoted" | "demoted" | "disabled";
  changedBy: number;
  changedAt: string;
  changeReason: string | null;
}

// ============================================================================
// AGENT PROMOTION REQUEST
// ============================================================================

export interface PromotionRequest {
  id: number;
  agentId: number;
  requestedBy: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  justification: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// AGENT PROOF (for governed agents)
// ============================================================================

export interface AgentProof {
  id: number;
  agentId: number;
  policyVersion: string;
  policyHash: string;
  proofData: any; // JSON - OPA evaluation result
  signature: string | null;
  createdAt: string;
  expiresAt: string | null;
}
