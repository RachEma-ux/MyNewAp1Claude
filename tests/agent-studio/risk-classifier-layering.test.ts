/**
 * M3-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md`
 * §M3-c5) — quarantine-state layering lockstep.
 *
 * Pre-cycle-5 the audit observed that `tool.riskClass` (and the
 * special "quarantined" state in particular) was derived via three
 * different paths in `risk-classifier.ts` without the layering being
 * called out anywhere — so the mirror's stale-snapshot semantic vs
 * the validator gate's live read was an undocumented invariant. An
 * operator could reasonably read `agsMcpToolKnowledge.risk_class =
 * 'read_only'` and conclude the tool would dispatch, when in fact
 * the live manifest had since flipped the tool to `quarantined` and
 * the dispatcher refuses every attempt.
 *
 * Post-cycle-5 the file header doc-block enumerates the 3 paths + the
 * mirror-vs-live invariant explicitly. This test locks the doc-block:
 * a future PR that drops one of the paths (or adds a 4th derivation
 * route) without updating the layering comment fails here.
 *
 * Behavioral coverage of `readRiskClass()` itself lives in the CAG
 * unit tests; this test is doc-only invariant lockstep.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CLASSIFIER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/cag/risk-classifier.ts",
);

describe("M3-c5 — risk-classifier.ts header doc-block enumerates the 3 quarantine derivation paths", () => {
  const src = readFileSync(CLASSIFIER_PATH, "utf8");

  it("doc-block names the M3-c5 closure marker", () => {
    expect(
      src,
      "M3-c5 violated: risk-classifier.ts header must carry the " +
        "`M3-c5` closure marker so a future audit (cycle-6+) can " +
        "trace the layering doc back to its origin audit item.",
    ).toMatch(/M3-c5\b/);
  });

  it("doc-block enumerates path 1 — manifest read", () => {
    expect(
      src,
      "M3-c5 violated: header doc-block must explicitly call out " +
        "the manifest-read path (`tool.riskClass` present → return " +
        "verbatim). This is the D-TOOL-1 authoritative source.",
    ).toMatch(/Manifest read/i);
  });

  it("doc-block enumerates path 2 — builtin fallback", () => {
    expect(
      src,
      "M3-c5 violated: header doc-block must explicitly call out " +
        "the builtin-fallback path (`BUILTIN_RISK_CLASS[tool.name]`, " +
        "D-TOOL-6 — the five provisional built-ins).",
    ).toMatch(/Builtin fallback/i);
  });

  it("doc-block enumerates path 3 — default-deny quarantined", () => {
    expect(
      src,
      "M3-c5 violated: header doc-block must explicitly call out " +
        "the default-deny path (returns `\"quarantined\"`). This is " +
        "the D-TOOL-1 default-deny posture and the cycle-5 audit's " +
        "primary §M3-c5 concern.",
    ).toMatch(/Default-deny/i);
  });

  it("doc-block names the mirror-vs-live invariant (stale-snapshot semantic)", () => {
    // The mirror column `agsMcpToolKnowledge.riskClass` is computed at
    // sync time; the validator gate / dispatcher / builder compute it
    // live every call. The doc must call this out so operators don't
    // misread the mirror as authoritative for dispatch.
    expect(
      src,
      "M3-c5 violated: header doc-block must explicitly distinguish " +
        "the mirror snapshot (agsMcpToolKnowledge.riskClass — " +
        "stale, at sync time) from the live read (validator gate / " +
        "dispatcher — authoritative for dispatch). Otherwise " +
        "operators may misread the mirror.",
    ).toMatch(/stale-snapshot/i);
    expect(
      src,
      "M3-c5 violated: header doc-block must reference " +
        "`agsMcpToolKnowledge` (or `tool-knowledge-sync.ts`) as the " +
        "mirror writer that materializes the snapshot.",
    ).toMatch(/agsMcpToolKnowledge|tool-knowledge-sync/);
  });

  it("doc-block disclaims a 4th derivation path (M1-c5 cross-reference)", () => {
    // The cycle-5 audit pre-write flagged risk-classifier.ts as a
    // possible third schema-hash site (M1-c5). Verification showed it
    // wasn't — and the doc-block now records that explicitly so a
    // future audit doesn't re-flag it.
    expect(
      src,
      "M3-c5 violated: header doc-block must record the M1-c5 " +
        "cross-reference (no fourth derivation path; the CAG side " +
        "reads `tool.riskClass` directly, does NOT re-derive the " +
        "schema hash). This prevents a future audit from re-flagging " +
        "the same false-positive triplication.",
    ).toMatch(/M1-c5/);
  });
});
