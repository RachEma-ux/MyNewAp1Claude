import { ExternalRuntime, ExternalRuntimeConfig, createExternalRuntime } from "./external-runtime";
import {
  startAgent as embeddedStartAgent,
  stopAgent as embeddedStopAgent,
  getAgentStatus as embeddedGetAgentStatus,
  revalidateAgents as embeddedRevalidateAgents,
  getGovernanceState,
} from "./embedded-runtime";
import { listAgents, getAgent } from "./db";
import { getOPAEngine } from "./opa-engine";
import crypto from "crypto";

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
 * Delegates to the embedded-runtime module for agent lifecycle and OPA engine for policy.
 */
class EmbeddedRuntime implements RuntimeInterface {
  async startAgent(workspaceId: string, agentId: string): Promise<any> {
    const wsId = parseInt(workspaceId, 10);
    const aId = parseInt(agentId, 10);

    const agent = await getAgent(aId);
    if (!agent) {
      return { agentId, status: "DENIED", reason: "Agent not found" };
    }

    const spec = {
      mode: (agent.mode || "sandbox") as "sandbox" | "governed",
      roleClass: agent.roleClass || "general",
      anatomy: {
        systemPrompt: agent.systemPrompt || "",
        tools: agent.allowedTools || [],
      },
      governanceStatus: agent.governanceStatus || "UNGOVERNED",
      expiresAt: agent.expiresAt ? new Date(agent.expiresAt) : undefined,
    };

    const result = await embeddedStartAgent(wsId, aId, spec);

    return {
      agentId,
      status: result.status === "running" ? "RUNNING" : "DENIED",
      reason: result.reason,
      startedAt: result.success ? new Date().toISOString() : undefined,
    };
  }

  async stopAgent(workspaceId: string, agentId: string): Promise<any> {
    const result = await embeddedStopAgent(
      parseInt(workspaceId, 10),
      parseInt(agentId, 10)
    );

    return {
      agentId,
      status: "STOPPED",
      stoppedAt: new Date().toISOString(),
      success: result.success,
    };
  }

  async getAgentStatus(workspaceId: string, agentId: string): Promise<any> {
    const status = await embeddedGetAgentStatus(
      parseInt(workspaceId, 10),
      parseInt(agentId, 10)
    );

    return {
      agentId,
      status: status.status.toUpperCase(),
      uptime: status.uptime,
      lastActivity: status.lastActivity?.toISOString(),
    };
  }

  async getAgentStatuses(workspaceId: string, page: number = 1, pageSize: number = 50): Promise<any> {
    const wsId = parseInt(workspaceId, 10);
    const allAgents = await listAgents(wsId);

    const total = allAgents.length;
    const startIdx = (page - 1) * pageSize;
    const paged = allAgents.slice(startIdx, startIdx + pageSize);

    const statuses = await Promise.all(
      paged.map(async (agent) => {
        try {
          const status = await embeddedGetAgentStatus(wsId, agent.id);
          return {
            agentId: String(agent.id),
            name: agent.name,
            status: status.status.toUpperCase(),
            uptime: status.uptime,
            lastActivity: status.lastActivity?.toISOString(),
          };
        } catch {
          return {
            agentId: String(agent.id),
            name: agent.name,
            status: "UNKNOWN",
          };
        }
      })
    );

    return {
      agents: statuses,
      page,
      pageSize,
      total,
    };
  }

  async getPolicySnapshot(workspaceId: string): Promise<any> {
    try {
      const opa = getOPAEngine();
      const info = opa.getPolicyInfo();

      return {
        policyHash: info.bundleHash || "",
        policySetHash: info.setHash || "",
        loadedAt: info.loadedAt?.toISOString() || null,
        version: "1.0.0",
      };
    } catch {
      return {
        policyHash: "",
        policySetHash: "",
        loadedAt: null,
        version: "1.0.0",
      };
    }
  }

  async hotReloadPolicy(workspaceId: string, policyContent: string): Promise<any> {
    const wsId = parseInt(workspaceId, 10);

    try {
      const opa = getOPAEngine();

      // Upload the new policy content directly to OPA
      const response = await fetch(
        `${(opa as any).opaUrl || "http://localhost:8181"}/v1/policies/agents`,
        {
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: policyContent,
        }
      );

      if (!response.ok) {
        throw new Error(`OPA policy upload failed: ${response.statusText}`);
      }

      const newHash = crypto
        .createHash("sha256")
        .update(policyContent)
        .digest("hex");

      // Revalidate all agents in the workspace against the new policy
      const allAgents = await listAgents(wsId);
      const agentIds = allAgents
        .filter((a) => a.mode === "governed")
        .map((a) => a.id);

      const { invalidated } = await embeddedRevalidateAgents(wsId, agentIds);

      return {
        success: true,
        policyHash: newHash,
        invalidatedAgents: invalidated,
        restrictedAgents: [],
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        invalidatedAgents: [],
        restrictedAgents: [],
      };
    }
  }

  async revalidateAgents(workspaceId: string): Promise<any> {
    const wsId = parseInt(workspaceId, 10);
    const allAgents = await listAgents(wsId);
    const governedIds = allAgents
      .filter((a) => a.mode === "governed")
      .map((a) => a.id);

    const { invalidated, valid } = await embeddedRevalidateAgents(wsId, governedIds);

    return {
      revalidatedCount: valid.length,
      invalidatedCount: invalidated.length,
      restrictedCount: 0,
    };
  }

  async getAgentGovernance(workspaceId: string, agentId: string): Promise<any> {
    const aId = parseInt(agentId, 10);

    try {
      const state = await getGovernanceState(aId);

      return {
        agentId,
        governanceStatus: state.status,
        reason: state.reason,
        policyHash: state.policyHash,
        lastValidatedAt: new Date().toISOString(),
      };
    } catch {
      return {
        agentId,
        governanceStatus: "UNGOVERNED",
        lastValidatedAt: new Date().toISOString(),
      };
    }
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
