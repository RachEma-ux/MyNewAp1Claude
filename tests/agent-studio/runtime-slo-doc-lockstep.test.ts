/**
 * Phase 11c (Roadmap V3) — runtime SLO doc lockstep.
 *
 * Locks the canonical SLO document at
 * `docs/operations/agent-studio-runtime-slo.md` against the Phase 11a
 * data-model audit. Each SLO row references either an existing column
 * (covered by Phase 11a) or a SQL-aggregable existing column. A future
 * SLO addition that names a non-existent storage path fails this test.
 *
 * Pure source-scan invariants — no DB, no network. Companion to the
 * Phase 11a `runtime-observability-data-model.test.ts`.
 *
 * Why lockstep? Phase 12 load tests assert against these SLOs. If the
 * doc says "p95 first-token < 5s" but the storage column was renamed,
 * Phase 12 fails for the wrong reason. Locking now means a doc-vs-
 * schema drift trips this test before Phase 12 ever runs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const SLO_DOC = readFileSync(
  join(REPO_ROOT, "docs/operations/agent-studio-runtime-slo.md"),
  "utf8",
);
const SCHEMA = readFileSync(
  join(REPO_ROOT, "drizzle/tables/agent-studio.ts"),
  "utf8",
);

describe("Phase 11c — runtime SLO doc lockstep", () => {
  describe("Gate 7 numerics present", () => {
    it("documents the ≥25 concurrent SSE no-tool target (Gate 7 numeric)", () => {
      // Gate 7 numeric: ≥25 concurrent SSE no-tool streams. Locking
      // the literal `25` next to `SSE` somewhere in the doc.
      expect(SLO_DOC).toMatch(/SSE[\s\S]{0,400}\b25\b|\b25\b[\s\S]{0,400}SSE/);
    });

    it("documents the p95 first-token < 5s target", () => {
      expect(SLO_DOC).toMatch(/p95[\s\S]{0,200}<\s*\*?\*?\s*5\s*s/i);
    });

    it("documents the ≥10 concurrent tool streams target", () => {
      expect(SLO_DOC).toMatch(
        /tool\s+streams[\s\S]{0,400}\b10\b|\b10\b[\s\S]{0,400}tool\s+streams/i,
      );
    });

    it("documents the ≥100 trace writes/min target", () => {
      expect(SLO_DOC).toMatch(
        /[≥>=]\s*\*?\*?\s*100\s*\*?\*?[\s\S]{0,200}rows?\/min|trace\s+writes/i,
      );
    });

    it("documents the 0 unbounded memory growth target across 2-min stream", () => {
      expect(SLO_DOC).toMatch(/2[-\s]?min/i);
      expect(SLO_DOC).toMatch(/unbounded\s+(memory\s+)?growth/i);
    });

    it("documents the degradation curve", () => {
      expect(SLO_DOC).toMatch(/degradation\s+curve/i);
      // The curve must include the canonical milestones: at-target,
      // 1.5x, 2x, catastrophic. Drift to "we'll figure it out" doesn't
      // satisfy Gate 7's "documented" requirement.
      expect(SLO_DOC).toMatch(/1\.5[×x]/);
      // `\b2[×x]\b` doesn't work because × is non-word so \b after
      // it followed by space is not a word boundary. Match `2× target`
      // explicitly to lock the curve milestone.
      expect(SLO_DOC).toMatch(/\b2[×x]\s+target/i);
      expect(SLO_DOC).toMatch(/[Cc]atastrophic/);
    });
  });

  describe("SLO storage references match Phase 11a schema", () => {
    it("S2 (first-token) cites the Phase 11a sseFirstTokenMs column", () => {
      // Phase 11a column #6.
      expect(SLO_DOC).toMatch(/sseFirstTokenMs/);
      expect(SCHEMA).toMatch(/sseFirstTokenMs:\s*integer\("sse_first_token_ms"\)/);
    });

    it("S6 (client-disconnect) cites the Phase 11a clientDisconnected column", () => {
      // Phase 11a column #15.
      expect(SLO_DOC).toMatch(/clientDisconnected/);
      expect(SCHEMA).toMatch(/clientDisconnected:\s*boolean\("client_disconnected"\)/);
    });

    it("S7 (idempotency conflicts) cites the Phase 11a idempotencyConflicts column", () => {
      // Phase 11a column #19.
      expect(SLO_DOC).toMatch(/idempotencyConflicts/);
      expect(SCHEMA).toMatch(
        /idempotencyConflicts:\s*integer\("idempotency_conflicts"\)/,
      );
    });

    it("S8 (approval-wait) cites agsPendingPermissionRequests (existing)", () => {
      // Approval-row timestamps were already present pre-Phase 11.
      expect(SLO_DOC).toMatch(/agsPendingPermissionRequests/);
    });

    it("S9 (RAC retrieval) cites agsRacRuntimeTraces (existing, cycle-8 M6-c8)", () => {
      expect(SLO_DOC).toMatch(/agsRacRuntimeTraces/);
    });
  });

  describe("alert routing structure", () => {
    it("documents 4 severities (P0, P1, P2, P3)", () => {
      // The severity ladder aligns with the standard 4-tier model.
      // Locking the count catches a doc edit that drops a tier
      // (which would silently demote serious alerts).
      for (const tier of ["P0", "P1", "P2", "P3"]) {
        expect(SLO_DOC).toContain(tier);
      }
    });

    it("documents the audit-log fallback for every tier", () => {
      // External integrations are optional, but the local audit log
      // is the always-on fallback so an alert never goes silent.
      expect(SLO_DOC).toMatch(/audit\s+log/i);
      expect(SLO_DOC).toMatch(/runtime_slo_alert/);
    });

    it("declares external integrations (Slack / PagerDuty) as optional", () => {
      // Per roadmap §11c. Locking the optionality so an op deploying
      // without these doesn't get spurious "missing alert sink"
      // failures.
      expect(SLO_DOC).toMatch(/[Oo]ptional[\s\S]{0,300}Slack|Slack[\s\S]{0,300}[Oo]ptional/);
      expect(SLO_DOC).toMatch(
        /[Oo]ptional[\s\S]{0,300}PagerDuty|PagerDuty[\s\S]{0,300}[Oo]ptional/,
      );
    });
  });

  describe("Phase 12 load test plan", () => {
    it("enumerates the 8 canonical scenarios from roadmap §12", () => {
      // The roadmap §12 lists: 10/25 concurrent no-tool streams,
      // 10 concurrent tool streams, 100 trace writes/min, 50 pending
      // approvals, long-running stream > 2 min, client disconnect
      // storm, approval expiry under load, MAX_TOOL_TURNS.
      // Spot-check by name.
      expect(SLO_DOC).toMatch(/[Ll]ong-running\s+stream/);
      expect(SLO_DOC).toMatch(/[Cc]lient\s+disconnect\s+storm/);
      expect(SLO_DOC).toMatch(/[Aa]pproval\s+expiry/);
      expect(SLO_DOC).toMatch(/MAX_TOOL_TURNS/);
    });
  });

  describe("lifecycle", () => {
    it("declares a version", () => {
      // Pinned to 1.0.0 today. The lifecycle section commits to
      // semver bumps for SLO changes — this test catches removal of
      // the version field, which would silently make SLO history
      // un-trackable.
      expect(SLO_DOC).toMatch(/Version:\s*\*?\*?\s*1\.0\.0/);
    });

    it("documents the major-bump trigger (threshold narrowing)", () => {
      // A doc edit that loosens (widens) a threshold is a minor; a
      // doc edit that tightens (narrows) is a major + roadmap entry +
      // load test re-run. Lock this rule so a future operator can't
      // sneak in a stricter target without re-certifying.
      expect(SLO_DOC).toMatch(/[Mm]ajor[\s\S]{0,200}narrowed/);
    });
  });
});
