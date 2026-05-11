/**
 * Phase 12.5 §2 — GraphRetrievalRouter eligibility-driven templateKey
 * resolution.
 *
 * Covers:
 *   - Explicit templateKey still wins over eligibility (back-compat)
 *   - When templateKey is absent and eligibility+packTemplates are
 *     supplied, router resolves a key from the highest-ranked pack
 *   - preferTemplateKeys propagates from input through to the helper
 *   - Eligibility without packTemplates is a no-op (still no template)
 *   - When no eligible pack has templates, router falls through to
 *     the existing empty-result behavior (no exception, no chunks)
 *   - graphrag_text2cypher also uses the resolution path
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

function makeStubRepo(): {
  repo: GraphRepository;
  templateCalls: QueryTemplateExecutionInput[];
} {
  const templateCalls: QueryTemplateExecutionInput[] = [];
  const repo = {
    async localGraph(
      _: string,
      __: TraversalOptions,
      ___: RuntimeContext,
    ) {
      return { nodes: [], edges: [], truncated: false };
    },
    async globalGraphSample(_: TraversalOptions, __: RuntimeContext) {
      return { nodes: [], edges: [], truncated: false };
    },
    async executeTemplate(input: QueryTemplateExecutionInput) {
      templateCalls.push(input);
      return {
        rows: [{ marker: input.templateKey }],
        truncated: false,
        durationMs: 0,
        templateVersion: "v1",
      };
    },
  } as unknown as GraphRepository;
  return { repo, templateCalls };
}

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

function input(
  overrides: Partial<GraphRetrievalInput> = {},
): GraphRetrievalInput {
  return {
    mode: "graphrag_traversal",
    query: "q",
    runtime: RUNTIME,
    ...overrides,
  };
}

describe("GraphRetrievalRouter — Phase 12.5 §2 eligibility resolution", () => {
  it("explicit templateKey wins over eligibility (back-compat)", async () => {
    const { repo, templateCalls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    await router.retrieve(
      input({
        templateKey: "explicit-tpl",
        eligibility: elig(pack("p")),
        packTemplates: new Map([["p", ["pack-tpl"]]]),
      }),
    );
    expect(templateCalls).toHaveLength(1);
    expect(templateCalls[0].templateKey).toBe("explicit-tpl");
  });

  it("resolves templateKey from eligibility when absent", async () => {
    const { repo, templateCalls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve(
      input({
        eligibility: elig(pack("top"), pack("second")),
        packTemplates: new Map([
          ["top", ["tpl-a"]],
          ["second", ["tpl-b"]],
        ]),
      }),
    );
    expect(templateCalls).toHaveLength(1);
    expect(templateCalls[0].templateKey).toBe("tpl-a");
    expect(r.contextBlocks).toHaveLength(1);
    // Block id format uses the resolved templateKey
    expect(r.contextBlocks[0].id).toBe("tpl-a:0");
  });

  it("preferTemplateKeys propagates through to the helper", async () => {
    const { repo, templateCalls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    await router.retrieve(
      input({
        eligibility: elig(pack("p1"), pack("p2")),
        packTemplates: new Map([
          ["p1", ["tpl-a"]],
          ["p2", ["tpl-preferred"]],
        ]),
        preferTemplateKeys: ["tpl-preferred"],
      }),
    );
    expect(templateCalls[0].templateKey).toBe("tpl-preferred");
  });

  it("eligibility without packTemplates is a no-op (no template selected, no executeTemplate call)", async () => {
    const { repo, templateCalls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve(
      input({
        eligibility: elig(pack("p1")),
        // packTemplates intentionally missing
      }),
    );
    expect(templateCalls).toHaveLength(0);
    expect(r.contextBlocks).toEqual([]);
    expect(r.rejectionReason).toBeUndefined();
  });

  it("no eligible pack with templates → falls through to empty result, no executeTemplate call", async () => {
    const { repo, templateCalls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve(
      input({
        eligibility: elig(pack("p1")),
        packTemplates: new Map([["p1", []]]),
      }),
    );
    expect(templateCalls).toHaveLength(0);
    expect(r.contextBlocks).toEqual([]);
  });

  it("graphrag_text2cypher path also uses eligibility resolution when read-only cypher passes validation", async () => {
    const { repo, templateCalls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    await router.retrieve(
      input({
        mode: "graphrag_text2cypher",
        generatedCypher: "MATCH (n) RETURN n LIMIT 1",
        eligibility: elig(pack("p1")),
        packTemplates: new Map([["p1", ["text2cypher-tpl"]]]),
      }),
    );
    expect(templateCalls).toHaveLength(1);
    expect(templateCalls[0].templateKey).toBe("text2cypher-tpl");
  });
});
