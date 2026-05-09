/**
 * M3-c6 (cycle-6 audit `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`
 * §M3-c6) — operator-applied expiry-sweep + doc-block lockstep.
 *
 * Pre-cycle-6 there was no background sweep that flipped expired
 * `allowed` rows to `timed_out`. The runtime gate
 * (`evaluateApprovalGate`) reads `expiresAt` per-call and correctly
 * rejects expired rows — the gate is safe. But the row's `status`
 * column lies: it stays at "allowed" forever even after the TTL
 * elapses, so operator-facing surfaces filtering by `status` (e.g.
 * `tool-approvals-router.listByDraft` with `status: "allowed"`)
 * overcount active permits.
 *
 * Post-cycle-6 closure ships:
 *   1. `scripts/migrations/manual/ags-pending-perm-expiry-sweep.sql` —
 *      operator-applied UPDATE that flips elapsed `allowed` rows
 *      to `timed_out` with `reason='expiry_sweep'` and
 *      `decided_at = expires_at` (preserves audit truth).
 *   2. Doc-block on `decideApprovalState` in approval-gate.ts
 *      explaining the source-of-truth contract + pointing at the
 *      sweep script.
 *   3. Doc-block on `listByDraft` in tool-approvals-router.ts
 *      warning that `status: "allowed"` filtering can return
 *      elapsed rows + pointing at the sweep + post-filter
 *      workarounds.
 *
 * Mirrors the cycle-4/5 pattern of doc + operator-tooling for
 * "this needs operator action periodically." No app-layer sweep
 * because ASDB is operator-managed (Phase 12.5 — no built-in
 * scheduler).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SQL_PATH = join(
  process.cwd(),
  "scripts/migrations/manual/ags-pending-perm-expiry-sweep.sql",
);
const APPROVAL_GATE_PATH = join(
  process.cwd(),
  "server/agent-studio/services/approval/approval-gate.ts",
);
const TOOL_APPROVALS_ROUTER_PATH = join(
  process.cwd(),
  "server/agent-studio/api/tool-approvals-router.ts",
);

describe("M3-c6 — expiry-sweep operator SQL", () => {
  const sql = readFileSync(SQL_PATH, "utf8");

  it("manual SQL exists at the documented path with non-empty body", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("manual SQL carries the M3-c6 closure marker", () => {
    expect(
      sql,
      "M3-c6 violated: manual SQL must carry the `M3-c6` closure " +
        "marker so a future operator can trace it back to the audit.",
    ).toMatch(/M3-c6\b/);
  });

  it("manual SQL targets ags_pending_permission_requests", () => {
    expect(
      sql,
      "M3-c6 violated: manual SQL must target " +
        "`ags_pending_permission_requests` (the approval row table).",
    ).toMatch(/ags_pending_permission_requests\b/);
  });

  it("manual SQL flips status='allowed' to 'timed_out' on expiry (not the other way)", () => {
    // Catches a future PR that "simplified" the sweep to flip the
    // wrong direction (e.g. timed_out → allowed) which would be a
    // catastrophic security regression.
    expect(
      sql,
      "M3-c6 violated: manual SQL must transition expired " +
        "`allowed` rows to `timed_out`, NOT the other way. The " +
        "wrong direction would re-permit expired tool calls.",
    ).toMatch(
      /SET\s+status\s*=\s*'timed_out'[\s\S]{0,400}WHERE\s+status\s*=\s*'allowed'[\s\S]{0,200}expires_at\s*<\s*NOW\(\)/,
    );
  });

  it("manual SQL preserves audit truth (decided_at = expires_at, not NOW())", () => {
    // The sweep is correcting a stale status column; the row was
    // de-facto expired at expires_at, NOT at sweep run time.
    // Setting decided_at = NOW() would falsify the audit trail.
    expect(
      sql,
      "M3-c6 violated: manual SQL must set decided_at = expires_at " +
        "(not NOW()) so the audit trail reflects when the row " +
        "actually expired, not when the sweep ran.",
    ).toMatch(/decided_at\s*=\s*expires_at\b/);
  });

  it("manual SQL marks sweep-driven rows with reason='expiry_sweep'", () => {
    // The reason field distinguishes sweep transitions from
    // operator-driven `timed_out` decisions and from the
    // simulation poll's `simulation_timeout`. Without this marker,
    // forensics can't tell why a row is timed_out.
    expect(
      sql,
      "M3-c6 violated: manual SQL must mark sweep-driven rows " +
        "with reason='expiry_sweep' to distinguish them from " +
        "operator-driven and simulation-poll timeouts.",
    ).toMatch(/reason\s*=\s*'expiry_sweep'/);
  });

  it("manual SQL is wrapped in a transaction (BEGIN/COMMIT)", () => {
    expect(
      sql,
      "M3-c6 violated: manual SQL must wrap the UPDATE in a " +
        "transaction so a mid-script failure rolls back cleanly.",
    ).toMatch(/BEGIN;[\s\S]+COMMIT;/);
  });
});

describe("M3-c6 — doc-block coverage on the two operator surfaces", () => {
  it("approval-gate.ts notes the expiry-sweep contract on decideApprovalState", () => {
    // The doc-block is the primary discovery surface — without it,
    // a future reader who notices `status` and `expiresAt` can
    // disagree won't know which is authoritative.
    const src = readFileSync(APPROVAL_GATE_PATH, "utf8");
    expect(
      src,
      "M3-c6 violated: approval-gate.ts must document the " +
        "`expiresAt is source of truth, status lags` contract on " +
        "`decideApprovalState` so future readers know why the " +
        "expiry sweep is needed.",
    ).toMatch(/M3-c6[\s\S]{0,800}expiry-sweep|M3-c6[\s\S]{0,800}ags-pending-perm-expiry-sweep/);
  });

  it("tool-approvals-router.ts warns listByDraft about status='allowed' overcounting", () => {
    // The listByDraft endpoint is the PRIMARY operator-facing
    // surface that exposes the lying-status problem. Without the
    // doc-block, an operator who builds a "currently active
    // permits" UI will overcount and not understand why.
    const src = readFileSync(TOOL_APPROVALS_ROUTER_PATH, "utf8");
    expect(
      src,
      "M3-c6 violated: tool-approvals-router.ts must document the " +
        "M3-c6 overcount caveat on `listByDraft` so operators " +
        "building 'currently-permitted' UIs know to either run " +
        "the sweep or post-filter on `expiresAt`.",
    ).toMatch(/M3-c6[\s\S]{0,800}status.{0,40}allowed|M3-c6[\s\S]{0,800}expiry-sweep/);
  });

  it("tool-approvals-router.ts points at the sweep SQL by path", () => {
    // The path-pointer is the load-bearing detail. A future PR
    // that drops the path leaves the doc-block as a vague warning
    // with no remediation pointer.
    const src = readFileSync(TOOL_APPROVALS_ROUTER_PATH, "utf8");
    expect(
      src,
      "M3-c6 violated: tool-approvals-router.ts must reference " +
        "the sweep SQL by path so operators can find the script.",
    ).toMatch(/ags-pending-perm-expiry-sweep/);
  });
});
