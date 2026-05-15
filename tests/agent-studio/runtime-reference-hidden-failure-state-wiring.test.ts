/**
 * Phase 22 §T-I.5 batch B.5 — runtime_reference_hidden_by_permission wiring.
 *
 * Source-scan test asserting the retrieval router emits the
 * dedicated kind for permission-denied redactions as a sibling to
 * the aggregated safety-filter emission.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/retrieval/retrieval-router.ts",
);

describe("retrieval-router emits dedicated permission-redaction kind", () => {
  const src = readFileSync(routerPath, "utf8");

  it("uses the closed runtime_reference_hidden_by_permission kind", () => {
    expect(src).toContain(
      'failureState: "runtime_reference_hidden_by_permission"',
    );
  });

  it("emits only when permissionDeniedCount > 0", () => {
    expect(src).toMatch(
      /permissionDeniedCount\s*>\s*0[\s\S]{0,400}runtime_reference_hidden_by_permission/,
    );
  });

  it("derives permissionDeniedCount from the aggregated reasonCounts", () => {
    expect(src).toMatch(
      /reasonCounts\["permission_denied"\]\s*\?\?\s*0/,
    );
  });

  it("metadata carries the targeted count separate from the broader blockedCount", () => {
    // Inside the runtime_reference_hidden_by_permission emit block,
    // BOTH `permissionDeniedCount` and `blockedCount` are present in
    // metadata — so dashboards filtering by this kind still see
    // the overall safety-filter context.
    const idx = src.indexOf(
      'failureState: "runtime_reference_hidden_by_permission"',
    );
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 800);
    expect(block).toContain("permissionDeniedCount,");
    expect(block).toContain("blockedCount: filtered.events.length");
  });

  it("fire-and-forget — void + .catch envelope", () => {
    // There are now multiple void recordFailureStateEvent envelopes
    // in this file; the dedicated permission emit must be one of them.
    const matches = src.match(/void recordFailureStateEvent[\s\S]{0,800}\.catch/g);
    expect(matches).not.toBeNull();
    // Includes safety-filter (#1016), text2cypher (#1018), template
    // failure (#1019), and this new one — at least 4.
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });

  it("does NOT alter the existing retrieval_safety_filter_blocked_content emission", () => {
    // Both emissions live inside the same `if (filtered.events.length > 0)` block.
    expect(src).toContain(
      'failureState: "retrieval_safety_filter_blocked_content"',
    );
  });
});
