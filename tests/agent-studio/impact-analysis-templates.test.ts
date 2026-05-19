/**
 * Impact-analysis Cypher templates — source-scan + behavioral tests.
 *
 * Slice 29 of the no-deferral continuation catalogue (2026-05-19).
 * Closes `impact-analysis-executor.ts` "Today: always stub" by
 * registering ≥1 parameterized Cypher template for `knowledge_impact`
 * + wiring `runImpactAnalysisViaTemplate` to the executor.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IMPACT_ANALYSIS_TEMPLATES,
  findImpactAnalysisTemplate,
  hasImpactAnalysisTemplate,
  buildImpactAnalysisTemplateSeedRows,
} from "../../server/agent-studio/services/graph-lens/impact-analysis-templates.js";
import {
  classifyImpactAnalysisExecutorMode,
  runImpactAnalysisStub,
  runImpactAnalysisViaTemplate,
} from "../../server/agent-studio/services/graph-lens/impact-analysis-executor.js";
import { IMPACT_ANALYSIS_KINDS } from "../../server/agent-studio/services/graph-lens/impact-analysis-contracts.js";

const REPO_ROOT = join(__dirname, "..", "..");
const TEMPLATES_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/graph-lens/impact-analysis-templates.ts",
);
const EXECUTOR_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/graph-lens/impact-analysis-executor.ts",
);
const ROUTER_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/graph-lens/impact-analysis-router.ts",
);
const SEED_PATH = join(
  REPO_ROOT,
  "scripts/seed-impact-analysis-templates.ts",
);

describe("Impact-analysis templates — slice 29 source-scan", () => {
  const templatesSrc = readFileSync(TEMPLATES_PATH, "utf8");
  const executorSrc = readFileSync(EXECUTOR_PATH, "utf8");
  const routerSrc = readFileSync(ROUTER_PATH, "utf8");
  const seedSrc = readFileSync(SEED_PATH, "utf8");

  it("templates module declares IMPACT_ANALYSIS_TEMPLATES + lookup helpers", () => {
    expect(templatesSrc).toContain("export const IMPACT_ANALYSIS_TEMPLATES");
    expect(templatesSrc).toContain("findImpactAnalysisTemplate");
    expect(templatesSrc).toContain("hasImpactAnalysisTemplate");
    expect(templatesSrc).toContain("buildImpactAnalysisTemplateSeedRows");
  });

  it("knowledge_impact template carries a parameterized Cypher body", () => {
    expect(templatesSrc).toContain('"impact_analysis.knowledge_impact"');
    expect(templatesSrc).toContain("$startId");
    expect(templatesSrc).toContain("$maxDepth");
    expect(templatesSrc).toContain("$typeFilter");
  });

  it("executor exposes the template-mode + stub-mode entry points", () => {
    expect(executorSrc).toContain("runImpactAnalysisStub");
    expect(executorSrc).toContain("runImpactAnalysisViaTemplate");
    // Stub-classification line is replaced with template-aware lookup.
    expect(executorSrc).not.toContain("Today: always stub");
    expect(executorSrc).toContain("hasImpactAnalysisTemplate(kind)");
  });

  it("executor routes through GraphRepository.executeTemplate (no neo4j-driver)", () => {
    expect(executorSrc).toContain("repository.executeTemplate");
    expect(executorSrc).not.toMatch(/^import .* from "neo4j-driver"/m);
    expect(executorSrc).not.toMatch(/^import .* from .*dispatchMcpToolCall/m);
    expect(executorSrc).not.toMatch(/^import .* from .*openrouter/m);
  });

  it("router selects template-mode when classifier returns template", () => {
    expect(routerSrc).toContain("runImpactAnalysisViaTemplate");
    expect(routerSrc).toContain("classifyImpactAnalysisExecutorMode");
    expect(routerSrc).toContain("getGraphRepository()");
  });

  it("seed script is idempotent (uses onConflictDoUpdate)", () => {
    expect(seedSrc).toContain("onConflictDoUpdate");
    expect(seedSrc).toContain("agsQueryTemplates");
    expect(seedSrc).toContain("buildImpactAnalysisTemplateSeedRows");
  });
});

describe("Impact-analysis templates — behavioral", () => {
  it("IMPACT_ANALYSIS_TEMPLATES has ≥1 entry (slice 29 ships knowledge_impact)", () => {
    expect(IMPACT_ANALYSIS_TEMPLATES.length).toBeGreaterThanOrEqual(1);
  });

  it("findImpactAnalysisTemplate returns the entry for knowledge_impact", () => {
    const t = findImpactAnalysisTemplate("knowledge_impact");
    expect(t).not.toBeNull();
    expect(t?.templateKey).toBe("impact_analysis.knowledge_impact");
  });

  it("hasImpactAnalysisTemplate returns true for knowledge_impact only", () => {
    expect(hasImpactAnalysisTemplate("knowledge_impact")).toBe(true);
    // The other 6 kinds remain stub-only until templates are added.
    expect(hasImpactAnalysisTemplate("runtime_impact")).toBe(false);
    expect(hasImpactAnalysisTemplate("code_impact")).toBe(false);
    expect(hasImpactAnalysisTemplate("security_impact")).toBe(false);
    expect(hasImpactAnalysisTemplate("governance_impact")).toBe(false);
    expect(hasImpactAnalysisTemplate("tool_impact")).toBe(false);
    expect(hasImpactAnalysisTemplate("workflow_impact")).toBe(false);
  });

  it("classifyImpactAnalysisExecutorMode returns template for knowledge_impact", () => {
    expect(classifyImpactAnalysisExecutorMode("knowledge_impact")).toBe(
      "template",
    );
    for (const kind of IMPACT_ANALYSIS_KINDS) {
      if (kind === "knowledge_impact") continue;
      expect(classifyImpactAnalysisExecutorMode(kind)).toBe("stub");
    }
  });

  it("buildImpactAnalysisTemplateSeedRows shapes match ags_query_templates columns", () => {
    const rows = buildImpactAnalysisTemplateSeedRows();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(typeof r.templateKey).toBe("string");
      expect(r.graphBackend).toBe("neo4j_community");
      expect(r.queryLanguage).toBe("cypher");
      expect(r.readOnly).toBe(true);
      expect(r.riskLevel).toBe("low");
      expect(r.cypherBody.length).toBeGreaterThan(0);
    }
  });

  it("runImpactAnalysisViaTemplate falls back to stub when no template registered", async () => {
    // Pick a kind without a template (e.g. runtime_impact). The
    // executor must return an anchor-only result without calling
    // repository.executeTemplate.
    let called = false;
    const fakeRepo = {
      executeTemplate: async () => {
        called = true;
        return { rows: [], truncated: false, durationMs: 0, templateVersion: "" };
      },
    };
    const result = await runImpactAnalysisViaTemplate(
      {
        kind: "runtime_impact",
        startingNode: { typeKey: "Service", id: "svc-1" },
      },
      { repository: fakeRepo as never, runtime: {} },
    );
    expect(called).toBe(false);
    expect(result.nodes.length).toBe(1);
    expect(result.edges.length).toBe(0);
    expect(result.startingNodeId).toBe("svc-1");
  });

  it("runImpactAnalysisViaTemplate calls executeTemplate for knowledge_impact + maps rows", async () => {
    let captured: { templateKey: string; parameters: Record<string, unknown> } | null = null;
    const fakeRepo = {
      executeTemplate: async (input: {
        templateKey: string;
        parameters: Record<string, unknown>;
      }) => {
        captured = { templateKey: input.templateKey, parameters: input.parameters };
        return {
          rows: [
            {
              anchorId: "n1",
              anchorTypeKey: "Note",
              impactedId: "n2",
              impactedTypeKey: "Note",
              impactedLabel: "Impacted",
              depth: 1,
              edgeChain: [{ typeKey: "RELATED_TO", edgeKey: "e1" }],
            },
          ],
          truncated: false,
          durationMs: 12,
          templateVersion: "1",
        };
      },
    };
    const result = await runImpactAnalysisViaTemplate(
      {
        kind: "knowledge_impact",
        startingNode: { typeKey: "Note", id: "n1" },
        maxDepth: 2,
      },
      { repository: fakeRepo as never, runtime: { userId: 7 } },
    );
    expect(captured).not.toBeNull();
    expect(captured?.templateKey).toBe("impact_analysis.knowledge_impact");
    expect(captured?.parameters).toEqual({
      startId: "n1",
      maxDepth: 2,
      typeFilter: null,
    });
    expect(result.nodes.length).toBe(2);
    expect(result.nodes[0]?.id).toBe("n1");
    expect(result.nodes[1]?.id).toBe("n2");
    expect(result.nodes[1]?.label).toBe("Impacted");
    expect(result.edges.length).toBe(1);
    expect(result.edges[0]?.typeKey).toBe("RELATED_TO");
    expect(result.edges[0]?.sourceNodeId).toBe("n1");
    expect(result.edges[0]?.targetNodeId).toBe("n2");
  });

  it("runImpactAnalysisViaTemplate falls back to stub on executeTemplate failure", async () => {
    const fakeRepo = {
      executeTemplate: async () => {
        throw new Error("simulated Neo4j outage");
      },
    };
    const result = await runImpactAnalysisViaTemplate(
      {
        kind: "knowledge_impact",
        startingNode: { typeKey: "Note", id: "n1" },
      },
      { repository: fakeRepo as never, runtime: {} },
    );
    // Fallback: anchor-only result, no edges.
    expect(result.nodes.length).toBe(1);
    expect(result.edges.length).toBe(0);
  });

  it("runImpactAnalysisViaTemplate dedups duplicate result rows", async () => {
    const fakeRepo = {
      executeTemplate: async () => ({
        rows: [
          {
            impactedId: "n2",
            impactedTypeKey: "Note",
            depth: 1,
            edgeChain: [{ typeKey: "RELATED_TO", edgeKey: "e1" }],
          },
          {
            impactedId: "n2",
            impactedTypeKey: "Note",
            depth: 1,
            edgeChain: [{ typeKey: "RELATED_TO", edgeKey: "e1" }],
          },
        ],
        truncated: false,
        durationMs: 1,
        templateVersion: "1",
      }),
    };
    const result = await runImpactAnalysisViaTemplate(
      {
        kind: "knowledge_impact",
        startingNode: { typeKey: "Note", id: "n1" },
      },
      { repository: fakeRepo as never, runtime: {} },
    );
    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
  });

  it("stub mode envelope shape matches contract (anchor-only)", () => {
    const result = runImpactAnalysisStub({
      kind: "runtime_impact",
      startingNode: { typeKey: "Service", id: "s1" },
    });
    expect(result.kind).toBe("runtime_impact");
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0]?.depth).toBe(0);
    expect(result.nodes[0]?.visible).toBe(true);
    expect(result.edges.length).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.hiddenNodeCount).toBe(0);
  });

  it("public-api re-exports the new surface", async () => {
    const mod = await import(
      "../../server/agent-studio/services/graph-lens/public-api.js"
    );
    expect(mod.IMPACT_ANALYSIS_TEMPLATES).toBeDefined();
    expect(mod.findImpactAnalysisTemplate).toBeDefined();
    expect(mod.hasImpactAnalysisTemplate).toBeDefined();
    expect(mod.runImpactAnalysisViaTemplate).toBeDefined();
    expect(mod.buildImpactAnalysisTemplateSeedRows).toBeDefined();
  });
});
