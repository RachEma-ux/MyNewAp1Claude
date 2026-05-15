/**
 * CLAUDE.md hard-rules integrity — T-C.1.
 *
 * The V1+ plan reclassifies CRDT / offline / multi-region from
 * "eternal MVP-0-4 deferrals" to "V1+ plan scope — first slices
 * shipped". The reclassification is a deliberate scope move; the
 * eternal hard rules (GraphRepository sole graph access, Postgres
 * source-of-truth, MCP dispatcher chokepoint, OpenRouter sole
 * model-execution path, no graph mutation outside Phase 11.5)
 * must NOT be removed in that move.
 *
 * This test mortgages CLAUDE.md against accidental removal of the
 * eternal hard-rule sentences. If a future PR rewrites CLAUDE.md
 * and drops one, this test fails before the PR can merge.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("T-C.1 — CLAUDE.md hard-rules integrity", () => {
  const claudeMd = resolve(__dirname, "../../CLAUDE.md");

  const ETERNAL_HARD_RULES = [
    // Original 9 (T-C.1 / #985):
    "All graph access goes through `GraphRepository`",
    "No `neo4j-driver` imports outside",
    "Postgres = source of truth; Neo4j CE = projected backend",
    "must not mutate graph facts directly",
    "Phase 11.5 graph change proposals",
    "Cypher templates must be parameterized",
    "Read-only Text2Cypher; mutations forbidden",
    "single tool execution chokepoint",
    "single model execution path",
    // T-C.2 (#1033) — extended hard-rule coverage:
    "OpenRouter remains the model execution path",
    "Existing MCP dispatcher",
    "Existing CAG Capability Packs",
    "Existing approval/governance scaffolding",
    "AGENTS.md is the authoritative repo operating policy",
    "Extend existing Agent Studio. Do not greenfield-rebuild it",
    "Agent Studio Universal KB / Universal Ingestion / RAC / RAG / CAG / MCP Tool-Use / Critical Approval retrofit",
    // 8-class riskClass closed taxonomy (CAG D-TOOL-1):
    "8-class `riskClass` taxonomy",
    // RAC 8-mode list (smoke check for the mode enum):
    "no_retrieval",
    "cag_only",
    "knowledge_retrieval",
    "multimodal_hybrid_retrieval",
    "tool_knowledge_retrieval",
    "hybrid_cag_rag",
    "hybrid_cag_rag_tool_knowledge",
    // Sandbox routing:
    "Sandbox routes `riskClass=\"code_execution\"`",
    // pgvector deferred:
    "Do not force `pgvector` migration in MVP",
    // Single-region operational baseline:
    "single-region remains the operational baseline",
  ];

  for (const rule of ETERNAL_HARD_RULES) {
    it(`preserves hard rule: "${rule.slice(0, 50)}…"`, () => {
      const src = readFileSync(claudeMd, "utf8");
      expect(src).toContain(rule);
    });
  }

  it("Non-Build List still mentions Phase 27 upgrade-path doc for Aura", () => {
    const src = readFileSync(claudeMd, "utf8");
    expect(src).toContain(
      "Neo4j Enterprise / Aura migration (Phase 27 documents the upgrade path)",
    );
  });

  it("forward pointer to remaining execution plan exists", () => {
    const src = readFileSync(claudeMd, "utf8");
    expect(src).toContain(
      "agent-studio-native-graph-workspace-remaining-execution-plan.md",
    );
  });

  it("retains V1+ plan + remaining-plan pointers in the execution plan index", () => {
    const src = readFileSync(claudeMd, "utf8");
    expect(src).toContain("Execution plan index:");
    expect(src).toContain("agent-studio-native-graph-workspace-roadmap.md");
    expect(src).toContain(
      "agent-studio-native-graph-workspace-v1-v2-execution-plan.md",
    );
  });
});
