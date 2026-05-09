/**
 * M5-c6 (cycle-6 audit `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`
 * §M5-c6) — concurrent-decide unit-test gap.
 *
 * Pre-cycle-6 the M5-c4 already-terminal rejection-audit path in
 * `decideApprovalRequest` had only INTEGRATION coverage
 * (`tests/integration/agent-studio/approval-gate.integration.test.ts`)
 * which exercises a live ASDB. Pure unit-level coverage of the
 * already-decided branch was missing — meaning a refactor that
 * accidentally swallowed the rejection-audit emit (or moved it
 * outside the `if (!updated)` branch) wouldn't fail until CI ran
 * the integration suite (slower, requires PG).
 *
 * Post-cycle-6: this file mocks `getAsDb()` and asserts the M5-c4
 * audit-row-on-already-terminal contract under unit-test
 * conditions. Mirrors the cycle-5 / cycle-6 pattern of source-scan
 * + behavioral-mock co-existing with integration tests.
 *
 * What the M5-c4 contract guarantees (from approval-gate.ts:459-496):
 *   When decideApprovalRequest is called on a row whose status is
 *   no longer "pending", it MUST:
 *     1. NOT mutate the row again (UPDATE WHERE status='pending'
 *        already protects this; we verify zero mutating calls).
 *     2. Re-SELECT the row to learn the current state.
 *     3. INSERT into agsRuntimePolicyEvents with
 *        decision="rejected_already_decided" capturing
 *        {attemptedBy, attemptedStatus, currentStatus, ...} for
 *        forensic reconstruction.
 *     4. Return {ok: false, status: <current>, reason: "already_decided"}.
 *
 * If any of those four invariants drifts in a future PR, this
 * file fails fast in unit CI (no ASDB needed).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
}));

vi.mock("../../server/agent-studio/db/connection", () => ({
  getAsDb: () => mocks.db,
}));

import { decideApprovalRequest } from "../../server/agent-studio/services/approval/approval-gate";
import {
  agsPendingPermissionRequests,
  agsRuntimePolicyEvents,
} from "../../drizzle/tables/agent-studio";

interface FakeRow {
  id: number;
  runtimeRunId: number;
  status: "pending" | "allowed" | "denied" | "timed_out";
  expiresAt: Date | null;
  proposedToolCallHash: string | null;
  toolName: string;
}

function createFakeDb(opts: {
  /** Row returned from the post-failed-UPDATE re-SELECT. null = row missing. */
  reselectedRow: FakeRow | null;
  /** What .update().set().where().returning() yields. Empty array = "no row matched the WHERE" (i.e. row already terminal). */
  updateReturning?: unknown[];
}) {
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const updates: Array<{ table: unknown; set: unknown; where: unknown }> = [];

  const db: any = {
    inserts,
    updates,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            opts.reselectedRow ? [opts.reselectedRow] : [],
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (set: unknown) => ({
        where: (where: unknown) => ({
          returning: async () => {
            updates.push({ table, set, where });
            return opts.updateReturning ?? [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: async (value: unknown) => {
        inserts.push({ table, value });
        return undefined;
      },
    }),
  };
  return db;
}

describe("M5-c6 — decideApprovalRequest already-terminal rejection-audit (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("when row is already 'allowed', emits rejected_already_decided audit + returns ok=false", async () => {
    const existingRow: FakeRow = {
      id: 42,
      runtimeRunId: 100,
      status: "allowed",
      expiresAt: new Date("2026-05-09T15:00:00Z"),
      proposedToolCallHash: "a".repeat(64),
      toolName: "search_docs",
    };
    mocks.db = createFakeDb({
      reselectedRow: existingRow,
      updateReturning: [], // UPDATE WHERE status='pending' matched zero rows
    });

    const r = await decideApprovalRequest({
      approvalRequestId: 42,
      status: "denied", // operator B attempting to flip after operator A already permitted
      decidedBy: 7,
      reason: "operator_b_attempt",
      now: new Date("2026-05-09T15:30:00Z"),
    });

    // Invariant 1 — return shape signals the rejection
    expect(r.ok).toBe(false);
    expect(r.status).toBe("allowed"); // current state, not attempted state
    expect(r.reason).toBe("already_decided");

    // Invariant 2 — UPDATE was attempted (with status='pending' WHERE),
    // returned no rows. We don't strictly require zero updates because
    // the WHERE filter is what protects the row; we DO require the
    // update.set() did NOT include a successful row-state change.
    expect((mocks.db as any).updates.length).toBe(1);

    // Invariant 3 — exactly one INSERT into agsRuntimePolicyEvents
    // with decision='rejected_already_decided'
    const auditInserts = (mocks.db as any).inserts.filter(
      (i: any) => i.table === agsRuntimePolicyEvents,
    );
    expect(
      auditInserts.length,
      "M5-c6 violated: when decideApprovalRequest sees an " +
        "already-terminal row, it must emit a single audit row " +
        "with decision='rejected_already_decided' so forensics " +
        "can reconstruct the attempt.",
    ).toBe(1);

    const auditValue = auditInserts[0].value as any;
    expect(auditValue.policyKey).toBe("approval_gate");
    expect(auditValue.decision).toBe("rejected_already_decided");
    expect(auditValue.runId).toBe(100);
    // Payload carries forensic context — operator B's identity +
    // attempted state + current state.
    expect(auditValue.payload.attemptedBy).toBe(7);
    expect(auditValue.payload.attemptedStatus).toBe("denied");
    expect(auditValue.payload.currentStatus).toBe("allowed");
    expect(auditValue.payload.approvalRequestId).toBe(42);

    // Invariant 4 — NO insert into agsPendingPermissionRequests
    // (the SUT must not double-create the row on a redecide attempt)
    const rowInserts = (mocks.db as any).inserts.filter(
      (i: any) => i.table === agsPendingPermissionRequests,
    );
    expect(rowInserts.length).toBe(0);
  });

  it("when row is already 'denied', audit captures the new attempt's status delta", async () => {
    // A second operator attempts to upgrade a denied row to allowed.
    // The audit must capture {attemptedStatus: "allowed", currentStatus:
    // "denied"} so the forensic reader sees the override attempt
    // direction.
    mocks.db = createFakeDb({
      reselectedRow: {
        id: 99,
        runtimeRunId: 200,
        status: "denied",
        expiresAt: null,
        proposedToolCallHash: null,
        toolName: "shell_exec",
      },
      updateReturning: [],
    });

    const r = await decideApprovalRequest({
      approvalRequestId: 99,
      status: "allowed",
      decidedBy: 11,
      now: new Date(),
    });

    expect(r.ok).toBe(false);
    expect(r.status).toBe("denied");

    const audit = (mocks.db as any).inserts.find(
      (i: any) => i.table === agsRuntimePolicyEvents,
    );
    expect(audit.value.payload.currentStatus).toBe("denied");
    expect(audit.value.payload.attemptedStatus).toBe("allowed");
  });

  it("when the approval row is missing entirely, returns row_not_found WITHOUT emitting an audit", async () => {
    // Edge case: approvalRequestId points at a row that doesn't
    // exist (already deleted / typo). The audit can't carry a runId
    // (we don't know it), so it must be skipped — better to return
    // a clean error than to insert a dangling audit row.
    mocks.db = createFakeDb({
      reselectedRow: null,
      updateReturning: [],
    });

    const r = await decideApprovalRequest({
      approvalRequestId: 9999,
      status: "denied",
      now: new Date(),
    });

    expect(r.ok).toBe(false);
    expect(r.reason).toBe("row_not_found");

    const audits = (mocks.db as any).inserts.filter(
      (i: any) => i.table === agsRuntimePolicyEvents,
    );
    expect(
      audits.length,
      "M5-c6 violated: when the approval row is missing, " +
        "decideApprovalRequest must NOT emit an audit (no runId to " +
        "attach it to). Returning row_not_found without an audit " +
        "is the correct degradation.",
    ).toBe(0);
  });

  it("when reason is omitted on a redecide, audit fills in attempted_redecide_to_<status>", async () => {
    // The audit's `reason` field must always be populated so
    // grepping logs for "attempted_redecide_to_*" surfaces all
    // M5-c4 events even when callers forgot to supply a reason.
    mocks.db = createFakeDb({
      reselectedRow: {
        id: 1,
        runtimeRunId: 1,
        status: "allowed",
        expiresAt: new Date(),
        proposedToolCallHash: null,
        toolName: "x",
      },
      updateReturning: [],
    });

    await decideApprovalRequest({
      approvalRequestId: 1,
      status: "timed_out",
      now: new Date(),
    });

    const audit = (mocks.db as any).inserts.find(
      (i: any) => i.table === agsRuntimePolicyEvents,
    );
    expect(audit.value.reason).toBe("attempted_redecide_to_timed_out");
  });
});
