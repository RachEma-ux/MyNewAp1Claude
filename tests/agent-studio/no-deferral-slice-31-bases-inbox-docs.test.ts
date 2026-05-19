/**
 * BasesPanel + InboxPanel doc-block sweep — source-scan test.
 *
 * Slice 31 of the no-deferral continuation catalogue (2026-05-19).
 * Closes the stale "deferred to β/γ follow-ups" markers in
 * BasesPanel.tsx (closeAllRowEdits + FilterConditionsSummary + the
 * filter-summary inline comment) and the α-shell read-only doc-block
 * in InboxPanel.tsx — the corresponding implementations have
 * shipped via T-F.107 / T-F.109 / T-F.111 / T-F.116 / T-F.120 /
 * T-F.121.
 *
 * The test asserts:
 *   - The stale deferral phrases are absent.
 *   - The successor code is present (closeAllRowEdits function;
 *     addField/addOp/addValue/editingIdx state slices; markRead /
 *     dismiss mutations).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");
const BASES_PATH = join(
  REPO_ROOT,
  "client/src/modules/agent-studio/components/BasesPanel.tsx",
);
const INBOX_PATH = join(
  REPO_ROOT,
  "client/src/modules/agent-studio/components/InboxPanel.tsx",
);

describe("no-deferral slice 31 — BasesPanel doc-block sweep", () => {
  const src = readFileSync(BASES_PATH, "utf8");

  it("removes the closeAllRowEdits deferral marker (helper has shipped)", () => {
    expect(src).not.toContain(
      "would be a natural extraction (lesson 65) — deferred to a",
    );
    expect(src).not.toContain(
      "separate refactor PR to keep this slice's diff focused on",
    );
    expect(src).toContain("function closeAllRowEdits()");
    // Successor — the closeAllRowEdits helper is wired into every
    // open* helper. Quick sanity that there are multiple call sites
    // (it's the seam helper).
    const callSites = (src.match(/closeAllRowEdits\(\)/g) ?? []).length;
    expect(callSites).toBeGreaterThanOrEqual(4);
  });

  it("removes the FilterConditionsSummary β/γ deferral doc-block", () => {
    expect(src).not.toContain(
      "are deferred to β/γ follow-ups",
    );
    expect(src).not.toContain(
      "deferred to β/γ follow-ups (kind picker + adaptive value",
    );
    // Successor — addField/addOp/addValue state slices + editingIdx
    // for edit mode.
    expect(src).toContain("const [addField, setAddField]");
    expect(src).toContain("const [addOp, setAddOp]");
    expect(src).toContain("const [addValue, setAddValue]");
    expect(src).toContain("const [editingIdx, setEditingIdx]");
  });

  it("rewritten doc-blocks describe what the code does today", () => {
    expect(src).toContain("shipped in T-F.120");
    expect(src).toContain(
      "single seam every opener calls to clear sibling row-edit slices",
    );
  });
});

describe("no-deferral slice 31 — InboxPanel doc-block sweep", () => {
  const src = readFileSync(INBOX_PATH, "utf8");

  it("removes the α-shell read-only doc-block (mutations have shipped)", () => {
    expect(src).not.toContain(
      "α-shell ships read-only — markRead / dismiss mutations land in",
    );
    // Successor — markRead + dismiss mutations wired in the component.
    expect(src).toContain("markNotificationRead");
    expect(src).toContain("dismiss");
  });

  it("doc-block now names the remaining intentionally-narrow capability", () => {
    expect(src).toContain("workspace-wide dismiss-all");
    expect(src).toContain("intentionally narrow");
  });
});
