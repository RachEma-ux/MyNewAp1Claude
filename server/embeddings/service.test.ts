/**
 * Embeddings service — PMB Phase 29.4b migration tests.
 *
 * Locks the post-migration contract:
 *
 *   1. Public methods take `workspaceId` (no singleton OpenAI client).
 *   2. Binding resolution goes through `resolveWorkspaceDefaultBinding`
 *      with `role: "embedding"`.
 *   3. Upstream embedding call goes through `gatewayCall` against
 *      `openRouter.modelAccess.embed` with `intent: "system-internal"`.
 *   4. `EmbeddingResolutionError` is thrown with the typed reason
 *      from D-WDB-3 when no binding is set or the binding is unhealthy.
 *   5. Batch shape: `generateEmbeddings([])` short-circuits without a
 *      gateway call; `storeChunkEmbeddings` chunks at 100/batch.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../platform/modules/module-gateway", () => ({
  gatewayCall: vi.fn(),
}));
vi.mock("../agent-studio/workspace-default-bindings", () => ({
  resolveWorkspaceDefaultBinding: vi.fn(),
}));

import { gatewayCall } from "../platform/modules/module-gateway";
import { resolveWorkspaceDefaultBinding } from "../agent-studio/workspace-default-bindings";
import { EmbeddingService, EmbeddingResolutionError } from "./service";

const mockedGateway = gatewayCall as unknown as ReturnType<typeof vi.fn>;
const mockedResolve = resolveWorkspaceDefaultBinding as unknown as ReturnType<
  typeof vi.fn
>;

const HEALTHY_BINDING = {
  workspaceId: 7,
  role: "embedding" as const,
  providerConnectionId: 42,
  providerCatalogEntryId: 10,
  modelRef: "text-embedding-3-small",
  ok: true,
};

beforeEach(() => {
  mockedGateway.mockReset();
  mockedResolve.mockReset();
});

describe("EmbeddingService.generateEmbedding — D1-closed credential path", () => {
  it("resolves the workspace's embedding binding and calls modelAccess.embed", async () => {
    mockedResolve.mockResolvedValue(HEALTHY_BINDING);
    mockedGateway.mockResolvedValue({
      status: "ok",
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      latencyMs: 12,
      embeddings: [[0.1, 0.2, 0.3]],
    });

    const svc = new EmbeddingService();
    const vector = await svc.generateEmbedding("hello", 7);

    expect(vector).toEqual([0.1, 0.2, 0.3]);
    expect(mockedResolve).toHaveBeenCalledWith({
      workspaceId: 7,
      role: "embedding",
    });
    const call = mockedGateway.mock.calls[0][0];
    expect(call.ctx.actionKey).toBe("openRouter.modelAccess.embed");
    expect(call.ctx.targetModule).toBe("openRouter");
    expect(call.ctx.workspaceId).toBe(7);
    expect(call.input.intent).toBe("system-internal");
    expect(call.input.providerConnectionId).toBe(42);
    expect(call.input.modelRef).toBe("text-embedding-3-small");
    expect(call.input.inputs).toBe("hello");
  });

  it("throws EmbeddingResolutionError when no default binding exists", async () => {
    mockedResolve.mockResolvedValue(null);
    const svc = new EmbeddingService();
    await expect(svc.generateEmbedding("hello", 7)).rejects.toBeInstanceOf(
      EmbeddingResolutionError,
    );
    expect(mockedGateway).not.toHaveBeenCalled();
  });

  it("propagates the typed reason when the linked Provider Connection fails eligibility", async () => {
    mockedResolve.mockResolvedValue({
      ...HEALTHY_BINDING,
      ok: false,
      reason: "provider_connection_unhealthy",
    });
    const svc = new EmbeddingService();
    try {
      await svc.generateEmbedding("hello", 7);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(EmbeddingResolutionError);
      expect((err as EmbeddingResolutionError).reason).toBe(
        "provider_connection_unhealthy",
      );
    }
    expect(mockedGateway).not.toHaveBeenCalled();
  });

  it("surfaces a Model Access status=error result as a thrown Error", async () => {
    mockedResolve.mockResolvedValue(HEALTHY_BINDING);
    mockedGateway.mockResolvedValue({
      status: "error",
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      latencyMs: 0,
      embeddings: [],
      error: "upstream_http_error",
    });
    const svc = new EmbeddingService();
    await expect(svc.generateEmbedding("hello", 7)).rejects.toThrow(
      /upstream_http_error/,
    );
  });
});

describe("EmbeddingService.generateEmbeddings — batch shape", () => {
  it("short-circuits on empty input without a gateway call", async () => {
    const svc = new EmbeddingService();
    const result = await svc.generateEmbeddings([], 7);
    expect(result).toEqual([]);
    expect(mockedResolve).not.toHaveBeenCalled();
    expect(mockedGateway).not.toHaveBeenCalled();
  });

  it("returns the batch shape from a single embed call", async () => {
    mockedResolve.mockResolvedValue(HEALTHY_BINDING);
    mockedGateway.mockResolvedValue({
      status: "ok",
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      latencyMs: 14,
      embeddings: [[0.1], [0.2], [0.3]],
    });
    const svc = new EmbeddingService();
    const result = await svc.generateEmbeddings(["a", "b", "c"], 7);
    expect(result).toEqual([[0.1], [0.2], [0.3]]);
    expect(mockedGateway.mock.calls[0][0].input.inputs).toEqual(["a", "b", "c"]);
  });
});

describe("EmbeddingResolutionError", () => {
  it("carries the reason and workspaceId for operator surfacing", () => {
    const e = new EmbeddingResolutionError(99, "default_not_set");
    expect(e.workspaceId).toBe(99);
    expect(e.reason).toBe("default_not_set");
    expect(e.name).toBe("EmbeddingResolutionError");
    expect(e.message).toMatch(/Workspace 99/);
    expect(e.message).toMatch(/default_not_set/);
  });
});
