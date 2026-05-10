/**
 * L1-L4-c8 (cycle-8 audit `/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`
 * §L1, §L2, §L3, §L4) — bundled doc-block lockstep.
 *
 * Four LOW-priority items from the cycle-8 audit, all closed via
 * pure documentation:
 *
 *   - L1-c8: trace-writer.ts cross-DB FK absence is acknowledged in
 *     the C2-c7 doc-block but had no lockstep pinning the orphan-row
 *     contract. A future single-database consolidation might
 *     re-introduce strict FKs without realizing operator dashboards
 *     depend on the orphan-tolerance. L1-c8 marker + lockstep test.
 *
 *   - L2-c8: RuntimeSourceTrace.perSourceLatencyMs is an unbounded
 *     map. Pure docs — known limitation, fold into ceiling pattern
 *     if it ever becomes a real issue.
 *
 *   - L3-c8: Composer warnings accumulator is unbounded. Same shape
 *     as L2 — pure docs, fold into ceiling pattern if needed.
 *
 *   - L4-c8: RetrievalRequiredError.code, CagRequiredError.code, and
 *     DispatchErrorCode all use the field name `code` but draw from
 *     disjoint value spaces (orchestration vs. dispatch). A future
 *     unified error-mapping helper would silently violate the
 *     namespace boundary. Pure docs naming the boundary.
 *
 * No behavioral test for any of these — they're docs. The lockstep
 * tests below source-scan for the closure markers + the load-bearing
 * keywords (so a "cleanup" PR that drops the doc-block fails the
 * test before the contract erodes).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const TRACE_WRITER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/trace-writer.ts",
);
const ORCHESTRATOR_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/rac-orchestrator.ts",
);
const COMPOSER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/system-prompt-composer.ts",
);

const traceWriterSrc = readFileSync(TRACE_WRITER_PATH, "utf8");
const orchestratorSrc = readFileSync(ORCHESTRATOR_PATH, "utf8");
const composerSrc = readFileSync(COMPOSER_PATH, "utf8");

describe("L1-c8 — trace-writer cross-DB FK absence orphan-row contract", () => {
  it("L1-c8 closure marker is present", () => {
    expect(
      traceWriterSrc,
      "L1-c8: closure marker missing from trace-writer.ts.",
    ).toMatch(/L1-c8/);
  });

  it("doc-block names cross-DB FK impossibility", () => {
    expect(
      traceWriterSrc,
      "L1-c8: the doc-block must explicitly state that cross-DB FK is " +
        "impossible. A future consolidation that re-introduces strict " +
        "FKs would break operator-dashboard orphan tolerance.",
    ).toMatch(/cross-DB FK is impossible/);
  });

  it("doc-block names the orphan-row tolerance contract", () => {
    expect(
      traceWriterSrc,
      "L1-c8: the doc-block must use the word 'orphan' — operator UI " +
        "code reviews grep for this term to confirm the contract.",
    ).toMatch(/orphan/i);
  });
});

describe("L2-c8 — RuntimeSourceTrace.perSourceLatencyMs unbounded map", () => {
  it("L2-c8 closure marker is present on perSourceLatencyMs", () => {
    // Match the L2-c8 marker within ~1500 chars of the
    // perSourceLatencyMs declaration so we know the doc-block is
    // attached to THIS field, not some unrelated section.
    const fieldIdx = orchestratorSrc.search(/perSourceLatencyMs:\s*Record/);
    expect(fieldIdx).toBeGreaterThan(0);
    const window = orchestratorSrc.slice(
      Math.max(0, fieldIdx - 1500),
      fieldIdx,
    );
    expect(
      window,
      "L2-c8: closure marker must appear in the doc-block immediately " +
        "above perSourceLatencyMs.",
    ).toMatch(/L2-c8/);
  });

  it("doc-block names the UNBOUNDED known-limitation explicitly", () => {
    // Operator runbooks key off the word "UNBOUNDED" or "unbounded"
    // when triaging trace-row size complaints — confirm it's there.
    const fieldIdx = orchestratorSrc.search(/perSourceLatencyMs:\s*Record/);
    const window = orchestratorSrc.slice(
      Math.max(0, fieldIdx - 1500),
      fieldIdx,
    );
    expect(window).toMatch(/UNBOUNDED|unbounded/);
  });
});

describe("L3-c8 — Composer warnings accumulator unbounded", () => {
  it("L3-c8 closure marker is present on warnings field", () => {
    // The warnings field is on ComposedSystemPrompt; match locality.
    const fieldIdx = composerSrc.search(
      /interface\s+ComposedSystemPrompt[\s\S]{0,2000}warnings:\s*string\[\]/,
    );
    expect(fieldIdx).toBeGreaterThan(0);
    expect(
      composerSrc,
      "L3-c8: closure marker missing from composer warnings field.",
    ).toMatch(/L3-c8/);
  });

  it("doc-block names the UNBOUNDED known-limitation explicitly", () => {
    // Locate the warnings field's doc-block window.
    const idx = composerSrc.indexOf("warnings: string[]");
    expect(idx).toBeGreaterThan(0);
    const window = composerSrc.slice(Math.max(0, idx - 1500), idx);
    expect(window).toMatch(/UNBOUNDED|unbounded/);
  });
});

describe("L4-c8 — Orchestration-vs-dispatch error code namespace", () => {
  it("L4-c8 closure marker is present", () => {
    expect(orchestratorSrc).toMatch(/L4-c8/);
  });

  it("doc-block names BOTH error namespaces (orchestration + dispatch)", () => {
    // The L4-c8 doc-block must name both DispatchErrorCode (or
    // McpError) and the orchestration error classes so a future
    // reader sees both sides of the namespace boundary.
    expect(
      orchestratorSrc,
      "L4-c8: doc-block must name DispatchErrorCode (the dispatch-side " +
        "namespace) so the boundary is documented from both sides.",
    ).toMatch(/DispatchErrorCode/);
  });

  it("doc-block names the disjoint-value-space contract", () => {
    // The "disjoint" / "not mergeable" / "namespace" wording is what
    // future reviewers grep for when reviewing error-mapping helpers.
    expect(orchestratorSrc).toMatch(
      /(?:disjoint|not mergeable|namespace boundary|namespaces are NOT)/i,
    );
  });

  it("doc-block is attached to RetrievalRequiredError class declaration", () => {
    // Locality: the L4-c8 marker must appear within 2000 chars before
    // the `export class RetrievalRequiredError` line so the doc-block
    // actually documents the class.
    const classIdx = orchestratorSrc.search(
      /export\s+class\s+RetrievalRequiredError/,
    );
    expect(classIdx).toBeGreaterThan(0);
    const window = orchestratorSrc.slice(
      Math.max(0, classIdx - 2000),
      classIdx,
    );
    expect(window).toMatch(/L4-c8/);
  });
});
