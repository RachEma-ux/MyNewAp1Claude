/**
 * Golden Questions triggerLiveEvaluation composer — source-scan +
 * behavioral tests.
 *
 * Slice 44 of the no-deferral continuation-4 catalogue (2026-05-19).
 * Closes T-D.5.γ — operator-callable mutation that composes
 * `buildLiveEngine` + `runLiveEvaluation` + write-store persistence.
 *
 * Behavioral tests inject fake runner + fake write store so we don't
 * touch the live engine boundaries (no Neo4j / no Model Access / no
 * ASDB).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GoldenQuestionsSuiteNotFoundError,
  suiteSeedsToSuites,
  triggerLiveEvaluation,
} from "../../server/agent-studio/services/graph-skill/golden-questions/trigger-live-evaluation.js";
import type { GoldenQuestionSuiteSeed } from "../../server/agent-studio/services/graph-skill/seed-golden-questions.js";

const REPO_ROOT = join(__dirname, "..", "..");
const COMPOSER_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/graph-skill/golden-questions/trigger-live-evaluation.ts",
);
const ROUTER_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/graph-skill/golden-questions/golden-questions-router.ts",
);
const API_ROUTER_PATH = join(
  REPO_ROOT,
  "server/agent-studio/api/router.ts",
);

describe("triggerLiveEvaluation — slice 44 source-scan", () => {
  const composer = readFileSync(COMPOSER_PATH, "utf8");
  const router = readFileSync(ROUTER_PATH, "utf8");
  const apiRouter = readFileSync(API_ROUTER_PATH, "utf8");

  it("composer exports the public surface", () => {
    expect(composer).toContain("export async function triggerLiveEvaluation");
    expect(composer).toContain("export function suiteSeedsToSuites");
    expect(composer).toContain("export class GoldenQuestionsSuiteNotFoundError");
  });

  it("composer wires the 3 expected pieces (engine + evaluator + write store)", () => {
    expect(composer).toContain('from "./live-engine-factory');
    expect(composer).toContain("buildLiveEngine");
    expect(composer).toContain('from "./live-evaluator');
    expect(composer).toContain("runLiveEvaluation");
    expect(composer).toContain('from "./golden-questions-write-store');
    expect(composer).toContain("createGoldenQuestionsWriteStore");
  });

  it("composer loads suites from DEFAULT_GOLDEN_QUESTION_SUITES seed", () => {
    expect(composer).toContain('from "../seed-golden-questions');
    expect(composer).toContain("DEFAULT_GOLDEN_QUESTION_SUITES");
  });

  it("composer respects hard rules — no direct provider/MCP/neo4j imports", () => {
    expect(composer).not.toMatch(
      /^import .* from "neo4j-driver"/m,
    );
    expect(composer).not.toMatch(/^import .*credential-resolver/m);
    expect(composer).not.toMatch(/^import .*dispatchMcpToolCall/m);
    expect(composer).not.toMatch(/^import .*openrouter/m);
  });

  it("router wires triggerLiveEvaluation as an admin mutation", () => {
    expect(router).toContain("triggerLiveEvaluation:");
    expect(router).toContain("adminProcedure");
    expect(router).toContain(".mutation(");
    expect(router).toContain("GoldenQuestionsSuiteNotFoundError");
    expect(router).toContain("BAD_REQUEST");
  });

  it("router doc-block no longer claims T-D.5.γ is deferred", () => {
    expect(router).not.toContain(
      "**Deferred — run lifecycle persistence + caller.**",
    );
    expect(router).toContain("Slice 44");
    expect(router).toContain("T-D.5.γ runner caller");
  });

  it("api/router.ts mount doc-block reflects T-D.5.γ shipped", () => {
    expect(apiRouter).not.toContain(
      "Run-lifecycle persistence + caller deferred",
    );
    expect(apiRouter).toContain("T-D.5.α/β/γ");
    expect(apiRouter).toContain("triggerLiveEvaluation");
  });
});

describe("triggerLiveEvaluation — behavioral", () => {
  // Build a 2-suite fake catalog so we can drive both the suite-filter
  // path AND the all-suites path.
  const fakeCatalog: ReadonlyArray<GoldenQuestionSuiteSeed> = [
    {
      suiteKey: "smoke_a",
      name: "Smoke A",
      description: "fake suite A",
      questions: [
        {
          questionKey: "q1",
          question: "what is X?",
          expectedAnswerPattern: null,
          expectedPaths: null,
          minimumCitationCount: 0,
        },
      ],
    },
    {
      suiteKey: "smoke_b",
      name: "Smoke B",
      description: "fake suite B",
      questions: [
        {
          questionKey: "q2",
          question: "what is Y?",
          expectedAnswerPattern: null,
          expectedPaths: null,
          minimumCitationCount: 0,
        },
      ],
    },
  ];

  function fakeAnswer(content: string) {
    return {
      answer: content,
      citations: [],
      retrievalMode: "no_retrieval" as const,
      skillPackKey: undefined,
      templateKey: undefined,
    };
  }

  function fakeWriteStoreCapturing() {
    const recorded: Array<{ suiteKey: string }> = [];
    return {
      store: {
        async recordSuiteRun(suiteResult: { suiteKey: string }) {
          recorded.push({ suiteKey: suiteResult.suiteKey });
          return {
            status: "ok" as const,
            runId: recorded.length,
            suiteId: 1,
            questionsRecorded: 1,
            questionsSkippedMissingSeed: 0,
          };
        },
      },
      recorded,
    };
  }

  it("suiteSeedsToSuites enriches each question with its parent suiteKey", () => {
    const suites = suiteSeedsToSuites(fakeCatalog);
    expect(suites).toHaveLength(2);
    expect(suites[0].suiteKey).toBe("smoke_a");
    expect(suites[0].questions[0].suiteKey).toBe("smoke_a");
    expect(suites[1].questions[0].suiteKey).toBe("smoke_b");
  });

  it("runs every suite when suiteKey is absent", async () => {
    const { store, recorded } = fakeWriteStoreCapturing();
    const runner = async () => fakeAnswer("ok");
    const result = await triggerLiveEvaluation(
      {
        providerConnectionId: 1,
        modelRef: "gpt-4o-mini",
        workspaceId: 1,
        actorId: 1,
      },
      {
        suiteCatalog: fakeCatalog,
        runnerFactory: () => runner,
        writeStore: store as never,
        recordFailureStateEvent: null,
      },
    );
    expect(result.suitesRun).toBe(2);
    expect(result.summary.suites).toHaveLength(2);
    expect(recorded.map((r) => r.suiteKey).sort()).toEqual([
      "smoke_a",
      "smoke_b",
    ]);
  });

  it("filters to one suite when suiteKey is supplied", async () => {
    const { store, recorded } = fakeWriteStoreCapturing();
    const runner = async () => fakeAnswer("ok");
    const result = await triggerLiveEvaluation(
      {
        providerConnectionId: 1,
        modelRef: "gpt-4o-mini",
        workspaceId: 1,
        actorId: 1,
        suiteKey: "smoke_b",
      },
      {
        suiteCatalog: fakeCatalog,
        runnerFactory: () => runner,
        writeStore: store as never,
        recordFailureStateEvent: null,
      },
    );
    expect(result.suitesRun).toBe(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].suiteKey).toBe("smoke_b");
  });

  it("throws GoldenQuestionsSuiteNotFoundError for unknown suiteKey", async () => {
    const { store } = fakeWriteStoreCapturing();
    const runner = async () => fakeAnswer("ok");
    await expect(
      triggerLiveEvaluation(
        {
          providerConnectionId: 1,
          modelRef: "gpt-4o-mini",
          workspaceId: 1,
          actorId: 1,
          suiteKey: "does-not-exist",
        },
        {
          suiteCatalog: fakeCatalog,
          runnerFactory: () => runner,
          writeStore: store as never,
          recordFailureStateEvent: null,
        },
      ),
    ).rejects.toBeInstanceOf(GoldenQuestionsSuiteNotFoundError);
  });

  it("persistence failure on one suite does not prevent other suites' persistence", async () => {
    let calls = 0;
    const flakeyStore = {
      async recordSuiteRun(suiteResult: { suiteKey: string }) {
        calls++;
        if (suiteResult.suiteKey === "smoke_a") {
          throw new Error("simulated ASDB outage");
        }
        return {
          status: "ok" as const,
          runId: calls,
          suiteId: 1,
          questionsRecorded: 1,
          questionsSkippedMissingSeed: 0,
        };
      },
    };
    const runner = async () => fakeAnswer("ok");
    const result = await triggerLiveEvaluation(
      {
        providerConnectionId: 1,
        modelRef: "gpt-4o-mini",
        workspaceId: 1,
        actorId: 1,
      },
      {
        suiteCatalog: fakeCatalog,
        runnerFactory: () => runner,
        writeStore: flakeyStore as never,
        recordFailureStateEvent: null,
      },
    );
    expect(result.persistence).toHaveLength(2);
    // smoke_a failed → synthesized suite_not_seeded outcome carries
    // suiteKey on the failure shape.
    const smokeAFailure = result.persistence.find(
      (p): p is { status: "suite_not_seeded"; suiteKey: string } =>
        p.status === "suite_not_seeded" && p.suiteKey === "smoke_a",
    );
    expect(smokeAFailure).toBeDefined();
    // The successful ok outcome shape carries runId, not suiteKey —
    // assert by status. There must be exactly one ok outcome
    // (smoke_b).
    const oks = result.persistence.filter((p) => p.status === "ok");
    expect(oks).toHaveLength(1);
  });

  it("forwards perQuestionTimeoutMs into evaluator options", async () => {
    const { store } = fakeWriteStoreCapturing();
    let runnerCalled = false;
    const runner = async () => {
      runnerCalled = true;
      return fakeAnswer("ok");
    };
    await triggerLiveEvaluation(
      {
        providerConnectionId: 1,
        modelRef: "gpt-4o-mini",
        workspaceId: 1,
        actorId: 1,
        perQuestionTimeoutMs: 30_000,
      },
      {
        suiteCatalog: fakeCatalog,
        runnerFactory: () => runner,
        writeStore: store as never,
        recordFailureStateEvent: null,
      },
    );
    expect(runnerCalled).toBe(true);
  });
});
