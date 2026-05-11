/**
 * Phase 12.5 §4 — GraphRetrievalUsageRecorder port tests.
 *
 * Covers:
 *   - Recorder fires when resolvedSkill is set AND blocks are returned
 *   - Recorder does NOT fire when caller supplied explicit templateKey
 *   - Recorder does NOT fire when no template was resolved (no
 *     eligibility match)
 *   - Recorder does NOT fire when template ran but returned 0 blocks
 *   - Sync throws from recorder do not fail the retrieval call;
 *     surface as a synthetic safety event
 *   - Async rejections from recorder are silently caught (fire-and-forget)
 *   - runtimeRunId + workspaceId from input propagate to the event
 */

import { describe, it, expect, vi } from "vitest";
import {
  GraphRetrievalRouter,
  type GraphRetrievalUsageEvent,
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

const RUNTIME: RuntimeContext = { workspaceId: 42, userRole: "operator" };

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

function makeRepo(opts?: { templateRows?: Record<string, unknown>[] }): GraphRepository {
  return {
    async localGraph(_: string, __: TraversalOptions, ___: RuntimeContext) {
      return { nodes: [], edges: [], truncated: false };
    },
    async globalGraphSample(_: TraversalOptions, __: RuntimeContext) {
      return { nodes: [], edges: [], truncated: false };
    },
    async executeTemplate(input: QueryTemplateExecutionInput) {
      return {
        rows: opts?.templateRows ?? [{ tpl: input.templateKey }],
        truncated: false,
        durationMs: 0,
        templateVersion: "v1",
      };
    },
  } as unknown as GraphRepository;
}

describe("GraphRetrievalRouter — Phase 12.5 §4 runtime-usage recorder", () => {
  it("fires recorder when resolvedSkill is set and blocks were produced", async () => {
    const events: GraphRetrievalUsageEvent[] = [];
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordRuntimeUsage: (e) => {
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
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      packKey: "p1",
      templateKey: "tpl-x",
      reason: "first_template_in_top_pack",
      mode: "graphrag_traversal",
      runtimeRunId: 999,
      workspaceId: 42,
    });
  });

  it("does NOT fire when caller supplied explicit templateKey (no resolution)", async () => {
    const recorder = vi.fn();
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordRuntimeUsage: recorder,
    });
    await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      templateKey: "explicit",
    });
    expect(recorder).not.toHaveBeenCalled();
  });

  it("does NOT fire when no template was resolved (no eligibility match)", async () => {
    const recorder = vi.fn();
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordRuntimeUsage: recorder,
    });
    await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", []]]), // no templates
    });
    expect(recorder).not.toHaveBeenCalled();
  });

  it("does NOT fire when template ran but returned 0 blocks (truncated/empty case)", async () => {
    const recorder = vi.fn();
    const router = new GraphRetrievalRouter(makeRepo({ templateRows: [] }), {
      recordRuntimeUsage: recorder,
    });
    await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", ["tpl-x"]]]),
    });
    expect(recorder).not.toHaveBeenCalled();
  });

  it("sync throw from recorder does not fail retrieval; surfaces synthetic safety event", async () => {
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordRuntimeUsage: () => {
        throw new Error("oh no");
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
      r.safetyEvents.find((e) => e.blockId === "__recorder__"),
    ).toBeDefined();
  });

  it("async rejection from recorder is silently caught (no synthetic event, no exception)", async () => {
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordRuntimeUsage: async () => {
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
    // Sync code path completed before the async rejection; no synthetic
    // safety event is emitted for async failures (they're swallowed
    // since we can't surface them post-return).
    expect(
      r.safetyEvents.find((e) => e.blockId === "__recorder__"),
    ).toBeUndefined();
    // Give the microtask queue a chance to drain so the unhandled
    // rejection guard doesn't bite the test runner.
    await new Promise((resolve) => setImmediate(resolve));
  });

  it("recorder is optional — router with no options omitted works without errors", async () => {
    const router = new GraphRetrievalRouter(makeRepo());
    const r = await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", ["tpl-x"]]]),
    });
    expect(r.contextBlocks).toHaveLength(1);
    expect(r.resolvedSkill?.packKey).toBe("p1");
  });
});
