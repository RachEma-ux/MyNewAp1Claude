/**
 * Phase 22 §T-I.5 batch A.5 — text2cypher rejection → failure-state bridge.
 *
 * Source-scan structural test asserting the retrieval router emits
 * `text2cypher_rejected` for each rejected Cypher validation. Live
 * emission needs ASDB, so we test structurally.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/retrieval/retrieval-router.ts",
);

describe("retrieval-router.ts text2cypher branch is wired into the bridge", () => {
  const src = readFileSync(routerPath, "utf8");

  it("uses the closed text2cypher_rejected kind", () => {
    expect(src).toContain('failureState: "text2cypher_rejected"');
  });

  it("emits inside the !validation.ok branch (per-rejection)", () => {
    expect(src).toMatch(
      /if\s*\(\s*!validation\.ok\s*\)[\s\S]{0,600}recordFailureStateEvent/,
    );
  });

  it("metadata carries the closed validation reason + workspaceId", () => {
    expect(src).toMatch(/reason,[\s\S]{0,200}workspaceId: input\.runtime\.workspaceId/);
  });

  it("includes a cypherSnippet (truncated to 200 chars)", () => {
    expect(src).toContain("cypherSnippet: input.generatedCypher.slice(0, 200)");
  });

  it("fire-and-forget — void + .catch envelope", () => {
    expect(src).toMatch(
      /void recordFailureStateEvent[\s\S]{0,600}\.catch/,
    );
  });
});
