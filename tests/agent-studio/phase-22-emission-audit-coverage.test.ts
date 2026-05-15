/**
 * Phase 22 — Failure-state emission audit coverage (T-I.4).
 *
 * Structural test: the audit doc enumerates EVERY closed-taxonomy
 * failure state from `FAILURE_STATES` (#1002). When a new state is
 * added (which requires editing the contract AND adding an ADR per
 * the docblock), this test forces the audit doc to be updated too.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { FAILURE_STATES } from "../../server/agent-studio/services/failure-states/contracts";

const auditPath = resolve(
  __dirname,
  "../../docs/implementation/agent-studio-phase-22-failure-state-emission-audit.md",
);

describe("Phase 22 emission audit covers all 25 closed-taxonomy kinds", () => {
  const audit = readFileSync(auditPath, "utf8");

  it("enumerates each FAILURE_STATES entry as a backtick-quoted token", () => {
    for (const state of FAILURE_STATES) {
      expect(audit).toContain("`" + state + "`");
    }
  });

  it("documents the wiring-shape bridge file path", () => {
    expect(audit).toContain(
      "services/failure-states/observability-bridge.ts",
    );
  });

  it("references the closed-taxonomy contract path", () => {
    expect(audit).toContain(
      "server/agent-studio/services/failure-states/contracts.ts",
    );
  });

  it("references the existing recorder path", () => {
    expect(audit).toContain(
      "server/agent-studio/services/workspace-observability/error-events.ts",
    );
  });

  it("has a per-state audit row for each kind", () => {
    // Audit table rows are `| <num> | \`<state>\` | <category> | …`
    for (const state of FAILURE_STATES) {
      const rowRe = new RegExp(
        "\\|\\s*\\d+\\s*\\|\\s*`" + state + "`\\s*\\|",
      );
      expect(audit).toMatch(rowRe);
    }
  });

  it("lists T-I.5 wiring slices A/B/C", () => {
    expect(audit).toContain("T-I.5 batch A");
    expect(audit).toContain("T-I.5 batch B");
    expect(audit).toContain("T-I.5 batch C");
  });
});
