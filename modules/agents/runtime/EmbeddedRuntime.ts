import type { OrchestratorRuntime, AgentSpec, PolicySnapshot, HotReloadResult, RevalidationResult } from "../types";
import { InterceptorChain } from "../interceptors/InterceptorChain";
import { AdmissionInterceptor } from "../interceptors/AdmissionInterceptor";
import { getPolicyRegistry } from "../services/PolicyRegistry";
import { fetchSnapshot, hotReload, revalidate } from "../../../server/services/policyService";

/**
 * Embedded Runtime
 * Phase 2: Orchestrator Runtime - Embedded Mode
 * 
 * Runs agents within the host application process with admission control
 */

export class EmbeddedRuntime implements OrchestratorRuntime {
  private interceptorChain: InterceptorChain;
  private admissionInterceptor: AdmissionInterceptor;
  private policyRegistry = getPolicyRegistry();
  private runningAgents: Map<number, { workspaceId: string; spec: AgentSpec }> = new Map();

  constructor() {
    // Initialize interceptor chain
    this.interceptorChain = new InterceptorChain();
    this.admissionInterceptor = new AdmissionInterceptor();
    this.interceptorChain.register(this.admissionInterceptor);
  }

  /**
   * Start agent with admission control
   */
  async startAgent(
    workspaceId: string,
    agentId: number,
    spec: AgentSpec
  ): Promise<{ success: boolean }> {
    // Get current policy snapshot
    const snapshot = await this.getPolicySnapshot(workspaceId);

    // Run admission interceptor chain
    const decision = await this.interceptorChain.execute({
      agent: spec,
      workspaceId,
      policyHash: snapshot.hash,
      timestamp: new Date(),
    });

    // Log decision
    console.log(`[EmbeddedRuntime] Admission decision for agent ${agentId}:`, {
      allow: decision.allow,
      deny: decision.deny,
      reasons: decision.reasons,
      errorCodes: decision.errorCodes,
    });

    // If denied, return error
    if (decision.deny) {
      throw new Error(
        `Agent ${agentId} denied by admission control: ${decision.reasons?.join(", ")}`
      );
    }

    // Start agent runtime (MVP: just track in memory)
    this.runningAgents.set(agentId, { workspaceId, spec });

    console.log(`[EmbeddedRuntime] Started agent ${agentId} in workspace ${workspaceId}`);

    return { success: true };
  }

  /**
   * Stop agent
   */
  async stopAgent(workspaceId: string, agentId: number): Promise<{ success: boolean }> {
    this.runningAgents.delete(agentId);
    console.log(`[EmbeddedRuntime] Stopped agent ${agentId} in workspace ${workspaceId}`);
    return { success: true };
  }

  /**
   * Get agent status
   */
  async getAgentStatus(workspaceId: string, agentId: number): Promise<{ status: string }> {
    const isRunning = this.runningAgents.has(agentId);
    return { status: isRunning ? "running" : "stopped" };
  }

  /**
   * Get policy snapshot
   */
  async getPolicySnapshot(workspaceId: string): Promise<PolicySnapshot> {
    // Check in-memory registry first
    const registrySnapshot = this.policyRegistry.getSnapshot(`workspace_${workspaceId}`);
    if (registrySnapshot) {
      return registrySnapshot;
    }

    // Fallback to database
    return await fetchSnapshot(workspaceId);
  }

  /**
   * Hot reload policy
   */
  async hotReloadPolicy(
    workspaceId: string,
    bundle: any,
    actor: string
  ): Promise<HotReloadResult> {
    // Hot reload in registry
    const { oldHash, newHash } = this.policyRegistry.hotReload(`workspace_${workspaceId}`, bundle);

    // Persist to database
    const result = await hotReload(workspaceId, `workspace_${workspaceId}`, bundle, actor);

    // Update admission interceptor with new revoked signers
    const snapshot = this.policyRegistry.getSnapshot(`workspace_${workspaceId}`);
    if (snapshot) {
      for (const signer of snapshot.revokedSigners) {
        this.admissionInterceptor.addRevokedSigner(signer);
      }
    }

    return result;
  }

  /**
   * Revalidate agents
   */
  async revalidateAgents(
    workspaceId: string,
    agentIds: number[]
  ): Promise<RevalidationResult[]> {
    return await revalidate(agentIds);
  }

  /**
   * Get all running agents
   */
  getRunningAgents(): Array<{ agentId: number; workspaceId: string; spec: AgentSpec }> {
    return Array.from(this.runningAgents.entries()).map(([agentId, data]) => ({
      agentId,
      ...data,
    }));
  }

  /**
   * Stop all agents
   */
  async stopAllAgents(): Promise<void> {
    this.runningAgents.clear();
    console.log("[EmbeddedRuntime] Stopped all agents");
  }

  /**
   * Get interceptor chain (for testing)
   */
  getInterceptorChain(): InterceptorChain {
    return this.interceptorChain;
  }

  /**
   * Get admission interceptor (for testing)
   */
  getAdmissionInterceptor(): AdmissionInterceptor {
    return this.admissionInterceptor;
  }
}

// Singleton instance
let _embeddedRuntime: EmbeddedRuntime | null = null;

export function getEmbeddedRuntime(): EmbeddedRuntime {
  if (!_embeddedRuntime) {
    _embeddedRuntime = new EmbeddedRuntime();
  }
  return _embeddedRuntime;
}
