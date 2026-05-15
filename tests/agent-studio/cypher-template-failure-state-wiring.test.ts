/**
 * Phase 22 §T-I.5 batch A.6 — Cypher template execution failures → bridge.
 *
 * Source-scan structural test asserting the retrieval router emits
 * `cypher_query_template_failed` in the executeTemplate catch block.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/retrieval/retrieval-router.ts",
);

describe("retrieval-router executeTemplateAudited catch is wired to the bridge", () => {
  const src = readFileSync(routerPath, "utf8");

  it("uses the closed cypher_query_template_failed kind", () => {
    expect(src).toContain('failureState: "cypher_query_template_failed"');
  });

  it("emits inside the executeTemplate catch block", () => {
    expect(src).toMatch(
      /catch\s*\(\s*executeErr\s*\)\s*\{[\s\S]{0,600}recordFailureStateEvent/,
    );
  });

  it("metadata carries templateKey + parameterKeys + workspaceId + durationMs", () => {
    expect(src).toContain("templateKey,");
    expect(src).toContain("parameterKeys: Object.keys(parameters).sort()");
    expect(src).toContain("workspaceId: input.runtime.workspaceId");
    expect(src).toContain("durationMs: Date.now() - startedAt");
  });

  it("does NOT include raw parameter VALUES (only keys) — avoids PII/secret leakage in observability", () => {
    // Make sure the metadata block doesn't capture raw `parameters`
    // (only `parameterKeys`).
    const m = src.match(
      /failureState: "cypher_query_template_failed"[\s\S]{0,400}metadata:[\s\S]{0,400}\}/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).not.toContain("parameters,");
    expect(m![0]).not.toMatch(/parameters: /);
  });

  it("preserves the rethrow — observability does not swallow the original error", () => {
    // The bridge call is `void` + `.catch(() => {})` so it can't
    // affect the surrounding `throw executeErr;`. (The audit
    // recorder lives between the bridge call and the rethrow, so we
    // assert the ORDERING with an open-ended regex rather than a
    // fixed window.)
    const idxBridge = src.indexOf(
      'failureState: "cypher_query_template_failed"',
    );
    const idxRethrow = src.indexOf("throw executeErr;");
    expect(idxBridge).toBeGreaterThan(-1);
    expect(idxRethrow).toBeGreaterThan(idxBridge);
  });
});
