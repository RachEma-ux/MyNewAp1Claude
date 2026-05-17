/**
 * Phase 11.5 graph change proposals — source-scan mount integrity.
 *
 * Closes a mount-drift bug: the `graphChangeProposalsRouter` was
 * defined under `services/graph-change-proposals/router.ts` and the
 * Drizzle-backed adapter (`AsdbGraphChangeProposalAdapter`) was
 * already wired in `boot.ts`, but no `api/router.ts` mount existed.
 * Without the mount, every `submit/approve/reject/withdraw` call
 * would 404 — the adapter wiring was wasted effort.
 *
 * The router writes `ags_graph_change_proposals` (agent-initiated
 * graph mutation proposals — node create/update, edge create/remove,
 * entity merge/split, etc.). Distinct from `graphCorrection` which
 * writes `ags_graph_correction_proposals` (quality/enrichment/golden-
 * question failure-driven corrections).
 *
 * Pattern per `reference_tsconfig_excludes_hide_trpc_mount_drift`:
 * source-scan integrity guard so future refactors that move the
 * import / rename the mount key fail loudly.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import { graphChangeProposalsRouter } from "../../server/agent-studio/services/graph-change-proposals/router";

describe("Phase 11.5 graph-change-proposals router shape", () => {
  it("exports submit + approve + reject + withdraw procedures", () => {
    const procedures = (graphChangeProposalsRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("submit");
    expect(keys).toContain("approve");
    expect(keys).toContain("reject");
    expect(keys).toContain("withdraw");
  });
});

describe("source-scan — graphChangeProposalsRouter is mounted in api/router.ts", () => {
  it("api/router.ts imports graphChangeProposalsRouter and mounts it at `graphChangeProposals`", () => {
    const file = readFileSync(
      resolve(__dirname, "../../server/agent-studio/api/router.ts"),
      "utf-8",
    );
    expect(file).toContain(
      'import { graphChangeProposalsRouter } from "../services/graph-change-proposals/router"',
    );
    expect(file).toMatch(
      /graphChangeProposals:\s*graphChangeProposalsRouter,/,
    );
  });

  it("boot.ts wires the AsdbGraphChangeProposalAdapter (precondition for mount being useful)", () => {
    const boot = readFileSync(
      resolve(__dirname, "../../server/agent-studio/boot.ts"),
      "utf-8",
    );
    expect(boot).toContain("AsdbGraphChangeProposalAdapter");
    expect(boot).toContain("_setGraphChangeProposalAdapter");
  });
});
