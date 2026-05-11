/**
 * Phase 12.5 §12 — template-run-id → usage-event threading tests.
 *
 * Verifies the router collects template-run row ids returned by the
 * §11 audit recorder and threads them into the §4 usage recorder's
 * event (the new `queryTemplateRunIds` field). Closes the loop on
 * `ags_graph_skill_runtime_usages.query_template_run_ids` — previously
 * always `null`, now populated when a template ran AND the recorder
 * returned an id.
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

function makeRepo(): GraphRepository {
  return {
    async localGraph(_: string, __: TraversalOptions, ___: RuntimeContext) {
      return { nodes: [], edges: [], truncated: false };
    },
    async globalGraphSample(_: TraversalOptions, __: RuntimeContext) {
      return { nodes: [], edges: [], truncated: false };
    },
    async executeTemplate(input: QueryTemplateExecutionInput) {
      return {
        rows: [{ tpl: input.templateKey }],
        truncated: false,
        durationMs: 0,
        templateVersion: "v1",
      };
    },
  } as unknown as GraphRepository;
}

describe("Phase 12.5 §12 — template-run-id → usage-event threading", () => {
  it("usage event includes queryTemplateRunIds when the template-run recorder returns a sync number", async () => {
    const usageEvents: GraphRetrievalUsageEvent[] = [];
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordQueryTemplateRun: () => 555, // sync return
      recordRuntimeUsage: (e) => {
        usageEvents.push(e);
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
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0].queryTemplateRunIds).toEqual([555]);
  });

  it("usage event includes queryTemplateRunIds when the recorder returns a Promise<number>", async () => {
    const usageEvents: GraphRetrievalUsageEvent[] = [];
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordQueryTemplateRun: async () => 777,
      recordRuntimeUsage: (e) => {
        usageEvents.push(e);
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
    expect(usageEvents[0].queryTemplateRunIds).toEqual([777]);
  });

  it("usage event omits queryTemplateRunIds when the recorder returns null", async () => {
    const usageEvents: GraphRetrievalUsageEvent[] = [];
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordQueryTemplateRun: () => null,
      recordRuntimeUsage: (e) => {
        usageEvents.push(e);
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
    expect(usageEvents[0].queryTemplateRunIds).toBeUndefined();
  });

  it("usage event omits queryTemplateRunIds when the recorder returns void (legacy)", async () => {
    const usageEvents: GraphRetrievalUsageEvent[] = [];
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordQueryTemplateRun: () => {
        /* void */
      },
      recordRuntimeUsage: (e) => {
        usageEvents.push(e);
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
    expect(usageEvents[0].queryTemplateRunIds).toBeUndefined();
  });

  it("usage event omits queryTemplateRunIds when no template-run recorder is wired", async () => {
    const usageEvents: GraphRetrievalUsageEvent[] = [];
    const router = new GraphRetrievalRouter(makeRepo(), {
      // recordQueryTemplateRun omitted
      recordRuntimeUsage: (e) => {
        usageEvents.push(e);
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
    expect(usageEvents[0].queryTemplateRunIds).toBeUndefined();
  });

  it("async recorder that rejects does NOT block the usage write (queryTemplateRunIds omitted, usage still fires)", async () => {
    const usageEvents: GraphRetrievalUsageEvent[] = [];
    const router = new GraphRetrievalRouter(makeRepo(), {
      recordQueryTemplateRun: async () => {
        throw new Error("async oh no");
      },
      recordRuntimeUsage: (e) => {
        usageEvents.push(e);
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
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0].queryTemplateRunIds).toBeUndefined();
  });
});
