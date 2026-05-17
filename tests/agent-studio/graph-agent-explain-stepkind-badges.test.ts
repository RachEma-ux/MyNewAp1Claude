/**
 * GraphAgentExplain stepKind-coded badges — T-F.131
 * (precedent (n) applied at JSX-fragment scale per lesson 92).
 *
 * 5 closed-taxonomy stepKinds emitted by
 * server/agent-studio/services/graph-agent/engine.ts:
 *   - plan_retrieval_mode  → indigo  (planning phase)
 *   - retrieve             → cyan    (KB / RAC retrieval)
 *   - model_call           → fuchsia (LLM inference)
 *   - agentic_model_call   → violet  (LLM in bounded-iteration loop)
 *   - health_snapshot      → slate   (passive observation)
 *
 * Per lesson 45 (close at operator-visible boundary not enum
 * exhaustion): unknown stepKinds fall back to a neutral outline so
 * the panel renders cleanly if engine.ts adds a new kind ahead of
 * this ladder. The taxonomy is closed *today* (5 kinds), and the
 * fallback IS the correct shape for future-extensibility.
 *
 * Helper-component extraction at N=1 site (the step ledger render
 * loop), but the closed-taxonomy ladder + per-kind testid format
 * justify the extraction even without N≥3 — lesson 92's threshold
 * is for repeated SHAPES, not closed taxonomies. A closed-taxonomy
 * dispatcher is its own justification.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/GraphAgentExplainPanel.tsx",
    ),
    "utf8",
  );
}

describe("GraphAgentExplain stepKind-coded badges (T-F.131 / precedent (n) at JSX-fragment scale)", () => {
  it("StepKindBadge helper declared with single-prop signature", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+StepKindBadge\(\s*\{\s*stepKind,?\s*\}:\s*\{\s*stepKind:\s*string;?\s*\}\s*\)/,
    );
  });

  it("dispatches all 5 closed-taxonomy stepKinds to distinct color classes", () => {
    const src = read();
    expect(src).toMatch(
      /stepKind\s*===\s*"plan_retrieval_mode"[\s\S]{0,200}bg-indigo-500/,
    );
    expect(src).toMatch(
      /stepKind\s*===\s*"retrieve"[\s\S]{0,200}bg-cyan-500/,
    );
    expect(src).toMatch(
      /stepKind\s*===\s*"model_call"[\s\S]{0,200}bg-fuchsia-500/,
    );
    expect(src).toMatch(
      /stepKind\s*===\s*"agentic_model_call"[\s\S]{0,200}bg-violet-500/,
    );
    expect(src).toMatch(
      /stepKind\s*===\s*"health_snapshot"[\s\S]{0,200}bg-slate-500/,
    );
  });

  it("unknown stepKinds fall back to a neutral outline class (lesson 45)", () => {
    const src = read();
    // The ternary chain must end on a fallback branch that's NOT
    // one of the 5 tonal kind classes. We assert the fallback is
    // the muted border tone.
    expect(src).toMatch(/:\s*"border-border\/60"/);
  });

  it("per-stepKind data-testid lets source-scan tests lock the taxonomy", () => {
    const src = read();
    expect(src).toMatch(
      /data-testid=\{`graph-agent-explain-stepkind-badge-\$\{stepKind\}`\}/,
    );
  });

  it("step ledger render replaces plain <span>{step.stepKind}</span> with <StepKindBadge>", () => {
    const src = read();
    // Old shape gone (plain span around stepKind).
    expect(src).not.toMatch(
      /<span[^>]*>\s*\{step\.stepKind\}\s*<\/span>/,
    );
    // New shape present (helper invoked inside the step ledger).
    expect(src).toMatch(/<StepKindBadge\s+stepKind=\{step\.stepKind\}/);
  });

  it("StepKindBadge invoked exactly once (no over-application — single render site)", () => {
    const src = read();
    const matches = src.match(/<StepKindBadge\b/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("preserves sibling step metadata renders (regression-free; stepIndex + durationMs + stepOutput unchanged)", () => {
    const src = read();
    // step.stepIndex still rendered above the badge.
    expect(src).toMatch(/#\{step\.stepIndex\}/);
    // step.durationMs still rendered to the right of the badge.
    expect(src).toMatch(/formatDuration\(step\.durationMs\)/);
    // step.stepOutput JSON still rendered below.
    expect(src).toMatch(/JSON\.stringify\(step\.stepOutput[\s\S]{0,40}null,\s*2\)/);
  });
});
