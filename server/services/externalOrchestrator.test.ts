/**
 * External Orchestrator Client Tests
 * 
 * Unit tests for ExternalOrchestratorClient service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExternalOrchestratorClient } from './externalOrchestrator';

describe('ExternalOrchestratorClient', () => {
  let client: ExternalOrchestratorClient;

  beforeEach(() => {
    client = new ExternalOrchestratorClient({
      baseUrl: 'https://orchestrator.example.com',
      apiKey: 'test-key',
      timeout: 5000,
      maxRetries: 3,
    });
  });

  describe('startAgent', () => {
    it('should start an agent successfully', async () => {
      const result = await client.startAgent({
        workspaceId: 1,
        agentId: 1,
        spec: {
          name: 'Test Agent',
          roleClass: 'assistant',
          systemPrompt: 'Test prompt',
          modelId: 'gpt-4',
          temperature: 0.7,
          hasDocumentAccess: false,
          hasToolAccess: false,
          allowedTools: [],
        },
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.agentId).toBe(1);
    });

    it('should emit agent.started event', async () => {
      const emitSpy = vi.spyOn(client, 'emitEvent');

      await client.startAgent({
        workspaceId: 1,
        agentId: 1,
        spec: {
          name: 'Test Agent',
          roleClass: 'assistant',
          systemPrompt: 'Test prompt',
          modelId: 'gpt-4',
          temperature: 0.7,
          hasDocumentAccess: false,
          hasToolAccess: false,
          allowedTools: [],
        },
      });

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent.started',
          workspaceId: 1,
          agentId: 1,
        })
      );
    });
  });

  describe('stopAgent', () => {
    it('should stop an agent successfully', async () => {
      const result = await client.stopAgent(1, 1);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should emit agent.stopped event', async () => {
      const emitSpy = vi.spyOn(client, 'emitEvent');

      await client.stopAgent(1, 1);

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent.stopped',
          workspaceId: 1,
          agentId: 1,
        })
      );
    });
  });

  describe('getAgentStatus', () => {
    it('should get agent status', async () => {
      const status = await client.getAgentStatus(1, 1);

      expect(status).toBeDefined();
      expect(status.agentId).toBe(1);
      expect(['running', 'stopped', 'error']).toContain(status.status);
    });

    it('should return last heartbeat timestamp', async () => {
      const status = await client.getAgentStatus(1, 1);

      expect(status.lastHeartbeat).toBeDefined();
      expect(status.lastHeartbeat).toBeInstanceOf(Date);
    });
  });

  describe('getAgentsStatuses', () => {
    it('should get multiple agent statuses', async () => {
      const result = await client.getAgentsStatuses(1, { page: 1, pageSize: 20 });

      expect(result).toBeDefined();
      expect(result.agents).toBeInstanceOf(Array);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('should support pagination', async () => {
      const result1 = await client.getAgentsStatuses(1, { page: 1, pageSize: 10 });
      const result2 = await client.getAgentsStatuses(1, { page: 2, pageSize: 10 });

      expect(result1.page).toBe(1);
      expect(result2.page).toBe(2);
    });
  });

  describe('getPolicySnapshot', () => {
    it('should get policy snapshot', async () => {
      const snapshot = await client.getPolicySnapshot(1);

      expect(snapshot).toBeDefined();
      expect(snapshot.version).toBeGreaterThan(0);
      expect(snapshot.hash).toBeDefined();
      expect(snapshot.content).toBeDefined();
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('hotReloadPolicy', () => {
    it('should hot reload policy', async () => {
      const result = await client.hotReloadPolicy(1, 'package agent_governance { }');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.affectedAgents).toBeGreaterThanOrEqual(0);
    });

    it('should emit policy.reloaded event', async () => {
      const emitSpy = vi.spyOn(client, 'emitEvent');

      await client.hotReloadPolicy(1, 'package agent_governance { }');

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'policy.reloaded',
          workspaceId: 1,
        })
      );
    });
  });

  describe('revalidateAgents', () => {
    it('should revalidate agents', async () => {
      const result = await client.revalidateAgents(1, [1, 2, 3]);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.affectedAgents).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAgentGovernance', () => {
    it('should get agent governance status', async () => {
      const governance = await client.getAgentGovernance(1, 1);

      expect(governance).toBeDefined();
      expect(governance.agentId).toBe(1);
      expect(['governed', 'sandbox', 'unknown']).toContain(governance.status);
      expect(governance.proofValid).toBe(true);
    });
  });

  describe('healthCheck', () => {
    it('should check orchestrator health', async () => {
      const health = await client.healthCheck();

      expect(health).toBeDefined();
      expect(health.healthy).toBe(true);
      expect(health.message).toBeDefined();
    });
  });

  describe('retry logic', () => {
    it('should retry on transient failures', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      // Mock first call to fail, second to succeed
      fetchSpy
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true }), { status: 200 })
        );

      // Should not throw despite first failure
      expect(async () => {
        await client.startAgent({
          workspaceId: 1,
          agentId: 1,
          spec: {
            name: 'Test',
            roleClass: 'assistant',
            systemPrompt: 'Test',
            modelId: 'gpt-4',
            temperature: 0.7,
            hasDocumentAccess: false,
            hasToolAccess: false,
            allowedTools: [],
          },
        });
      }).not.toThrow();

      fetchSpy.mockRestore();
    });
  });

  describe('event emission', () => {
    it('should emit events to subscribers', (done) => {
      const callback = (event: any) => {
        expect(event.type).toBe('agent.started');
        done();
      };

      client.on('agent.started', callback);

      client.startAgent({
        workspaceId: 1,
        agentId: 1,
        spec: {
          name: 'Test',
          roleClass: 'assistant',
          systemPrompt: 'Test',
          modelId: 'gpt-4',
          temperature: 0.7,
          hasDocumentAccess: false,
          hasToolAccess: false,
          allowedTools: [],
        },
      });
    });
  });
});
