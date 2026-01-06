import { ExternalRuntime, ExternalRuntimeConfig, createExternalRuntime } from "./external-runtime";

export type RuntimeMode = "embedded" | "external";

export interface WorkspaceRuntimeConfig {
  mode: RuntimeMode;
  external?: ExternalRuntimeConfig;
}

export interface RuntimeInterface {
  startAgent(workspaceId: string, agentId: string): Promise<any>;
  stopAgent(workspaceId: string, agentId: string): Promise<any>;
  getAgentStatus(workspaceId: string, agentId: string): Promise<any>;
  getAgentStatuses(workspaceId: string, page?: number, pageSize?: number): Promise<any>;
  getPolicySnapshot(workspaceId: string): Promise<any>;
  hotReloadPolicy(workspaceId: string, policyContent: string): Promise<any>;
  revalidateAgents(workspaceId: string): Promise<any>;
  getAgentGovernance(workspaceId: string, agentId: string): Promise<any>;
}

/**
 * Embedded runtime implementation (current in-process implementation)
 */
class EmbeddedRuntime implements RuntimeInterface {
  async startAgent(workspaceId: string, agentId: string): Promise<any> {
    // TODO: Implement embedded agent start logic
    return {
      agentId,
      status: "RUNNING",
      startedAt: new Date().toISOString(),
    };
  }

  async stopAgent(workspaceId: string, agentId: string): Promise<any> {
    // TODO: Implement embedded agent stop logic
    return {
      agentId,
      status: "STOPPED",
      stoppedAt: new Date().toISOString(),
    };
  }

  async getAgentStatus(workspaceId: string, agentId: string): Promise<any> {
    // TODO: Implement embedded agent status logic
    return {
      agentId,
      status: "STOPPED",
    };
  }

  async getAgentStatuses(workspaceId: string, page: number = 1, pageSize: number = 50): Promise<any> {
    // TODO: Implement embedded agent statuses logic
    return {
      agents: [],
      page,
      pageSize,
      total: 0,
    };
  }

  async getPolicySnapshot(workspaceId: string): Promise<any> {
    // TODO: Implement embedded policy snapshot logic
    return {
      policyHash: "embedded_policy_hash",
      policyContent: "",
      version: "1.0.0",
      loadedAt: new Date().toISOString(),
    };
  }

  async hotReloadPolicy(workspaceId: string, policyContent: string): Promise<any> {
    // TODO: Implement embedded policy hot reload logic
    return {
      success: true,
      policyHash: "new_policy_hash",
      invalidatedAgents: [],
      restrictedAgents: [],
    };
  }

  async revalidateAgents(workspaceId: string): Promise<any> {
    // TODO: Implement embedded agent revalidation logic
    return {
      revalidatedCount: 0,
      invalidatedCount: 0,
      restrictedCount: 0,
    };
  }

  async getAgentGovernance(workspaceId: string, agentId: string): Promise<any> {
    // TODO: Implement embedded agent governance logic
    return {
      agentId,
      governanceStatus: "GOVERNED_VALID",
      lastValidatedAt: new Date().toISOString(),
    };
  }
}

/**
 * External runtime adapter (wraps ExternalRuntime client)
 */
class ExternalRuntimeAdapter implements RuntimeInterface {
  private client: ExternalRuntime;

  constructor(config: ExternalRuntimeConfig) {
    this.client = createExternalRuntime(config);
  }

  async startAgent(workspaceId: string, agentId: string): Promise<any> {
    return this.client.startAgent({ workspaceId, agentId });
  }

  async stopAgent(workspaceId: string, agentId: string): Promise<any> {
    return this.client.stopAgent({ workspaceId, agentId });
  }

  async getAgentStatus(workspaceId: string, agentId: string): Promise<any> {
    return this.client.getAgentStatus(workspaceId, agentId);
  }

  async getAgentStatuses(workspaceId: string, page?: number, pageSize?: number): Promise<any> {
    return this.client.getAgentStatuses(workspaceId, page, pageSize);
  }

  async getPolicySnapshot(workspaceId: string): Promise<any> {
    return this.client.getPolicySnapshot(workspaceId);
  }

  async hotReloadPolicy(workspaceId: string, policyContent: string): Promise<any> {
    return this.client.hotReloadPolicy({ workspaceId, policyContent });
  }

  async revalidateAgents(workspaceId: string): Promise<any> {
    return this.client.revalidateAgents({ workspaceId });
  }

  async getAgentGovernance(workspaceId: string, agentId: string): Promise<any> {
    return this.client.getAgentGovernance(workspaceId, agentId);
  }
}

/**
 * Runtime selector - chooses between embedded and external runtime
 */
export class RuntimeSelector {
  private runtimes: Map<string, RuntimeInterface> = new Map();

  /**
   * Get runtime for workspace
   */
  getRuntime(workspaceId: string, config: WorkspaceRuntimeConfig): RuntimeInterface {
    const cacheKey = `${workspaceId}:${config.mode}`;

    // Check cache
    if (this.runtimes.has(cacheKey)) {
      return this.runtimes.get(cacheKey)!;
    }

    // Create runtime based on mode
    let runtime: RuntimeInterface;
    if (config.mode === "external" && config.external) {
      runtime = new ExternalRuntimeAdapter(config.external);
    } else {
      runtime = new EmbeddedRuntime();
    }

    // Cache runtime
    this.runtimes.set(cacheKey, runtime);

    return runtime;
  }

  /**
   * Clear runtime cache
   */
  clearCache(workspaceId?: string) {
    if (workspaceId) {
      // Clear specific workspace runtimes
      for (const key of this.runtimes.keys()) {
        if (key.startsWith(`${workspaceId}:`)) {
          this.runtimes.delete(key);
        }
      }
    } else {
      // Clear all runtimes
      this.runtimes.clear();
    }
  }
}

// Global runtime selector instance
export const runtimeSelector = new RuntimeSelector();
