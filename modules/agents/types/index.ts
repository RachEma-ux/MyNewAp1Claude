/**
 * Agent Governance Module - Domain Types
 * 
 * Defines core types for sandbox and governed agents with cryptographic proofs.
 */

// ============================================================================
// Governance Status
// ============================================================================

export type GovernanceStatus =
  | "SANDBOX"                    // Experimental agent, not production-ready
  | "GOVERNED_VALID"             // Governed agent with valid proof
  | "GOVERNED_RESTRICTED"        // Governed but with restrictions
  | "GOVERNED_INVALIDATED";      // Governed but invalidated by policy update

// ============================================================================
// Agent Anatomy (MVA - Minimum Viable Anatomy)
// ============================================================================

export interface AgentAnatomy {
  reasoning: {
    type: "llm" | "rules" | "hybrid";
    model: string;
    temperature: number;
  };
  inputs: string[];
  actions: Array<{
    type: string;
    side_effects: boolean;
  }>;
  memory: {
    short_term: boolean;
    long_term: boolean;
  };
}

// ============================================================================
// Sandbox Constraints
// ============================================================================

export interface SandboxConstraints {
  external_calls: boolean;
  persistent_writes: boolean;
  max_cost_usd: number;
  auto_expiry_hours: number;
}

// ============================================================================
// Local Constraints
// ============================================================================

export interface LocalConstraints {
  max_steps: number;
}

// ============================================================================
// Governance Configuration
// ============================================================================

export interface GovernanceConfig {
  policy_set: string;
  capabilities: string[];
  economics: {
    monthly_budget_usd: number;
    rate_limit_per_min: number;
  };
}

// ============================================================================
// Cryptographic Proof Bundle (MVPf - Minimum Viable Proof)
// ============================================================================

export interface ProofBundle {
  policy_decision: "PASS" | "FAIL";
  policy_hash: string;           // sha256:...
  spec_hash: string;             // sha256:...
  signature: {
    authority: string;           // Signing key ID
    signed_at: string;           // ISO 8601 timestamp
    sig: string;                 // Base64-encoded signature
  };
}

// ============================================================================
// Agent Spec - Sandbox (MVA only)
// ============================================================================

export interface AgentSpecSandbox {
  mode: "sandbox";
  agent: {
    name: string;
    version: string;
    description: string;
    role_class: "compliance" | "analysis" | "ideation";
    anatomy: AgentAnatomy;
  };
  local_constraints: LocalConstraints;
  sandbox_constraints: SandboxConstraints;
}

// ============================================================================
// Agent Spec - Governed (MVA + MVPf)
// ============================================================================

export interface AgentSpecGoverned {
  mode: "governed";
  agent: {
    name: string;
    version: string;
    description: string;
    role_class: "compliance" | "analysis" | "ideation";
    anatomy: AgentAnatomy;
  };
  local_constraints: LocalConstraints;
  governance: GovernanceConfig;
  proof: ProofBundle;
}

// ============================================================================
// Union Type for All Agent Specs
// ============================================================================

export type AgentSpec = AgentSpecSandbox | AgentSpecGoverned;

// ============================================================================
// Workspace Configuration
// ============================================================================

export interface WorkspaceConfig {
  workspaceId: string;
  name: string;
  env: "dev" | "staging" | "prod";
  
  agentsRuntime: {
    mode: "embedded" | "external";
    
    embedded: {
      enabled: boolean;
      admissionInterceptor: boolean;
      policyHotReload: boolean;
    };
    
    external: {
      enabled: boolean;
      baseUrl: string;
      apiKeyRef: string;
      timeoutsMs: {
        connect: number;
        request: number;
      };
      retry: {
        maxAttempts: number;
        backoffMs: number;
      };
      tls: {
        verify: boolean;
        caCertPemRef: string;
      };
    };
  };
  
  signing: {
    mode: "workspace" | "org" | "external";
    workspaceSigner?: {
      authorityId: string;
      keyRef: string;
    };
    externalSigner?: {
      enabled: boolean;
      baseUrl: string;
      apiKeyRef: string;
    };
  };
  
  policy: {
    policySet: string;
    hotReload: {
      enabled: boolean;
      revalidateOnUpdate: boolean;
      defaultOnMismatch: "invalidate" | "restrict" | "deny-start";
    };
  };
  
  sandbox: {
    enabled: boolean;
    autoExpiryHours: number;
    maxCostUsd: number;
    denyExternalCalls: boolean;
    denyPersistentWrites: boolean;
  };
  
  economics: {
    enabled: boolean;
    workspaceMonthlyBudgetUsd: number;
    defaultAgentMonthlyBudgetUsd: number;
    rateLimitPerMin: number;
  };
}

// ============================================================================
// Interceptor Decision
// ============================================================================

export interface InterceptorDecision {
  allow: boolean;
  deny?: boolean;
  restrict?: boolean;
  reasons?: string[];
  errorCodes?: string[];
}

// ============================================================================
// Policy Snapshot
// ============================================================================

export interface PolicySnapshot {
  policySet: string;
  policyHash: string;
  loadedAt: string;
  revokedSigners: string[];
  invalidatedAgents: Record<string, {
    reason: string;
    at: string;
  }>;
}

// ============================================================================
// Promotion Request (OPA Input Shape)
// ============================================================================

export interface PromotionRequest {
  request: {
    kind: "promote";
    actor: {
      id: string;
      role: "agent_admin" | "policy_admin" | "viewer";
    };
    org_limits: {
      max_monthly_budget_usd: number;
    };
  };
  mode: "sandbox";
  agent: AgentSpecSandbox["agent"];
  sandbox_constraints: SandboxConstraints;
  governance: GovernanceConfig;
}

// ============================================================================
// Promotion Result
// ============================================================================

export interface PromotionResult {
  success: boolean;
  denies: string[];
  governedAgent?: AgentSpecGoverned;
}

// ============================================================================
// Agent Status
// ============================================================================

export interface AgentStatus {
  agentId: string;
  status: "RUNNING" | "STOPPED" | "STARTING" | "ERROR";
  governanceStatus: GovernanceStatus;
  reason?: string;
  lastDecision?: {
    decision: "allow" | "deny" | "restrict";
    at: string;
  };
}

// ============================================================================
// Error Codes for Admission Control
// ============================================================================

export const ErrorCodes = {
  SANDBOX_EXPIRED: "SANDBOX_EXPIRED",
  SANDBOX_EXTERNAL_CALLS_BLOCKED: "SANDBOX_EXTERNAL_CALLS_BLOCKED",
  SANDBOX_PERSISTENT_WRITES_BLOCKED: "SANDBOX_PERSISTENT_WRITES_BLOCKED",
  CONTAINMENT_VIOLATION: "CONTAINMENT_VIOLATION",
  PROOF_MISSING: "PROOF_MISSING",
  SPEC_HASH_MISMATCH: "SPEC_HASH_MISMATCH",
  POLICY_HASH_MISMATCH: "POLICY_HASH_MISMATCH",
  SIGNER_REVOKED: "SIGNER_REVOKED",
  SIGNATURE_INVALID: "SIGNATURE_INVALID",
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
