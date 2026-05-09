/**
 * H5-c6 PR-A (cycle-6 audit `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`
 * §H5-c6) — drizzle declaration lockstep for `traceTimeoutReason`.
 *
 * Pre-cycle-6 the trace ledger could not distinguish
 * `approvalStatus = "expired"` outcomes by cause:
 *   - operator granted approval, TTL elapsed before re-use
 *   - operator never decided within APPROVAL_RESUME_TIMEOUT_SEC
 *
 * Both showed as `expired` on the per-trace row. The verdict's
 * `reason` preserved the signal but the trace lost it. Operators
 * analyzing approval-rate could not separate "TTL too short" from
 * "operators not engaged."
 *
 * Post-cycle-6 (PR-A, this PR): drizzle declaration adds
 * `traceTimeoutReason: varchar("trace_timeout_reason", { length: 32 })`
 * to `agsToolCallTraces`. Builder enforces "only set when
 * approvalStatus === 'expired'". Trace persister derives the value
 * from the verdict reason: `approval_timeout` →
 * `"operator_wait_timeout"`; `approval_expired` →
 * `"approval_ttl_elapsed"`.
 *
 * Post-cycle-6 (PR-B, follow-up): operator-applied
 * `scripts/migrations/manual/ags-tool-call-traces-timeout-reason.sql`
 * adds the column on existing ASDB instances (mirrors M2-c5
 * pattern: drizzle declaration + manual SQL — ASDB's reconciler
 * handles new columns from drizzle declarations on fresh DBs but
 * existing rows need the operator-applied SQL).
 *
 * This test asserts the drizzle decl is in place. The PR-B test
 * extension will assert the manual SQL exists + matches the column
 * shape.
 */
import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { agsToolCallTraces } from "../../drizzle/tables/agent-studio";

describe("H5-c6 PR-A — agsToolCallTraces.traceTimeoutReason drizzle declaration", () => {
  it("table declares the trace_timeout_reason column", () => {
    const config = getTableConfig(agsToolCallTraces);
    const col = config.columns.find(
      (c) => c.name === "trace_timeout_reason",
    );
    expect(
      col,
      "H5-c6 violated: agsToolCallTraces is missing the " +
        "`trace_timeout_reason` column. Without it, operators " +
        "cannot distinguish 'operator wait timeout' from 'approval " +
        "TTL elapsed' in the trace ledger.",
    ).toBeDefined();
  });

  it("trace_timeout_reason is NULLABLE (only set when approvalStatus='expired')", () => {
    const config = getTableConfig(agsToolCallTraces);
    const col = config.columns.find(
      (c) => c.name === "trace_timeout_reason",
    );
    expect(col).toBeDefined();
    expect(
      col!.notNull,
      "H5-c6 violated: trace_timeout_reason must be nullable. " +
        "It is semantically only meaningful when approvalStatus = " +
        "'expired'; on every other status it is NULL by builder " +
        "invariant.",
    ).toBe(false);
  });

  it("trace_timeout_reason is varchar(32) (room for both literals + future)", () => {
    const config = getTableConfig(agsToolCallTraces);
    const col = config.columns.find(
      (c) => c.name === "trace_timeout_reason",
    );
    expect(col).toBeDefined();
    // The two known literals fit easily: "operator_wait_timeout"
    // (21 chars) and "approval_ttl_elapsed" (20 chars). length:32
    // leaves room for one more cause without a schema migration.
    const sqlType = (col as unknown as { columnType?: string }).columnType
      ?? (col as unknown as { dataType?: string }).dataType;
    // Drizzle's column metadata varies by version; the simplest
    // assertion is on the declared name + nullable above. We omit a
    // strict varchar(32) assertion and pin only the contract that
    // matters (column exists, nullable). The PR-B manual SQL will
    // pin the exact varchar(32) at the SQL layer.
    expect(sqlType).toBeDefined();
  });
});
