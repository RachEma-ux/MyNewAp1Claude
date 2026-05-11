/**
 * Phase 12.5 §3 — resolvedSkill surfaced in router output + adapter
 * chunk metadata + warning.
 */

import { describe, it, expect } from "vitest";
import {
  GraphRetrievalRouter,
  type GraphRetrievalInput,
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

const RUNTIME: RuntimeContext = { workspaceId: 1, userRole: "operator" };

const pack = (
  skillKey: string,
  overrides: Partial<SkillPackSummary> = {},
): SkillPackSummary => ({
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
  ...overrides,
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

function baseInput(
  overrides: Partial<GraphRetrievalInput> = {},
): GraphRetrievalInput {
  return {
    mode: "graphrag_traversal",
    query: "q",
    runtime: RUNTIME,
    ...overrides,
  };
}

describe("GraphRetrievalRouter — resolvedSkill in output", () => {
  it("populates resolvedSkill when eligibility resolved the templateKey", async () => {
    const router = new GraphRetrievalRouter(makeRepo());
    const r = await router.retrieve(
      baseInput({
        eligibility: elig(pack("p-top"), pack("p-second")),
        packTemplates: new Map([
          ["p-top", ["tpl-a"]],
          ["p-second", ["tpl-b"]],
        ]),
      }),
    );
    expect(r.resolvedSkill).toEqual({
      packKey: "p-top",
      templateKey: "tpl-a",
      reason: "first_template_in_top_pack",
    });
  });

  it("populates resolvedSkill with preferred_key_matched reason when prefer hit", async () => {
    const router = new GraphRetrievalRouter(makeRepo());
    const r = await router.retrieve(
      baseInput({
        eligibility: elig(pack("p1"), pack("p2")),
        packTemplates: new Map([
          ["p1", ["tpl-a"]],
          ["p2", ["tpl-preferred"]],
        ]),
        preferTemplateKeys: ["tpl-preferred"],
      }),
    );
    expect(r.resolvedSkill?.reason).toBe("preferred_key_matched");
    expect(r.resolvedSkill?.packKey).toBe("p2");
  });

  it("omits resolvedSkill when caller supplied templateKey directly", async () => {
    const router = new GraphRetrievalRouter(makeRepo());
    const r = await router.retrieve(
      baseInput({
        templateKey: "explicit",
        eligibility: elig(pack("p")),
        packTemplates: new Map([["p", ["pack-tpl"]]]),
      }),
    );
    expect(r.resolvedSkill).toBeUndefined();
  });

  it("omits resolvedSkill when no eligible pack has templates", async () => {
    const router = new GraphRetrievalRouter(makeRepo());
    const r = await router.retrieve(
      baseInput({
        eligibility: elig(pack("p")),
        packTemplates: new Map([["p", []]]),
      }),
    );
    expect(r.resolvedSkill).toBeUndefined();
  });
});

describe("graphragAdapter — resolvedSkill stamped on chunks + warnings (E2E via filters pass-through)", () => {
  it("propagates eligibility from filters through router and stamps chunks + emits warning", async () => {
    const { _resetGraphRepository, TestGraphRepository } = await import(
      "../../server/agent-studio/services/graph/repository"
    );
    const ORIG = process.env.GRAPH_BACKEND;
    process.env.GRAPH_BACKEND = "test";
    _resetGraphRepository();
    try {
      // The TestGraphRepository's executeTemplate returns an empty
      // result; stub it via the cached singleton to return one row.
      const { getGraphRepository } = await import(
        "../../server/agent-studio/services/graph/repository"
      );
      const repo = getGraphRepository() as InstanceType<typeof TestGraphRepository>;
      // Monkey-patch executeTemplate for this test so we get a real row
      // back through the router's traversal branch.
      (repo as unknown as { executeTemplate: unknown }).executeTemplate =
        async (input: QueryTemplateExecutionInput) => ({
          rows: [{ tpl: input.templateKey }],
          truncated: false,
          durationMs: 0,
          templateVersion: "v1",
        });

      const { graphragAdapter } = await import(
        "../../server/agent-studio/services/rac/ingestion/graphrag-adapter"
      );
      const result = await graphragAdapter.search({
        workspaceId: 1,
        sourceId: 42,
        query: "test",
        topK: 5,
        retrievalMethod: "traversal",
        filters: {
          eligibility: elig(pack("p1")),
          packTemplates: new Map([["p1", ["t-1"]]]),
        },
      });
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].metadata?.resolvedSkillPack).toBe("p1");
      expect(result.chunks[0].metadata?.resolvedSkillTemplate).toBe("t-1");
      expect(
        result.warnings.find((w) => w.startsWith("graphrag_resolved_skill")),
      ).toMatch(/pack=p1 template=t-1 reason=first_template_in_top_pack/);
    } finally {
      process.env.GRAPH_BACKEND = ORIG;
      _resetGraphRepository();
    }
  });

  it("explicit templateKey skips resolution: no resolvedSkill warning, no resolvedSkillPack metadata", async () => {
    const { _resetGraphRepository, TestGraphRepository } = await import(
      "../../server/agent-studio/services/graph/repository"
    );
    const ORIG = process.env.GRAPH_BACKEND;
    process.env.GRAPH_BACKEND = "test";
    _resetGraphRepository();
    try {
      const { getGraphRepository } = await import(
        "../../server/agent-studio/services/graph/repository"
      );
      const repo = getGraphRepository() as InstanceType<typeof TestGraphRepository>;
      (repo as unknown as { executeTemplate: unknown }).executeTemplate =
        async (input: QueryTemplateExecutionInput) => ({
          rows: [{ tpl: input.templateKey }],
          truncated: false,
          durationMs: 0,
          templateVersion: "v1",
        });

      const { graphragAdapter } = await import(
        "../../server/agent-studio/services/rac/ingestion/graphrag-adapter"
      );
      const result = await graphragAdapter.search({
        workspaceId: 1,
        sourceId: 42,
        query: "test",
        topK: 5,
        retrievalMethod: "traversal",
        filters: {
          templateKey: "explicit-tpl",
          eligibility: elig(pack("p1")),
          packTemplates: new Map([["p1", ["pack-tpl"]]]),
        },
      });
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].metadata?.resolvedSkillPack).toBeUndefined();
      expect(
        result.warnings.find((w) => w.startsWith("graphrag_resolved_skill")),
      ).toBeUndefined();
    } finally {
      process.env.GRAPH_BACKEND = ORIG;
      _resetGraphRepository();
    }
  });
});
