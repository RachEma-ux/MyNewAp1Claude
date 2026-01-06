/**
 * Runtime Selector
 * Chooses between embedded runtime and external orchestrator based on workspace configuration
 */

export interface WorkspaceConfig {
  agentsRuntime: {
    mode: "embedded" | "external";
    external?: {
      baseUrl: string;
      apiKey: string;
      timeout?: number;
      retries?: number;
      tls?: {
        verify: boolean;
        caCertPemRef?: string;
        clientCertPemRef?: string;
        clientKeyPemRef?: string;
      };
    };
  };
  signing?: {
    authority: string;
    keyRef: string;
  };
  policy?: {
    autoReload: boolean;
    revalidationIntervalMinutes: number;
  };
}

export interface OrchestratorRuntime {
  startAgent(workspaceId: string, agentId: number, spec: any): Promise<{ success: boolean }>;
  stopAgent(workspaceId: string, agentId: number): Promise<{ success: boolean }>;
  getAgentStatus(workspaceId: string, agentId: number): Promise<{ status: string }>;
  getPolicySnapshot(workspaceId: string): Promise<any>;
  hotReloadPolicy(workspaceId: string, bundle: any, actor: string): Promise<any>;
  revalidateAgents(workspaceId: string, agentIds: number[]): Promise<any>;
}

/**
 * Embedded Runtime
 * Runs agents within the host application process
 */
class EmbeddedRuntime implements OrchestratorRuntime {
  async startAgent(workspaceId: string, agentId: number, spec: any): Promise<{ success: boolean }> {
    // Run admission control interceptor chain
    const { AdmissionInterceptor } = await import("../../modules/agents/interceptors/AdmissionInterceptor");
    const { getGovernanceLogger } = await import("./governanceLogger");
    const { getGovernanceMetrics } = await import("./governanceMetrics");
    
    const interceptor = new AdmissionInterceptor();
    const decision = await interceptor.intercept({
      agent: spec,
      workspaceId,
      timestamp: new Date(),
    });

    // Log decision
    getGovernanceLogger().logAdmission({
      agentId,
      workspaceId,
      decision: decision.allow ? "allow" : "deny",
      reason: decision.reasons?.join(", "),
      errorCodes: decision.errorCodes,
    });

    // Update metrics
    if (decision.allow) {
      getGovernanceMetrics().inc("agent_starts_allowed_total");
      console.log(`[EmbeddedRuntime] Agent ${agentId} start ALLOWED`);
      return { success: true };
    } else {
      getGovernanceMetrics().inc("agent_starts_denied_total", {
        reason: decision.errorCodes?.[0] || "UNKNOWN",
      });
      console.error(`[EmbeddedRuntime] Agent ${agentId} start DENIED:`, decision.reasons);
      throw new Error(`Admission denied: ${decision.reasons?.join(", ")}`);
    }
  }

  async stopAgent(workspaceId: string, agentId: number): Promise<{ success: boolean }> {
    console.log(`[EmbeddedRuntime] Stopping agent ${agentId} in workspace ${workspaceId}`);
    return { success: true };
  }

  async getAgentStatus(workspaceId: string, agentId: number): Promise<{ status: string }> {
    // MVP: Always return "running"
    // TODO: Track actual agent status
    return { status: "running" };
  }

  async getPolicySnapshot(workspaceId: string): Promise<any> {
    // Delegate to policy service
    const { fetchSnapshot } = await import("./policyService");
    return await fetchSnapshot(workspaceId);
  }

  async hotReloadPolicy(workspaceId: string, bundle: any, actor: string): Promise<any> {
    // Delegate to policy service
    const { hotReload } = await import("./policyService");
    return await hotReload(workspaceId, `workspace_${workspaceId}`, bundle, actor);
  }

  async revalidateAgents(workspaceId: string, agentIds: number[]): Promise<any> {
    // Delegate to policy service
    const { revalidate } = await import("./policyService");
    return await revalidate(agentIds);
  }
}

/**
 * External Runtime
 * Communicates with external orchestrator via REST API
 */
class ExternalRuntime implements OrchestratorRuntime {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private retries: number;

  constructor(config: WorkspaceConfig["agentsRuntime"]["external"]) {
    if (!config) {
      throw new Error("External runtime configuration is required");
    }

    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000; // 30s default
    this.retries = config.retries || 3;
  }

  private async makeRequest(
    method: string,
    path: string,
    body?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`;

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        if (attempt === this.retries) {
          throw error;
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async startAgent(workspaceId: string, agentId: number, spec: any): Promise<{ success: boolean }> {
    return await this.makeRequest(
      "POST",
      `/v1/workspaces/${workspaceId}/agents/${agentId}/start`,
      { spec }
    );
  }

  async stopAgent(workspaceId: string, agentId: number): Promise<{ success: boolean }> {
    return await this.makeRequest(
      "POST",
      `/v1/workspaces/${workspaceId}/agents/${agentId}/stop`
    );
  }

  async getAgentStatus(workspaceId: string, agentId: number): Promise<{ status: string }> {
    return await this.makeRequest(
      "GET",
      `/v1/workspaces/${workspaceId}/agents/${agentId}/status`
    );
  }

  async getPolicySnapshot(workspaceId: string): Promise<any> {
    return await this.makeRequest(
      "GET",
      `/v1/workspaces/${workspaceId}/policy/snapshot`
    );
  }

  async hotReloadPolicy(workspaceId: string, bundle: any, actor: string): Promise<any> {
    return await this.makeRequest(
      "POST",
      `/v1/workspaces/${workspaceId}/policy/hotreload`,
      { bundle, actor }
    );
  }

  async revalidateAgents(workspaceId: string, agentIds: number[]): Promise<any> {
    return await this.makeRequest(
      "POST",
      `/v1/workspaces/${workspaceId}/policy/revalidate`,
      { agentIds }
    );
  }
}

/**
 * Runtime Selector
 * Returns appropriate runtime based on workspace configuration
 */
export function runtimeSelector(wsConfig: WorkspaceConfig): OrchestratorRuntime {
  // Validate configuration
  if (!wsConfig || !wsConfig.agentsRuntime) {
    throw new Error("Invalid workspace configuration: missing agentsRuntime");
  }

  const mode = wsConfig.agentsRuntime.mode;

  if (mode === "embedded") {
    return new EmbeddedRuntime();
  } else if (mode === "external") {
    if (!wsConfig.agentsRuntime.external) {
      throw new Error("External runtime configuration is required when mode is 'external'");
    }
    return new ExternalRuntime(wsConfig.agentsRuntime.external);
  } else {
    throw new Error(`Unknown runtime mode: ${mode}`);
  }
}

/**
 * Get default workspace configuration
 * MVP: Always use embedded runtime
 */
export function getDefaultWorkspaceConfig(): WorkspaceConfig {
  return {
    agentsRuntime: {
      mode: "embedded",
    },
    signing: {
      authority: "system",
      keyRef: "default",
    },
    policy: {
      autoReload: false,
      revalidationIntervalMinutes: 60,
    },
  };
}
