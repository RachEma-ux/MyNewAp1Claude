/**
 * Phase 12.5 §13 — template-execution gate port tests.
 *
 * Verifies the `TemplateExecutionGate` port on `GraphRetrievalRouter`:
 *   - Gate denial short-circuits to `template_gate_denied_<reason>`.
 *   - Gate allow lets the call proceed to `executeTemplate`.
 *   - Gate is async-tolerant (returns Promise<{ allowed, reason? }>).
 *   - Gate is optional — omitted gate matches pre-§13 behavior.
 *   - When the gate denies, the §11 audit recorder is NOT fired
 *     (no template ran, so no run row to write) and the §4 usage
 *     recorder is NOT fired (no blocks produced).
 */

import { describe, it, expect, vi } from "vitest";
import {
  GraphRetrievalRouter,
  type TemplateExecutionGate,
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

describe("GraphRetrievalRouter — Phase 12.5 §13 template-execution gate", () => {
  it("denial short-circuits with template_gate_denied_<reason> and skips executeTemplate", async () => {
    const repoExecute = vi.fn();
    const repo = makeRepo();
    repo.executeTemplate = repoExecute;
    const gate: TemplateExecutionGate = () => ({
      allowed: false,
      reason: "mutation_not_allowed",
    });
    const router = new GraphRetrievalRouter(repo, {
      templateExecutionGate: gate,
    });
    const r = await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", ["tpl-x"]]]),
    });
    expect(r.rejectionReason).toBe(
      "template_gate_denied_mutation_not_allowed",
    );
    expect(repoExecute).not.toHaveBeenCalled();
  });

  it("denial skips both the §11 audit recorder and the §4 usage recorder", async () => {
    const auditRecorder = vi.fn();
    const usageRecorder = vi.fn();
    const router = new GraphRetrievalRouter(makeRepo(), {
      templateExecutionGate: () => ({
        allowed: false,
        reason: "role_not_allowed",
      }),
      recordQueryTemplateRun: auditRecorder,
      recordRuntimeUsage: usageRecorder,
    });
    await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", ["tpl-x"]]]),
    });
    expect(auditRecorder).not.toHaveBeenCalled();
    expect(usageRecorder).not.toHaveBeenCalled();
  });

  it("allow lets the call proceed and templates execute", async () => {
    const router = new GraphRetrievalRouter(makeRepo(), {
      templateExecutionGate: () => ({ allowed: true }),
    });
    const r = await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", ["tpl-x"]]]),
    });
    expect(r.contextBlocks).toHaveLength(1);
    expect(r.rejectionReason).toBeUndefined();
  });

  it("supports async gate (Promise<TemplateExecutionGateDecision>)", async () => {
    const gate: TemplateExecutionGate = async () => ({
      allowed: false,
      reason: "high_risk_admin_only",
    });
    const router = new GraphRetrievalRouter(makeRepo(), {
      templateExecutionGate: gate,
    });
    const r = await router.retrieve({
      mode: "graphrag_traversal",
      query: "q",
      runtime: RUNTIME,
      eligibility: elig(pack("p1")),
      packTemplates: new Map([["p1", ["tpl-x"]]]),
    });
    expect(r.rejectionReason).toBe("template_gate_denied_high_risk_admin_only");
  });

  it("is optional — router without gate option runs templates as before", async () => {
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

  it("does NOT fire for non-template modes (graphrag_local)", async () => {
    const gate = vi.fn().mockReturnValue({ allowed: true });
    const router = new GraphRetrievalRouter(makeRepo(), {
      templateExecutionGate: gate,
    });
    await router.retrieve({
      mode: "graphrag_local",
      query: "q",
      runtime: RUNTIME,
      seedNodeId: "n1",
    });
    expect(gate).not.toHaveBeenCalled();
  });
});
