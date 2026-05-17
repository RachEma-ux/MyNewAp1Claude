/**
 * RacTracesPanel retrieval-mode color-coded badge — T-F.134.
 *
 * The 8-mode closed taxonomy comes from CLAUDE.md's "RAC (Phase 6,
 * extends existing planner/orchestrator)" section. T-F.134 clusters
 * them into 4 color tones for at-a-glance operator scan:
 *   - no_retrieval                           → muted    (passive)
 *   - cag_only                               → indigo   (CAG)
 *   - knowledge_retrieval                    → cyan     (RAG)
 *   - multimodal_hybrid_retrieval            → cyan     (RAG variant)
 *   - tool_knowledge_retrieval               → violet   (tool-knowledge)
 *   - hybrid_cag_rag                         → emerald  (fusion)
 *   - hybrid_cag_tool_knowledge              → emerald  (fusion)
 *   - hybrid_cag_rag_tool_knowledge          → emerald  (max fusion)
 *
 * Unknown modes fall back to default outline tone — lesson 45
 * future-extensibility shape (same as T-F.131 / T-F.132 / T-F.133).
 *
 * Title hint surfaces the raw mode at hover for explicit confirmation.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/RacTracesPanel.tsx",
    ),
    "utf8",
  );
}

describe("RacTracesPanel retrieval-mode color-coding (T-F.134)", () => {
  it("racModeBadgeClass helper declared with nullable string signature", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+racModeBadgeClass\(\s*mode:\s*string\s*\|\s*null\s*\|\s*undefined\s*\):\s*string/,
    );
  });

  it("nullish modes return empty string (badge wraps with default outline only)", () => {
    const src = read();
    expect(src).toMatch(/if\s*\(!mode\)\s*return\s+""/);
  });

  it("dispatches all 8 closed-taxonomy modes into 4 color clusters", () => {
    const src = read();
    // muted cluster
    expect(src).toMatch(/mode\s*===\s*"no_retrieval"[\s\S]{0,100}bg-muted/);
    // indigo cluster
    expect(src).toMatch(/mode\s*===\s*"cag_only"[\s\S]{0,100}bg-indigo-500/);
    // cyan cluster (2 modes: knowledge_retrieval + multimodal_hybrid_retrieval)
    expect(src).toMatch(
      /mode\s*===\s*"knowledge_retrieval"[\s\S]{0,80}\|\|[\s\S]{0,80}mode\s*===\s*"multimodal_hybrid_retrieval"[\s\S]{0,150}bg-cyan-500/,
    );
    // violet cluster
    expect(src).toMatch(
      /mode\s*===\s*"tool_knowledge_retrieval"[\s\S]{0,100}bg-violet-500/,
    );
    // emerald cluster (3 modes: hybrid_cag_rag + hybrid_cag_tool_knowledge + hybrid_cag_rag_tool_knowledge)
    expect(src).toMatch(
      /mode\s*===\s*"hybrid_cag_rag"[\s\S]{0,80}\|\|[\s\S]{0,150}mode\s*===\s*"hybrid_cag_tool_knowledge"[\s\S]{0,150}\|\|[\s\S]{0,150}mode\s*===\s*"hybrid_cag_rag_tool_knowledge"[\s\S]{0,300}bg-emerald-500/,
    );
  });

  it("unknown modes fall back to neutral (final `return \"\"` after the cluster chain)", () => {
    const src = read();
    // The function body ends with `return "";` after all cluster branches.
    expect(src).toMatch(
      /bg-emerald-500\/15 text-emerald-300 border-emerald-500\/40";\s*return\s+"";\s*\}/,
    );
  });

  it("trace.mode Badge wired with racModeBadgeClass + per-trace testid + title hint", () => {
    const src = read();
    expect(src).toMatch(
      /className=\{`text-\[10px\] \$\{racModeBadgeClass\(trace\.mode\)\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`rac-trace-mode-badge-\$\{trace\.id\}`\}/,
    );
    expect(src).toMatch(
      /title=\{`retrieval mode:\s*\$\{trace\.mode\s*\?\?\s*"\(none\)"\}/,
    );
  });

  it("badge body still renders trace.mode ?? '—' (regression-free)", () => {
    const src = read();
    expect(src).toMatch(/\{trace\.mode\s*\?\?\s*"—"\}/);
  });
});
