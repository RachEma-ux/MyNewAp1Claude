import axios, { AxiosInstance, AxiosError } from "axios";

export interface ExternalRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  timeouts: {
    connect: number;
    request: number;
  };
  retries: {
    maxAttempts: number;
    exponentialBackoff: boolean;
  };
  tls?: {
    verify: boolean;
    caCertPemRef?: string;
    clientCert?: {
      certPemRef: string;
      keyPemRef: string;
    };
  };
}

export interface AgentStartRequest {
  workspaceId: string;
  agentId: string;
}

export interface AgentStopRequest {
  workspaceId: string;
  agentId: string;
}

export interface AgentStatusResponse {
  agentId: string;
  status: "RUNNING" | "STOPPED" | "STARTING" | "ERROR";
  startedAt?: string;
  stoppedAt?: string;
  error?: string;
}

export interface AgentStatusesResponse {
  agents: AgentStatusResponse[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PolicySnapshotResponse {
  policyHash: string;
  policyContent: string;
  version: string;
  loadedAt: string;
}

export interface PolicyHotReloadRequest {
  workspaceId: string;
  policyContent: string;
}

export interface PolicyHotReloadResponse {
  success: boolean;
  policyHash: string;
  invalidatedAgents: string[];
  restrictedAgents: string[];
}

export interface PolicyRevalidateRequest {
  workspaceId: string;
}

export interface PolicyRevalidateResponse {
  revalidatedCount: number;
  invalidatedCount: number;
  restrictedCount: number;
}

export interface AgentGovernanceResponse {
  agentId: string;
  governanceStatus: "GOVERNED_VALID" | "GOVERNED_RESTRICTED" | "GOVERNED_INVALIDATED";
  proofBundle?: any;
  lastValidatedAt: string;
}

export class ExternalRuntime {
  private client: AxiosInstance;
  private config: ExternalRuntimeConfig;

  constructor(config: ExternalRuntimeConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeouts.request,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      // TLS configuration
      httpsAgent: config.tls
        ? {
            rejectUnauthorized: config.tls.verify,
            // TODO: Load CA cert and client cert from vault
          }
        : undefined,
    });

    // Add retry interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const retryConfig = error.config as any;
        if (!retryConfig || !retryConfig.retryCount) {
          retryConfig.retryCount = 0;
        }

        if (
          retryConfig.retryCount < this.config.retries.maxAttempts &&
          this.shouldRetry(error)
        ) {
          retryConfig.retryCount += 1;

          // Exponential backoff
          const delay = this.config.retries.exponentialBackoff
            ? Math.pow(2, retryConfig.retryCount) * 1000
            : 1000;

          await new Promise((resolve) => setTimeout(resolve, delay));

          return this.client.request(retryConfig);
        }

        return Promise.reject(error);
      }
    );
  }

  private shouldRetry(error: AxiosError): boolean {
    // Retry on network errors or 5xx server errors
    return (
      !error.response ||
      (error.response.status >= 500 && error.response.status < 600)
    );
  }

  /**
   * Start an agent
   */
  async startAgent(request: AgentStartRequest): Promise<AgentStatusResponse> {
    const response = await this.client.post(
      `/v1/workspaces/${request.workspaceId}/agents/${request.agentId}/start`
    );
    return response.data;
  }

  /**
   * Stop an agent
   */
  async stopAgent(request: AgentStopRequest): Promise<AgentStatusResponse> {
    const response = await this.client.post(
      `/v1/workspaces/${request.workspaceId}/agents/${request.agentId}/stop`
    );
    return response.data;
  }

  /**
   * Get agent status
   */
  async getAgentStatus(
    workspaceId: string,
    agentId: string
  ): Promise<AgentStatusResponse> {
    const response = await this.client.get(
      `/v1/workspaces/${workspaceId}/agents/${agentId}/status`
    );
    return response.data;
  }

  /**
   * Get all agent statuses (paginated)
   */
  async getAgentStatuses(
    workspaceId: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<AgentStatusesResponse> {
    const response = await this.client.get(
      `/v1/workspaces/${workspaceId}/agents/statuses`,
      {
        params: { page, pageSize },
      }
    );
    return response.data;
  }

  /**
   * Get policy snapshot
   */
  async getPolicySnapshot(workspaceId: string): Promise<PolicySnapshotResponse> {
    const response = await this.client.get(
      `/v1/workspaces/${workspaceId}/policy/snapshot`
    );
    return response.data;
  }

  /**
   * Hot reload policy
   */
  async hotReloadPolicy(
    request: PolicyHotReloadRequest
  ): Promise<PolicyHotReloadResponse> {
    const response = await this.client.post(
      `/v1/workspaces/${request.workspaceId}/policy/hotreload`,
      {
        policyContent: request.policyContent,
      }
    );
    return response.data;
  }

  /**
   * Revalidate all agents against current policy
   */
  async revalidateAgents(
    request: PolicyRevalidateRequest
  ): Promise<PolicyRevalidateResponse> {
    const response = await this.client.post(
      `/v1/workspaces/${request.workspaceId}/policy/revalidate`
    );
    return response.data;
  }

  /**
   * Get agent governance status
   */
  async getAgentGovernance(
    workspaceId: string,
    agentId: string
  ): Promise<AgentGovernanceResponse> {
    const response = await this.client.get(
      `/v1/workspaces/${workspaceId}/agents/${agentId}/governance`
    );
    return response.data;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get("/health");
    return response.data;
  }
}

/**
 * Create ExternalRuntime instance from workspace config
 */
export function createExternalRuntime(
  config: ExternalRuntimeConfig
): ExternalRuntime {
  return new ExternalRuntime(config);
}
