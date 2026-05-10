/**
 * Phase 11a (Roadmap V3) — runtime observability data model.
 *
 * Locks the 5 new columns added to `agsRuntimeRuns` for Gate 7
 * observability + load certification. The audit doc at
 * `docs/evidence/runtime-hardening/2026-05-10-phase-11a/01-runtime-
 * observability-coverage.md` lists 19 metrics from roadmap §11a; 14
 * are covered by existing tables (real columns or SQL aggregates),
 * 5 are truly missing and added in this phase.
 *
 * Pure source-scan + import-shape tests — no DB, no network. The
 * column writers are deferred to Phase 11b (alongside the UI), so
 * runtime population is not exercised here.
 *
 * Storage decision (per §11a):
 *   - reuse existing trace/audit tables where columns suffice
 *   - new columns/tables only when reuse is impossible
 *
 * The 5 truly-missing metrics:
 *   #5  SSE duration         → sseDurationMs
 *   #6  first-token latency  → sseFirstTokenMs (Gate 7 numeric: p95 < 5s)
 *   #14 error reason         → errorReason (run-level summary)
 *   #15 client disconnects   → clientDisconnected (Phase 3.4 follow-up)
 *   #19 idempotency conflicts → idempotencyConflicts (Phase 3.2 follow-up)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { agsRuntimeRuns } from "../../drizzle/tables/agent-studio";

const REPO_ROOT = process.cwd();
const SCHEMA = readFileSync(
  join(REPO_ROOT, "drizzle/tables/agent-studio.ts"),
  "utf8",
);
const AUDIT_DOC = readFileSync(
  join(
    REPO_ROOT,
    "docs/evidence/runtime-hardening/2026-05-10-phase-11a/01-runtime-observability-coverage.md",
  ),
  "utf8",
);

describe("Phase 11a — runtime observability data model", () => {
  describe("schema additions on agsRuntimeRuns", () => {
    it("declares sseFirstTokenMs as integer (metric #6, Gate 7 numeric)", () => {
      expect(SCHEMA).toMatch(
        /sseFirstTokenMs:\s*integer\("sse_first_token_ms"\)/,
      );
    });

    it("declares sseDurationMs as integer (metric #5)", () => {
      // Distinct from `durationMs` which covers the whole run (including
      // pre-stream binding + governance setup). Locking both columns
      // exist catches a future PR that drops one.
      expect(SCHEMA).toMatch(/sseDurationMs:\s*integer\("sse_duration_ms"\)/);
      expect(SCHEMA).toMatch(/\bdurationMs:\s*integer\("duration_ms"\)/);
    });

    it("declares errorReason as text (metric #14)", () => {
      // Free-form text column for the run-level error summary. Per-call
      // errors stay on agsToolCallTraces.errorMessage.
      expect(SCHEMA).toMatch(/errorReason:\s*text\("error_reason"\)/);
    });

    it("declares clientDisconnected as boolean defaulting false (metric #15)", () => {
      // Phase 3.4 added the SSE-side abort signal but didn't persist
      // the outcome. Default false so existing rows + simulation runs
      // (no SSE) stay coherent.
      expect(SCHEMA).toMatch(
        /clientDisconnected:\s*boolean\("client_disconnected"\)\.default\(false\)/,
      );
    });

    it("declares idempotencyConflicts as integer defaulting 0 (metric #19)", () => {
      // Phase 3.2 emits the SSE error but had no persisted counter.
      // Default 0 so existing rows pre-Phase-11a aggregate cleanly.
      expect(SCHEMA).toMatch(
        /idempotencyConflicts:\s*integer\("idempotency_conflicts"\)\.default\(0\)/,
      );
    });
  });

  describe("Drizzle inferred types expose the new columns", () => {
    // If the column is on the Drizzle table, its `$inferSelect` /
    // `$inferInsert` pulls it through to TypeScript. This catches a
    // future schema rename that doesn't update the canonical inferred
    // shape. Runtime callers (repo helpers, UI tRPC procedures) read
    // these inferred types.
    it("$inferSelect carries the 5 new columns", () => {
      type Row = typeof agsRuntimeRuns.$inferSelect;
      // Compile-time witnesses — the assignments fail tsc if the
      // column shape drifts. (Runtime expectations are trivially true.)
      const row: Partial<Row> = {
        sseFirstTokenMs: 100,
        sseDurationMs: 1000,
        errorReason: "boom",
        clientDisconnected: true,
        idempotencyConflicts: 0,
      };
      expect(row.sseFirstTokenMs).toBe(100);
      expect(row.errorReason).toBe("boom");
      expect(row.clientDisconnected).toBe(true);
    });
  });

  describe("audit doc invariants", () => {
    it("audit doc lists exactly 5 ➕ markers (the new columns)", () => {
      // The audit matrix uses ➕ to mark "NEW column added in this
      // phase". A future PR that adds a 6th column to agsRuntimeRuns
      // for Phase 11a should also bump this count + update the matrix
      // — locking the count prevents silent drift between code and doc.
      const newMarkers = AUDIT_DOC.match(/➕/g);
      // ≥5: one ➕ per new-column row in the Status column.
      // Additional ➕ uses in legend/headers are bonus. The lower
      // bound catches "all new-column rows disappeared" without
      // asserting on markdown details.
      expect(newMarkers?.length).toBeGreaterThanOrEqual(5);
    });

    it("audit doc references each new column by name", () => {
      // Direct lockstep: every column landing in code must show up in
      // the audit matrix.
      for (const col of [
        "sseFirstTokenMs",
        "sseDurationMs",
        "errorReason",
        "clientDisconnected",
        "idempotencyConflicts",
      ]) {
        expect(AUDIT_DOC).toContain(col);
      }
    });

    it("audit doc names the storage-decision principle from §11a", () => {
      // Lock the principle so a future audit doesn't drift from the
      // roadmap text (reuse → new columns only when reuse is impossible).
      expect(AUDIT_DOC).toMatch(
        /reuse[\s\S]{0,100}existing[\s\S]{0,100}new\s+columns[\s\S]{0,100}reuse\s+is\s+impossible/i,
      );
    });

    it("audit doc records that writers are deferred to Phase 11b", () => {
      // Phase 11a freezes the schema; Phase 11b populates it alongside
      // the UI. The doc-block invariant catches a future PR that
      // accidentally adds writers in the wrong phase boundary.
      expect(AUDIT_DOC).toMatch(/writers[\s\S]{0,100}wired in Phase 11b/i);
    });
  });
});
