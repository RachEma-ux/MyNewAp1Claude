import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExternalRuntime } from "../../../modules/agents/runtime/ExternalRuntime";

/**
 * External Runtime Tests
 * Phase 3: External Orchestrator Integration
 * 
 * Tests all 8 API endpoints with retry logic
 */

describe("ExternalRuntime - API Endpoints", () => {
  let runtime: ExternalRuntime;
  let fetchMock: any;

  beforeEach(() => {
    // Mock fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    runtime = new ExternalRuntime({
      baseUrl: "https://orchestrator.example.com",
      apiKey: "test-api-key",
      timeout: 5000,
      retries: 2,
    });
  });

  it("should call start agent endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const result = await runtime.startAgent("workspace-1", 123, { mode: "governed" } as any);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://orchestrator.example.com/v1/workspaces/workspace-1/agents/123/start",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
        }),
      })
    );
  });

  it("should call stop agent endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const result = await runtime.stopAgent("workspace-1", 123);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://orchestrator.example.com/v1/workspaces/workspace-1/agents/123/stop",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("should call get agent status endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "running" }),
    });

    const result = await runtime.getAgentStatus("workspace-1", 123);

    expect(result.status).toBe("running");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://orchestrator.example.com/v1/workspaces/workspace-1/agents/123/status",
      expect.objectContaining({
        method: "GET",
      })
    );
  });

  it("should call get agent statuses endpoint (paged)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agents: [
          { agentId: 1, status: "running" },
          { agentId: 2, status: "stopped" },
        ],
        total: 2,
      }),
    });

    const result = await runtime.getAgentStatuses("workspace-1", 1, 50);

    expect(result.agents).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://orchestrator.example.com/v1/workspaces/workspace-1/agents/statuses?page=1&limit=50",
      expect.objectContaining({
        method: "GET",
      })
    );
  });

  it("should call get policy snapshot endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        policySet: "workspace_1",
        hash: "policy-hash-123",
        loadedAt: new Date().toISOString(),
        revokedSigners: [],
        invalidatedAgents: [],
      }),
    });

    const result = await runtime.getPolicySnapshot("workspace-1");

    expect(result.policySet).toBe("workspace_1");
    expect(result.hash).toBe("policy-hash-123");
  });

  it("should call hot reload policy endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        oldHash: "old-hash",
        newHash: "new-hash",
        revalidated: 5,
      }),
    });

    const result = await runtime.hotReloadPolicy("workspace-1", { rules: [] }, "admin");

    expect(result.oldHash).toBe("old-hash");
    expect(result.newHash).toBe("new-hash");
  });

  it("should call revalidate agents endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { agentId: 1, status: "GOVERNED_VALID" },
        { agentId: 2, status: "GOVERNED_INVALIDATED" },
      ],
    });

    const result = await runtime.revalidateAgents("workspace-1", [1, 2]);

    expect(result).toHaveLength(2);
    expect(result[0].agentId).toBe(1);
  });

  it("should call get agent governance endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        governance: {
          proofBundle: {
            policyHash: "hash-123",
            specHash: "spec-hash-456",
          },
        },
      }),
    });

    const result = await runtime.getAgentGovernance("workspace-1", 123);

    expect(result.governance.proofBundle).toBeDefined();
    expect(result.governance.proofBundle.policyHash).toBe("hash-123");
  });
});

describe("ExternalRuntime - Retry Logic", () => {
  let runtime: ExternalRuntime;
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    runtime = new ExternalRuntime({
      baseUrl: "https://orchestrator.example.com",
      apiKey: "test-api-key",
      timeout: 1000,
      retries: 3,
    });
  });

  it("should retry on network error", async () => {
    // First 2 attempts fail, 3rd succeeds
    fetchMock
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    const result = await runtime.startAgent("workspace-1", 123, { mode: "governed" } as any);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should fail after max retries", async () => {
    // All attempts fail
    fetchMock.mockRejectedValue(new Error("Network error"));

    await expect(
      runtime.startAgent("workspace-1", 123, { mode: "governed" } as any)
    ).rejects.toThrow("Request failed after 3 attempts");

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should retry on HTTP 500 error", async () => {
    // First attempt fails with 500, second succeeds
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    const result = await runtime.startAgent("workspace-1", 123, { mode: "governed" } as any);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("ExternalRuntime - Configuration", () => {
  it("should use default timeout and retries", () => {
    const runtime = new ExternalRuntime({
      baseUrl: "https://orchestrator.example.com",
      apiKey: "test-api-key",
    });

    expect(runtime).toBeDefined();
  });

  it("should strip trailing slash from baseUrl", () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock;

    const runtime = new ExternalRuntime({
      baseUrl: "https://orchestrator.example.com/", // Trailing slash
      apiKey: "test-api-key",
    });

    runtime.startAgent("workspace-1", 123, { mode: "governed" } as any);

    // URL should not have double slashes
    expect(fetchMock).toHaveBeenCalledWith(
      "https://orchestrator.example.com/v1/workspaces/workspace-1/agents/123/start",
      expect.any(Object)
    );
  });
});
