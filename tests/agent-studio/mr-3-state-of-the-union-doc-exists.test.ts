/**
 * MR-3 state-of-the-union doc-exists guard.
 *
 * The MR-3 migration arc has accumulated ~29 batches since the
 * original first-batch plan (`agent-studio-mr-3-getasdb-inventory.md`,
 * 2026-05-13). A state-of-the-union snapshot documents which files
 * are 100% Cat A, which stay Cat B by intent, which are Cat C/D/E,
 * and what the next batches look like. This test asserts the SOTU
 * doc exists + lists the cumulative batch progress + names the
 * remaining Cat B/D/E follow-ups.
 *
 * The doc is plain markdown; this test is a structural guard so a
 * future PR that touches the doc doesn't accidentally regress the
 * coverage of the inventory.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const doc = resolve(
  __dirname,
  "../../docs/implementation/agent-studio-mr-3-state-of-the-union-2026-05-14.md",
);

describe("MR-3 state-of-the-union doc", () => {
  it("exists at the expected path", () => {
    expect(existsSync(doc)).toBe(true);
  });

  it("references the predecessor inventory doc", () => {
    const src = readFileSync(doc, "utf8");
    expect(/agent-studio-mr-3-getasdb-inventory\.md/.test(src)).toBe(true);
  });

  it("references the V1+ execution plan ledger", () => {
    const src = readFileSync(doc, "utf8");
    expect(
      /agent-studio-native-graph-workspace-v1-v2-execution-plan\.md/.test(src),
    ).toBe(true);
  });

  it("references the Phase MR-1 ADR (destination)", () => {
    const src = readFileSync(doc, "utf8");
    expect(/agent-studio-multi-region\.md/.test(src)).toBe(true);
  });

  it("lists at least the 1st through the 29th batches in the chronological table", () => {
    const src = readFileSync(doc, "utf8");
    // The chronological index table should mention each shipped batch.
    // We test at the bracketing endpoints (#794 first + #848 twenty-ninth)
    // + a mid-range sample (#831 eighteenth) so a future refresh that
    // drops the table is caught.
    expect(/#794\b/.test(src)).toBe(true);
    expect(/#831\b/.test(src)).toBe(true);
    expect(/#848\b/.test(src)).toBe(true);
  });

  it("names the Cat A / Cat B / Cat C / Cat D / Cat E taxonomy", () => {
    const src = readFileSync(doc, "utf8");
    for (const cat of ["Cat A", "Cat B", "Cat C", "Cat D", "Cat E"]) {
      expect(src.includes(cat)).toBe(true);
    }
  });

  it("flags the approval-gate JOIN chain as a deferred sub-arc", () => {
    const src = readFileSync(doc, "utf8");
    expect(/approval-gate|tool-approvals-router/.test(src)).toBe(true);
    expect(/JOIN/.test(src)).toBe(true);
  });

  it("names Phase-2 of the shim as the remaining work behind the call surface", () => {
    const src = readFileSync(doc, "utf8");
    expect(/Phase-2/.test(src)).toBe(true);
  });
});
