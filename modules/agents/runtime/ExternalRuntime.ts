import type { OrchestratorRuntime, AgentSpec, PolicySnapshot, HotReloadResult, RevalidationResult } from "../types";

/**
 * External Runtime Client
 * Phase 3: External Orchestrator Integration
 * 
 * Communicates with external orchestrator via REST API
 */

export interface ExternalRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number; // milliseconds
  retries?: number;
  tls?: {
    verify: boolean;
    caCertPemRef?: string;
    clientCertPemRef?: string;
    clientKeyPemRef?: string;
  };
}

export class ExternalRuntime implements OrchestratorRuntime {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: ExternalRuntimeConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000; // 30s default
    this.maxRetries = config.retries || 3;
  }

  /**
   * Start agent via external orchestrator
   */
  async startAgent(
    workspaceId: string,
    agentId: number,
    spec: AgentSpec
  ): Promise<{ success: boolean }> {
    const url = `${this.baseUrl}/v1/workspaces/${workspaceId}/agents/${agentId}/start`;
    
    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ spec }),
    });

    return await response.json();
  }

  /**
   * Stop agent via external orchestrator
   */
  async stopAgent(workspaceId: string, agentId: number): Promise<{ success: boolean }> {
    const url = `${this.baseUrl}/v1/workspaces/${workspaceId}/agents/${agentId}/stop`;
    
    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: this.getHeaders(),
    });

    return await response.json();
  }

  /**
   * Get agent status from external orchestrator
   */
  async getAgentStatus(workspaceId: string, agentId: number): Promise<{ status: string }> {
    const url = `${this.baseUrl}/v1/workspaces/${workspaceId}/agents/${agentId}/status`;
    
    const response = await this.fetchWithRetry(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    return await response.json();
  }

  /**
   * Get policy snapshot from external orchestrator
   */
  async getPolicySnapshot(workspaceId: string): Promise<PolicySnapshot> {
    const url = `${this.baseUrl}/v1/workspaces/${workspaceId}/policy/snapshot`;
    
    const response = await this.fetchWithRetry(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    return await response.json();
  }

  /**
   * Hot reload policy on external orchestrator
   */
  async hotReloadPolicy(
    workspaceId: string,
    bundle: any,
    actor: string
  ): Promise<HotReloadResult> {
    const url = `${this.baseUrl}/v1/workspaces/${workspaceId}/policy/hotreload`;
    
    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ bundle, actor }),
    });

    return await response.json();
  }

  /**
   * Revalidate agents on external orchestrator
   */
  async revalidateAgents(
    workspaceId: string,
    agentIds: number[]
  ): Promise<RevalidationResult[]> {
    const url = `${this.baseUrl}/v1/workspaces/${workspaceId}/policy/revalidate`;
    
    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ agentIds }),
    });

    return await response.json();
  }

  /**
   * Get all agent statuses (paged)
   */
  async getAgentStatuses(
    workspaceId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ agents: Array<{ agentId: number; status: string }>; total: number }> {
    const url = `${this.baseUrl}/v1/workspaces/${workspaceId}/agents/statuses?page=${page}&limit=${limit}`;
    
    const response = await this.fetchWithRetry(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    return await response.json();
  }

  /**
   * Get agent governance info
   */
  async getAgentGovernance(
    workspaceId: string,
    agentId: number
  ): Promise<{ governance: any }> {
    const url = `${this.baseUrl}/v1/workspaces/${workspaceId}/agents/${agentId}/governance`;
    
    const response = await this.fetchWithRetry(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    return await response.json();
  }

  /**
   * Fetch with retry and exponential backoff
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    attempt: number = 1
  ): Promise<Response> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      // Retry on network errors or timeouts
      if (attempt < this.maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.warn(
          `[ExternalRuntime] Request failed (attempt ${attempt}/${this.maxRetries}), retrying in ${backoffMs}ms...`,
          error
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return this.fetchWithRetry(url, options, attempt + 1);
      }

      // Max retries exceeded
      throw new Error(
        `[ExternalRuntime] Request failed after ${this.maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get request headers with auth
   */
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }
}
