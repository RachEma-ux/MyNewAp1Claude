import { beforeEach, describe, expect, it, vi } from "vitest";
import { llmAuditEvents, llmPromotions, llms } from "../../drizzle/schema";
import { createLLM, createLLMVersion, updateLLM, archiveLLM, executePromotion } from "./llms";

const state = vi.hoisted(() => ({
  db: null as any,
}));

vi.mock("./connection", () => ({
  getDb: () => state.db,
}));

function createFakeDb(options: {
  selectResponses?: any[];
  insertReturningResponses?: any[];
  updateReturningResponses?: any[];
  failAuditInsert?: boolean;
}) {
  const selectResponses = [...(options.selectResponses ?? [])];
  const insertReturningResponses = [...(options.insertReturningResponses ?? [])];
  const updateReturningResponses = [...(options.updateReturningResponses ?? [])];
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const updates: Array<{ table: unknown; value: unknown }> = [];

  const db: any = {
    inserts,
    updates,
    transaction: async (callback: (tx: any) => Promise<any>) => callback(db),
    select: () => ({
      from: () => {
        const query: any = {
          where: () => query,
          orderBy: () => query,
          limit: async () => selectResponses.shift() ?? [],
          then: (resolve: (value: any) => any) => resolve(selectResponses.shift() ?? []),
        };
        return query;
      },
    }),
    insert: (table: unknown) => ({
      values: (value: unknown) => {
        if (options.failAuditInsert && table === llmAuditEvents) {
          throw new Error("audit insert failed");
        }

        inserts.push({ table, value });
        const pending = insertReturningResponses.shift() ?? [];
        return {
          returning: async () => pending,
          then: (resolve: (value: any) => any) => resolve(undefined),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (value: unknown) => {
        updates.push({ table, value });
        return {
          where: (..._args: any[]) => ({
            returning: async () => updateReturningResponses.shift() ?? [],
            then: (resolve: (value: any) => any) => resolve(undefined),
          }),
          then: (resolve: (value: any) => any) => resolve(undefined),
        };
      },
    }),
  };

  return db;
}

describe("LLM governance DB paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- createLLM: blocking audit ----

  it("blocks LLM creation when required audit persistence fails", async () => {
    state.db = createFakeDb({
      insertReturningResponses: [[{ id: 1, name: "test", role: "executor" }]],
      failAuditInsert: true,
    });

    await expect(
      createLLM({
        name: "test",
        role: "executor" as any,
        createdBy: 5,
      } as any)
    ).rejects.toThrow("audit insert failed");
  });

  it("creates LLM with blocking audit in a transaction", async () => {
    state.db = createFakeDb({
      insertReturningResponses: [[{ id: 1, name: "test", role: "executor" }]],
    });

    const result = await createLLM({
      name: "test",
      role: "executor" as any,
      createdBy: 5,
    } as any);

    expect(result.id).toBe(1);
    // Two inserts: llm row + audit event
    expect(state.db.inserts).toHaveLength(2);
    expect(state.db.inserts[0].table).toBe(llms);
    expect(state.db.inserts[1].table).toBe(llmAuditEvents);
  });

  // ---- updateLLM: blocking audit ----

  it("blocks LLM update when required audit persistence fails", async () => {
    state.db = createFakeDb({
      selectResponses: [[{ id: 1, name: "updated" }]],
      failAuditInsert: true,
    });

    await expect(
      updateLLM(1, { name: "updated" }, 5)
    ).rejects.toThrow("audit insert failed");
  });

  // ---- archiveLLM: blocking audit ----

  it("blocks LLM archive when required audit persistence fails", async () => {
    state.db = createFakeDb({
      failAuditInsert: true,
    });

    await expect(
      archiveLLM(1, 5)
    ).rejects.toThrow("audit insert failed");
  });

  // ---- createLLMVersion: blocking audit ----

  it("blocks version creation when required audit persistence fails", async () => {
    state.db = createFakeDb({
      selectResponses: [[]],
      insertReturningResponses: [[{ id: 101, llmId: 1, version: 1, environment: "sandbox" }]],
      failAuditInsert: true,
    });

    await expect(
      createLLMVersion({
        llmId: 1,
        environment: "sandbox",
        config: { model: { name: "demo" }, runtime: { type: "local" } },
        policyDecision: "pass",
        attestationStatus: "pending",
        driftStatus: "none",
        callable: true,
        createdBy: 7,
      } as any)
    ).rejects.toThrow("audit insert failed");
  });

  // ---- executePromotion: CAS pattern ----

  it("executes an approved promotion using the promotion id", async () => {
    state.db = createFakeDb({
      selectResponses: [
        // 1. getPromotionById(55)
        [{ id: 55, llmVersionId: 11, fromEnvironment: "sandbox", toEnvironment: "governed", status: "approved" }],
        // 2. Source version select (after CAS succeeds)
        [{ id: 11, llmId: 3, environment: "sandbox", config: { model: { name: "demo" } }, configHash: "a".repeat(64), policyHash: "b".repeat(64), policyDecision: "pass", policyViolations: null, policyBundleRef: null, attestationContract: null }],
        // 3. Existing versions select (for next version number)
        [{ id: 11, version: 1 }],
      ],
      updateReturningResponses: [
        // CAS update returns the locked promotion
        [{ id: 55, llmVersionId: 11, fromEnvironment: "sandbox", toEnvironment: "governed", status: "executing" }],
      ],
      insertReturningResponses: [
        // New version insert
        [{ id: 12, llmId: 3, version: 2, environment: "governed", configHash: "a".repeat(64), policyHash: "b".repeat(64) }],
      ],
    });

    const result = await executePromotion(55, 9);

    expect(result.id).toBe(12);
    // Two updates: CAS lock (status=executing) + final mark (status=executed)
    expect(state.db.updates).toHaveLength(2);
    expect(state.db.updates[0].table).toBe(llmPromotions);
    expect(state.db.updates[0].value).toMatchObject({ status: "executing" });
    expect(state.db.updates[1].table).toBe(llmPromotions);
    expect(state.db.updates[1].value).toMatchObject({ status: "executed" });
  });

  it("fails for an invalid promotion id", async () => {
    state.db = createFakeDb({
      selectResponses: [[]],
    });

    await expect(executePromotion(999, 9)).rejects.toThrow("Promotion not found");
  });

  it("blocks non-approved promotions", async () => {
    state.db = createFakeDb({
      selectResponses: [
        // getPromotionById returns a pending promotion
        [{ id: 55, llmVersionId: 11, fromEnvironment: "sandbox", toEnvironment: "governed", status: "pending" }],
        // Re-select after CAS fails
        [{ id: 55, llmVersionId: 11, fromEnvironment: "sandbox", toEnvironment: "governed", status: "pending" }],
      ],
      updateReturningResponses: [
        // CAS fails — status != "approved"
        [],
      ],
    });

    await expect(executePromotion(55, 9)).rejects.toThrow("Promotion must be approved before execution");
  });

  it("blocks duplicate promotion execution", async () => {
    state.db = createFakeDb({
      selectResponses: [
        // getPromotionById returns an already-executed promotion
        [{ id: 55, llmVersionId: 11, fromEnvironment: "sandbox", toEnvironment: "governed", status: "executed", executedAt: new Date(), newVersionId: 12 }],
        // Re-select after CAS fails
        [{ id: 55, llmVersionId: 11, fromEnvironment: "sandbox", toEnvironment: "governed", status: "executed", executedAt: new Date(), newVersionId: 12 }],
      ],
      updateReturningResponses: [
        // CAS fails — already executed
        [],
      ],
    });

    await expect(executePromotion(55, 9)).rejects.toThrow("Promotion has already been executed");
  });
});
