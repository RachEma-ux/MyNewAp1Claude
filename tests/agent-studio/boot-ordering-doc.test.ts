/**
 * L1-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md`
 * §L1-c5) — boot-ordering race documentation lockstep.
 *
 * Pre-cycle-5 the boot sequence had an undocumented race: requests
 * landing between `server.listen()` resolve and `bootAgentStudioPostListen`
 * completion could fail with `tool_not_found` because the registry's
 * snapshots had not yet been populated. The error code is correct;
 * the operator-facing surprise is not.
 *
 * Post-cycle-5 (this PR — doc-only): `bootAgentStudioPostListen`'s
 * doc-block enumerates the race window + the two mitigation options
 * (A: document only — chosen; B: ready-gate with new error — rejected
 * for cycle-5 with rationale).
 *
 * This test locks the doc — a future PR that strips the documentation,
 * or quietly migrates to option B without recording the change here,
 * fails the lockstep.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const BOOT_PATH = join(process.cwd(), "server/agent-studio/boot.ts");

describe("L1-c5 — boot.ts header documents the boot-ordering race", () => {
  const src = readFileSync(BOOT_PATH, "utf8");

  it("doc-block names the L1-c5 closure marker", () => {
    expect(
      src,
      "L1-c5 violated: boot.ts must carry the `L1-c5` closure marker " +
        "so a future audit (cycle-6+) can trace the race documentation " +
        "back to its origin audit item.",
    ).toMatch(/L1-c5\b/);
  });

  it("doc-block identifies the race window (listen-resolve → auto-connect-finish)", () => {
    // The window is "listener accepts requests" → "all MCP servers
    // connected + their snapshots published". Code paths that fire in
    // this window see an empty registry.
    expect(
      src,
      "L1-c5 violated: doc-block must explicitly identify the race window " +
        "between `server.listen()` resolving and " +
        "`bootAgentStudioPostListen` completing. Future readers need to " +
        "recognize a cold-start `tool_not_found` as expected, not a bug.",
    ).toMatch(/race window/i);
  });

  it("doc-block names the symptom (`tool_not_found` on cold-start)", () => {
    expect(
      src,
      "L1-c5 violated: doc-block must name the symptom (`tool_not_found` " +
        "during the boot window) so operators reading audit logs can " +
        "correlate the error code to the boot-ordering race rather " +
        "than to a registry bug.",
    ).toMatch(/tool_not_found/);
  });

  it("doc-block presents both mitigation options (A: doc-only, B: ready-gate)", () => {
    expect(
      src,
      "L1-c5 violated: doc-block must enumerate Option A (doc-only — " +
        "chosen) AND Option B (ready-gate with new `service_warming_up` " +
        "error — rejected for cycle-5). The audit's remediation menu " +
        "must be preserved verbatim so a future cycle can flip from A " +
        "to B without re-deriving the design space.",
    ).toMatch(/Option A.*Option B/s);
  });

  it("doc-block records why Option A was chosen (Option B has wider blast-radius)", () => {
    // The test does NOT pin the exact wording, but does require some
    // word that signals "Option B has bigger consequences than the
    // operational pain it would relieve".
    expect(
      src,
      "L1-c5 violated: doc-block must record the rationale for picking " +
        "Option A — specifically that Option B (ready-gate) has wider " +
        "blast-radius (new error code, dispatcher contract change, UI " +
        "surface for the warming state). Without this rationale a future " +
        "PR could flip to Option B without recognizing the cost.",
    ).toMatch(/blast-radius|wider|contract change|UI surface/i);
  });
});
