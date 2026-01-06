import type { PolicySnapshot } from "../types";
import crypto from "crypto";

/**
 * Policy Registry
 * Phase 2: Orchestrator Runtime - Policy Management
 * 
 * Manages policy snapshots, hot reload, and agent invalidation
 */

export class PolicyRegistry {
  private snapshots: Map<string, PolicySnapshot> = new Map();
  private invalidatedAgents: Map<number, { reason: string; at: Date }> = new Map();

  /**
   * Store policy snapshot
   */
  storeSnapshot(policySet: string, hash: string, bundle: any): void {
    const snapshot: PolicySnapshot = {
      policySet,
      version: `${Date.now()}`,
      hash,
      bundle,
      revokedSigners: [],
      invalidatedAgents: Array.from(this.invalidatedAgents.keys()),
      loadedAt: new Date(),
    };

    this.snapshots.set(policySet, snapshot);
  }

  /**
   * Get current policy snapshot
   */
  getSnapshot(policySet: string): PolicySnapshot | null {
    return this.snapshots.get(policySet) || null;
  }

  /**
   * Hot reload policy bundle
   * Atomically swaps policy and returns old/new hash
   */
  hotReload(policySet: string, bundle: any): { oldHash: string; newHash: string } {
    const oldSnapshot = this.snapshots.get(policySet);
    const oldHash = oldSnapshot?.hash || "none";

    // Compute new hash
    const newHash = crypto.createHash("sha256").update(JSON.stringify(bundle)).digest("hex");

    // Store new snapshot
    this.storeSnapshot(policySet, newHash, bundle);

    return { oldHash, newHash };
  }

  /**
   * Invalidate agents
   * Mark agents as GOVERNED_INVALIDATED with reason
   */
  invalidateAgents(agentIds: number[], reason: string): void {
    const timestamp = new Date();
    
    for (const agentId of agentIds) {
      this.invalidatedAgents.set(agentId, {
        reason,
        at: timestamp,
      });
    }

    // Update all snapshots with new invalidated agents list
    for (const [policySet, snapshot] of this.snapshots.entries()) {
      snapshot.invalidatedAgents = Array.from(this.invalidatedAgents.keys());
    }
  }

  /**
   * Clear invalidation for agent
   */
  clearInvalidation(agentId: number): void {
    this.invalidatedAgents.delete(agentId);

    // Update all snapshots
    for (const [policySet, snapshot] of this.snapshots.entries()) {
      snapshot.invalidatedAgents = Array.from(this.invalidatedAgents.keys());
    }
  }

  /**
   * Check if agent is invalidated
   */
  isInvalidated(agentId: number): boolean {
    return this.invalidatedAgents.has(agentId);
  }

  /**
   * Get invalidation reason
   */
  getInvalidationReason(agentId: number): { reason: string; at: Date } | null {
    return this.invalidatedAgents.get(agentId) || null;
  }

  /**
   * Add revoked signer to all snapshots
   */
  addRevokedSigner(authority: string): void {
    for (const [policySet, snapshot] of this.snapshots.entries()) {
      if (!snapshot.revokedSigners.includes(authority)) {
        snapshot.revokedSigners.push(authority);
      }
    }
  }

  /**
   * Remove revoked signer from all snapshots
   */
  removeRevokedSigner(authority: string): void {
    for (const [policySet, snapshot] of this.snapshots.entries()) {
      snapshot.revokedSigners = snapshot.revokedSigners.filter((s) => s !== authority);
    }
  }

  /**
   * Get all policy sets
   */
  getPolicySets(): string[] {
    return Array.from(this.snapshots.keys());
  }

  /**
   * Clear all snapshots (for testing)
   */
  clear(): void {
    this.snapshots.clear();
    this.invalidatedAgents.clear();
  }
}

// Singleton instance
let _policyRegistry: PolicyRegistry | null = null;

export function getPolicyRegistry(): PolicyRegistry {
  if (!_policyRegistry) {
    _policyRegistry = new PolicyRegistry();
  }
  return _policyRegistry;
}
