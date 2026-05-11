/**
 * Phase 12.5 §11 — query-template-run audit port tests.
 *
 * Verifies the `QueryTemplateRunRecorder` port on
 * `GraphRetrievalRouter`:
 *   - Fires on success with `status: "success"`, `resultCount`,
 *     `durationMs`, `parameters`, `userId`, `retrievalRunId`.
 *   - Fires on `executeTemplate` failure with `status: "error"` and
 *     surfaces the original error message; rethrows the original.
 *   - Does NOT fire when the router doesn't reach `executeTemplate`
 *     (no templateKey resolved → no template ran).
 *   - Sync throws from the recorder do not fail the retrieval call;
 *     surface as a synthetic safety event (`__template_run_audit__`).
 *   - Async rejections are fire-and-forget.
 *   - Optional recorder — router with no options omitted works.
 */

import { describe, it, expect, vi } from "vitest";
import {
  GraphRetrievalRouter,
  type QueryTemplateRunEvent,
} from "../../server/agent-studio/services/graph/retrieval/retrieval-router";
import type {
  GraphRepository,
  QueryTemplateExecutionInput,
  RuntimeContext,
  TraversalOptions,
} from "../../server/agent-studio/services/graph/repository";
import type {
  EligibilityResult,
  SkillPackSummary,
} from "../../server/agent-studio/services/graph-skill/public-api";

const RUNTIME: RuntimeContext = { workspaceId: 1, userId: 7, userRole: "operator" };

const pack = (skillKey: string): SkillPackSummary => ({
  id: 1,
  skillKey,
  name: skillKey,
  domain: null,
  supportedNodeTypeKeys: [],
  supportedEdgeTypeKeys: [],
  riskLevel: "low",
  approvalRequired: false,
  active: true,
  allowedRoles: null,
});

const elig = (...packs: SkillPackSummary[]): EligibilityResult => ({
  eligible: packs,
  rejectionReasons: [],
});

function makeRepo(opts?: {
  templateRows?: Record<string, unknown>[];
  throwOnExecute?: Error;
}): GraphRepository {
  return {
    async localGraph(_: string, __: TraversalOptions, ___: RuntimeContext) {
      return { nodes: [], edges: [], truncated: false };
    },
    async globalGraphSample(_: TraversalOptions, __: RuntimeContext) {
      return { nodes: [], edges: [], truncated: false };
    },
    async executeTemplate(input: QueryTemplateExecutionInput) {
      if (opts?.throwOnExecute) throw opts.throwOnExecute;
      return {
        rows: opts?.templateRows ?? [{ tpl: input.templateKey }],
        truncated: false,
        durationMs: 0,
        templateVersion: "v1",
      };
    },
  } as unknown as GraphRepository;
}

describe("GraphRetrievalRouter — Phase 12.5 §11 template-run audit recorder", () => {
  it("fires on success with the right shape", async () => {
    const events: QueryTemplateRunEvent[] = [];
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordQueryTemplateRun: (e) => {
        events.push(e);
      },
    });
    await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      runtimeRunId: 999,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", ["tpl-x"]]]),
      templateParameters: { foo: "bar" },
    });
    expect(events).toHaveLength(1);
    expect(events[0].templateKey).toBe("tpl-x");
    expect(events[0].status).toBe("success");
    expect(events[0].resultCount).toBe(1);
    expect(events[0].parameters).toEqual({ foo: "bar" });
    expect(events[0].userId).toBe(7);
    expect(events[0].retrievalRunId).toBe(999);
    expect(typeof events[0].durationMs).toBe("number");
  });

  it("fires on executeTemplate failure with status=error and rethrows", async () => {
    const events: QueryTemplateRunEvent[] = [];
    const router = new GraphRetrievalRouter(
      makeRepo({ throwOnExecute: new Error("backend down") }),
      {
        recordQueryTemplateRun: (e) => {
          events.push(e);
        },
      },
    );
    await expect(
      router.retrieve({
        mode: "graphrag_traversal",
        query: "q",
        runtime: RUNTIME,
        eligibility: elig(pack("p1")),
        packTemplates: new Map([["p1", ["tpl-x"]]]),
      }),
    ).rejects.toThrow(/backend down/);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("error");
    expect(events[0].errorMessage).toBe("backend down");
    expect(events[0].resultCount).toBeUndefined();
  });

  it("does NOT fire when no templateKey resolved (no eligibility match)", async () => {
    const recorder = vi.fn();
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordQueryTemplateRun: recorder,
    });
    await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", []]]),
    });
    expect(recorder).not.toHaveBeenCalled();
  });

  it("does NOT fire when the mode never reaches executeTemplate (graphrag_local)", async () => {
    const recorder = vi.fn();
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordQueryTemplateRun: recorder,
    });
    await router.retrieve({
      mode: "graphrag_local",
      query: "q",
      runtime: RUNTIME,
      seedNodeId: "n1",
    });
    expect(recorder).not.toHaveBeenCalled();
  });

  it("sync throw from recorder does not fail retrieval; surfaces synthetic safety event", async () => {
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordQueryTemplateRun: () => {
        throw new Error("recorder oh no");
      },
    });
    const r = await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", ["tpl-x"]]]),
    });
    expect(r.contextBlocks).toHaveLength(1);
    expect(
      r.safetyEvents.find((e) => e.blockId === "__template_run_audit__"),
    ).toBeDefined();
  });

  it("async rejection from recorder is silently caught (no synthetic event, no exception)", async () => {
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordQueryTemplateRun: async () => {
        throw new Error("async oh no");
      },
    });
    const r = await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", ["tpl-x"]]]),
    });
    expect(r.contextBlocks).toHaveLength(1);
    expect(
      r.safetyEvents.find((e) => e.blockId === "__template_run_audit__"),
    ).toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it("recorder is optional — router without options omitted works", async () => {
    const router = new GraphRetrievalRouter(makeRepo());
    const r = await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", ["tpl-x"]]]),
    });
    expect(r.contextBlocks).toHaveLength(1);
  });
});
