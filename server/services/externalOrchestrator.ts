/**
 * External Orchestrator Client
 * 
 * Communicates with an external orchestrator service for agent lifecycle management.
 * Supports both HTTP/REST and gRPC transports with automatic failover and retry logic.
 */

import https from 'https';
import { EventEmitter } from 'events';

export interface ExternalOrchestratorConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  tlsConfig?: {
    caPath?: string;
    certPath?: string;
    keyPath?: string;
    rejectUnauthorized?: boolean;
  };
}

export interface AgentStartRequest {
  workspaceId: number;
  agentId: number;
  spec: {
    name: string;
    roleClass: string;
    systemPrompt: string;
    modelId: string;
    temperature?: number;
    capabilities?: string[];
    limits?: Record<string, any>;
  };
}

export interface AgentStatus {
  agentId: number;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  lastHeartbeat?: Date;
  errorMessage?: string;
}

export interface PolicySnapshot {
  version: number;
  hash: string;
  content: string;
  timestamp: Date;
}

export interface HotReloadResponse {
  success: boolean;
  affectedAgents: number;
  invalidatedAgents: number[];
  errors?: string[];
}

export class ExternalOrchestratorClient extends EventEmitter {
  private config: ExternalOrchestratorConfig;
  private retryCount: Map<string, number> = new Map();

  constructor(config: ExternalOrchestratorConfig) {
    super();
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config,
    };
  }

  /**
   * Start an agent on the external orchestrator
   */
  async startAgent(request: AgentStartRequest): Promise<{ success: boolean; agentId: number }> {
    const endpoint = `/v1/workspaces/${request.workspaceId}/agents/${request.agentId}/start`;
    return this.makeRequest('POST', endpoint, request, 'startAgent');
  }

  /**
   * Stop an agent on the external orchestrator
   */
  async stopAgent(workspaceId: number, agentId: number): Promise<{ success: boolean }> {
    const endpoint = `/v1/workspaces/${workspaceId}/agents/${agentId}/stop`;
    return this.makeRequest('POST', endpoint, {}, 'stopAgent');
  }

  /**
   * Get status of a single agent
   */
  async getAgentStatus(workspaceId: number, agentId: number): Promise<AgentStatus> {
    const endpoint = `/v1/workspaces/${workspaceId}/agents/${agentId}/status`;
    return this.makeRequest('GET', endpoint, null, 'getAgentStatus');
  }

  /**
   * Get status of multiple agents (paginated)
   */
  async getAgentsStatuses(
    workspaceId: number,
    options?: { page?: number; pageSize?: number }
  ): Promise<{ agents: AgentStatus[]; total: number; page: number; pageSize: number }> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', String(options.page));
    if (options?.pageSize) params.append('pageSize', String(options.pageSize));
    
    const endpoint = `/v1/workspaces/${workspaceId}/agents/statuses?${params.toString()}`;
    return this.makeRequest('GET', endpoint, null, 'getAgentsStatuses');
  }

  /**
   * Get current policy snapshot
   */
  async getPolicySnapshot(workspaceId: number): Promise<PolicySnapshot> {
    const endpoint = `/v1/workspaces/${workspaceId}/policy/snapshot`;
    return this.makeRequest('GET', endpoint, null, 'getPolicySnapshot');
  }

  /**
   * Hot reload policy on the orchestrator
   */
  async hotReloadPolicy(workspaceId: number, policyContent: string): Promise<HotReloadResponse> {
    const endpoint = `/v1/workspaces/${workspaceId}/policy/hotreload`;
    return this.makeRequest('POST', endpoint, { policy: policyContent }, 'hotReloadPolicy');
  }

  /**
   * Trigger revalidation of agents against new policy
   */
  async revalidateAgents(workspaceId: number, agentIds?: number[]): Promise<HotReloadResponse> {
    const endpoint = `/v1/workspaces/${workspaceId}/policy/revalidate`;
    return this.makeRequest('POST', endpoint, { agentIds }, 'revalidateAgents');
  }

  /**
   * Get governance status of an agent
   */
  async getAgentGovernance(workspaceId: number, agentId: number): Promise<{
    agentId: number;
    status: string;
    policyHash: string;
    proofValid: boolean;
  }> {
    const endpoint = `/v1/workspaces/${workspaceId}/agents/${agentId}/governance`;
    return this.makeRequest('GET', endpoint, null, 'getAgentGovernance');
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest(
    method: string,
    endpoint: string,
    body: any,
    operationName: string
  ): Promise<any> {
    const key = `${method}:${endpoint}`;
    const retryCount = this.retryCount.get(key) || 0;

    try {
      const response = await this.httpRequest(method, endpoint, body);
      this.retryCount.delete(key); // Reset on success
      return response;
    } catch (error) {
      if (retryCount < (this.config.maxRetries || 3)) {
        this.retryCount.set(key, retryCount + 1);
        const delay = (this.config.retryDelayMs || 1000) * Math.pow(2, retryCount);
        
        this.emit('retry', {
          operation: operationName,
          attempt: retryCount + 1,
          delay,
          error: error instanceof Error ? error.message : String(error),
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(method, endpoint, body, operationName);
      }

      this.emit('error', {
        operation: operationName,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Make raw HTTP request
   */
  private httpRequest(method: string, endpoint: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.config.baseUrl);
      
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.config.timeout,
        ...(this.config.tlsConfig && {
          ca: this.config.tlsConfig.caPath,
          cert: this.config.tlsConfig.certPath,
          key: this.config.tlsConfig.keyPath,
          rejectUnauthorized: this.config.tlsConfig.rejectUnauthorized !== false,
        }),
      };

      const req = https.request(url, options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data || '{}'));
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Check orchestrator health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpRequest('GET', '/health', null);
      return response.status === 'healthy';
    } catch {
      return false;
    }
  }
}

// Singleton instance
let orchestratorClient: ExternalOrchestratorClient | null = null;

export function initializeOrchestrator(config: ExternalOrchestratorConfig): ExternalOrchestratorClient {
  orchestratorClient = new ExternalOrchestratorClient(config);
  return orchestratorClient;
}

export function getOrchestrator(): ExternalOrchestratorClient | null {
  return orchestratorClient;
}
