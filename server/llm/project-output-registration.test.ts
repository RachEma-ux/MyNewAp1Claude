import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerProjectOutputAsLLMVersionCandidate } from "./project-output-registration";

const mocks = vi.hoisted(() => ({
  db: null as any,
  createLLMVersionWithExecutor: vi.fn(),
  eq: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
}));

vi.mock("../db", () => ({
  getDb: () => mocks.db,
  createLLMVersionWithExecutor: mocks.createLLMVersionWithExecutor,
  eq: mocks.eq,
  desc: mocks.desc,
}));

vi.mock("../policies/llm-policy-engine", () => ({
  LLMPolicyEngine: {
    evaluate: vi.fn().mockResolvedValue({
      decision: "allow",
      violations: [],
      warnings: [],
      policyHash: "test-policy-hash",
      evaluatedAt: new Date(),
    }),
  },
}));

function createFakeDb(selectResponses: any[]) {
  const queue = [...selectResponses];
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const updates: Array<{ table: unknown; value: unknown }> = [];
  return {
    inserts,
    updates,
    transaction: async (callback: (tx: any) => Promise<any>) => {
      const tx: any = {
        inserts,
        updates,
        select: () => ({
          from: () => {
            const query: any = {
              where: () => query,
              orderBy: () => query,
              then: (resolve: (value: any) => any) => resolve(queue.shift() ?? []),
            };
            return query;
          },
        }),
        insert: (_table: unknown) => ({
          values: (value: unknown) => {
            inserts.push({ table: _table, value });
            return {
              returning: async () => [{ id: 99, name: "auto-created" }],
              then: (resolve: (value: any) => any) => resolve(undefined),
            };
          },
        }),
        update: (_table: unknown) => ({
          set: (value: unknown) => {
            updates.push({ table: _table, value });
            return {
              where: (..._args: any[]) => ({
                returning: async () => [],
                then: (resolve: (value: any) => any) => resolve(undefined),
              }),
              then: (resolve: (value: any) => any) => resolve(undefined),
            };
          },
        }),
      };
      return callback(tx);
    },
  };
}

describe("project output registration handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks incomplete projects", async () => {
    mocks.db = createFakeDb([
      [{ id: 5, llmId: 7, status: "running", completedAt: null }],
    ]);

    await expect(
      registerProjectOutputAsLLMVersionCandidate({
        projectId: 5,
        actorId: 2,
        environment: "sandbox",
        config: { runtime: { type: "local" }, model: { name: "demo" } },
        evaluationThreshold: 0.8,
        useQuantizedArtifact: false,
      })
    ).rejects.toThrow("Creation project must be completed before registering a governed LLM version");
  });

  it("registers a governed version for a valid completed project with existing llmId", async () => {
    mocks.db = createFakeDb([
      [{ id: 5, llmId: 7, status: "completed", completedAt: new Date(), finalModelPath: "/models/final.gguf", ollamaModelName: "demo", currentPhase: "phase_8_registration" }],
      [{ id: 10, validated: true, status: "completed" }],
      [{ id: 12, status: "completed", completedAt: new Date(), checkpointPath: "/models/checkpoint", loraAdapterPath: null }],
      [{ id: 14, status: "completed", completedAt: new Date(), overallScore: "0.91" }],
      [],
      [{ id: 7, name: "demo-llm", role: "executor" }],
    ]);
    mocks.createLLMVersionWithExecutor.mockResolvedValue({ id: 77 });

    const version = await registerProjectOutputAsLLMVersionCandidate({
      projectId: 5,
      actorId: 2,
      environment: "sandbox",
      config: { runtime: { type: "local" }, model: { name: "demo" } },
      evaluationThreshold: 0.8,
      useQuantizedArtifact: false,
    });

    expect(version).toEqual({ id: 77 });
    expect(mocks.createLLMVersionWithExecutor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        llmId: 7,
        callable: false,
        config: expect.objectContaining({
          provenance: expect.objectContaining({ trainingRunId: 12, evaluationId: 14 }),
        }),
      })
    );
  });

  it("creates LLM identity at handoff time when project has no llmId", async () => {
    mocks.db = createFakeDb([
      // Project with no llmId
      [{ id: 5, llmId: null, name: "my-model", status: "completed", completedAt: new Date(), finalModelPath: "/models/final.gguf", ollamaModelName: "demo", currentPhase: "phase_8_registration", target: { useCase: "chat_assistant" } }],
      // Datasets
      [{ id: 10, validated: true, status: "completed" }],
      // Training runs
      [{ id: 12, status: "completed", completedAt: new Date(), checkpointPath: "/models/checkpoint", loraAdapterPath: null }],
      // Evaluations
      [{ id: 14, status: "completed", completedAt: new Date(), overallScore: "0.91" }],
      // Quantizations
      [],
      // LLM record lookup for policy evaluation (auto-created LLM)
      [{ id: 99, name: "auto-created", role: "executor" }],
    ]);
    mocks.createLLMVersionWithExecutor.mockResolvedValue({ id: 77 });

    const version = await registerProjectOutputAsLLMVersionCandidate({
      projectId: 5,
      actorId: 2,
      environment: "sandbox",
      config: { runtime: { type: "local" }, model: { name: "demo" } },
      evaluationThreshold: 0.8,
      useQuantizedArtifact: false,
    });

    expect(version).toEqual({ id: 77 });
    // LLM identity was created during handoff (insert into llms + audit event + project update)
    expect(mocks.db.inserts.length).toBeGreaterThanOrEqual(1);
    expect(mocks.db.updates.length).toBeGreaterThanOrEqual(1);
    // The version was created with the auto-generated llmId (99 from mock)
    expect(mocks.createLLMVersionWithExecutor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        llmId: 99,
        callable: false,
      })
    );
  });
});
