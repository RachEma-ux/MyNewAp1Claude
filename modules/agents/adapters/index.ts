/**
 * Agent Governance Module - Adapter Interfaces
 * 
 * Defines interfaces for pluggable adapters (storage, policy, signing, runtime).
 */

import type {
  AgentSpec,
  AgentStatus,
  GovernanceStatus,
  PolicySnapshot,
  ProofBundle,
} from "../types";

// ============================================================================
// Agent Storage Adapter
// ============================================================================

export interface AgentStorageAdapter {
  /**
   * Create a new agent
   */
  createAgent(spec: AgentSpec): Promise<{ id: string }>;

  /**
   * Get agent by ID
   */
  getAgent(id: string): Promise<AgentSpec | null>;

  /**
   * List agents with filters
   */
  listAgents(workspaceId: string, filters?: {
    mode?: "sandbox" | "governed";
    status?: string;
    role_class?: string;
  }): Promise<Array<AgentSpec & { id: string }>>;

  /**
   * Update agent spec
   */
  updateAgent(id: string, updates: Partial<AgentSpec>): Promise<void>;

  /**
   * Delete agent
   */
  deleteAgent(id: string): Promise<void>;

  /**
   * Update governance status
   */
  updateGovernanceStatus(
    id: string,
    status: GovernanceStatus,
    reason?: string
  ): Promise<void>;
}

// ============================================================================
// Policy Storage Adapter
// ============================================================================

export interface PolicyStorageAdapter {
  /**
   * Store a policy version
   */
  storePolicy(
    policySet: string,
    version: string,
    bundle: unknown,
    hash: string
  ): Promise<void>;

  /**
   * Get policy by set and version
   */
  getPolicy(policySet: string, version?: string): Promise<{
    policySet: string;
    version: string;
    bundle: unknown;
    hash: string;
    loadedAt: string;
  } | null>;

  /**
   * Get current policy for a set
   */
  getCurrentPolicy(policySet: string): Promise<{
    policySet: string;
    version: string;
    bundle: unknown;
    hash: string;
    loadedAt: string;
  } | null>;

  /**
   * List policy versions
   */
  listPolicyVersions(policySet: string): Promise<Array<{
    version: string;
    hash: string;
    loadedAt: string;
  }>>;
}

// ============================================================================
// Signer Adapter
// ============================================================================

export interface SignerAdapter {
  /**
   * Sign a payload
   */
  sign(payload: unknown): Promise<{
    authority: string;
    signed_at: string;
    sig: string;
  }>;

  /**
   * Verify a signature
   */
  verify(payload: unknown, signature: {
    authority: string;
    signed_at: string;
    sig: string;
  }): Promise<boolean>;

  /**
   * Check if a signer is revoked
   */
  isRevoked(authority: string): Promise<boolean>;
}

// ============================================================================
// Orchestrator Runtime Adapter
// ============================================================================

export interface OrchestratorRuntime {
  /**
   * Start an agent
   */
  startAgent(
    workspaceId: string,
    agentId: string,
    spec: AgentSpec
  ): Promise<{ ok: boolean; error?: string }>;

  /**
   * Stop an agent
   */
  stopAgent(
    workspaceId: string,
    agentId: string,
    reason?: string
  ): Promise<{ ok: boolean }>;

  /**
   * Get agent status
   */
  getAgentStatus(
    workspaceId: string,
    agentId: string
  ): Promise<AgentStatus>;

  /**
   * List agent statuses
   */
  listAgentStatuses(
    workspaceId: string,
    options?: {
      limit?: number;
      cursor?: string;
    }
  ): Promise<{
    items: AgentStatus[];
    nextCursor?: string;
  }>;

  /**
   * Get policy snapshot
   */
  getPolicySnapshot(workspaceId: string): Promise<PolicySnapshot>;

  /**
   * Hot-reload policy
   */
  hotReloadPolicy(
    workspaceId: string,
    policySet: string,
    bundle: unknown,
    actor: { type: "human" | "system"; id: string; reason: string }
  ): Promise<{ ok: boolean }>;

  /**
   * Revalidate agents after policy update
   */
  revalidateAgents(
    workspaceId: string,
    agentIds?: string[]
  ): Promise<{
    ok: boolean;
    invalidated: string[];
    restricted: string[];
    valid: string[];
  }>;

  /**
   * Get governance explanation for an agent
   */
  getGovernanceExplanation(
    workspaceId: string,
    agentId: string
  ): Promise<{
    ok: boolean;
    agentId: string;
    governanceStatus: GovernanceStatus;
    policyHash?: string;
    reason?: string;
    since?: string;
  }>;
}
