/**
 * M2-c6 PR-A + PR-B (cycle-6 audit
 * `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md` §M2-c6) —
 * `(agentDraftId, proposedToolCallHash)` UNIQUE INDEX lockstep.
 *
 * Pre-cycle-6: the lookup index `idx_ags_pending_perm_draft_hash`
 * was non-unique. `createApprovalRequest`'s SELECT-then-INSERT
 * could race — two concurrent calls between SELECT and INSERT both
 * see "no existing row" and both INSERT, leaving the table with two
 * pending rows for the same (draft, hash) tuple. The doc-comment
 * literally said "unique-ish".
 *
 * Post-cycle-6: drizzle declaration promotes the index to UNIQUE.
 * `createApprovalRequest` catches PG's unique-violation
 * (SQLSTATE 23505) and re-SELECTs to recover the winning row,
 * preserving the silent-dedup contract.
 *
 * Coverage strategy mirrors M2-c5:
 *   - PR-A (merged at #351 / 1b8b70d): drizzle decl + builder retry
 *     + source-scan lockstep. Fresh ASDB instances pick up the
 *     UNIQUE INDEX from seed.ts's reconciler.
 *   - PR-B (this PR): operator-applied
 *     `scripts/migrations/manual/ags-pending-perm-draft-hash-unique.sql`
 *     for existing instances (detect duplicates → DROP non-unique →
 *     CREATE unique). Same two-PR shape as M2-c5 because
 *     `IF NOT EXISTS` is a no-op when an index of the same name
 *     already exists; non-unique → unique on legacy DBs requires a
 *     DROP + CREATE step that is too dangerous to run from the
 *     boot-time reconciler. The PR-B test extension below pins the
 *     manual SQL's shape.
 *
 * Behavioral integration coverage (concurrent createApprovalRequest
 * calls produce exactly 1 row + return same id) is deferred to a
 * B-coverage follow-up against live ASDB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { agsPendingPermissionRequests } from "../../drizzle/tables/agent-studio";

const APPROVAL_GATE_PATH = join(
  process.cwd(),
  "server/agent-studio/services/approval/approval-gate.ts",
);
const DRIZZLE_PATH = join(
  process.cwd(),
  "drizzle/tables/agent-studio.ts",
);
const MANUAL_SQL_PATH = join(
  process.cwd(),
  "scripts/migrations/manual/ags-pending-perm-draft-hash-unique.sql",
);

describe("M2-c6 PR-A — (agentDraftId, proposedToolCallHash) UNIQUE INDEX drizzle decl", () => {
  it("table config exposes a UNIQUE index on (agent_draft_id, proposed_tool_call_hash)", () => {
    const config = getTableConfig(agsPendingPermissionRequests);
    const idxs = (config.indexes ?? []) as unknown as Array<{
      config?: { name?: string; unique?: boolean; columns?: Array<{ name?: string }> };
    }>;
    const draftHashIdx = idxs.find(
      (i) => i.config?.name === "idx_ags_pending_perm_draft_hash",
    );
    expect(
      draftHashIdx,
      "M2-c6 violated: agsPendingPermissionRequests must declare an " +
        "index named `idx_ags_pending_perm_draft_hash`. Without it " +
        "the seed.ts reconciler emits no DDL for the (draft, hash) " +
        "lookup at all.",
    ).toBeDefined();
    const colNames = (draftHashIdx!.config?.columns ?? []).map((c) => c.name);
    expect(colNames).toEqual(["agent_draft_id", "proposed_tool_call_hash"]);
    expect(
      draftHashIdx!.config?.unique,
      "M2-c6 violated: `idx_ags_pending_perm_draft_hash` must be " +
        "declared UNIQUE so the seed.ts reconciler emits " +
        "`CREATE UNIQUE INDEX` on fresh ASDB instances and the " +
        "DB itself rejects the SELECT-then-INSERT race in " +
        "`createApprovalRequest`.",
    ).toBe(true);
  });

  it("drizzle source carries the M2-c6 closure marker", () => {
    const src = readFileSync(DRIZZLE_PATH, "utf8");
    expect(
      src,
      "M2-c6 violated: drizzle/tables/agent-studio.ts must carry the " +
        "`M2-c6` closure marker so a future audit can trace the " +
        "UNIQUE-promotion back to its origin item.",
    ).toMatch(/M2-c6\b/);
  });

  it("drizzle source notes the M2-c6 PR-B follow-up for existing instances", () => {
    // The split-PR pattern is the load-bearing detail. Without the
    // pointer, a future operator who reads the drizzle decl will
    // assume seed.ts handles existing instances — but
    // `CREATE UNIQUE INDEX IF NOT EXISTS <existing-name>` is a no-op,
    // so the legacy DB silently keeps its non-unique index.
    const src = readFileSync(DRIZZLE_PATH, "utf8");
    expect(
      src,
      "M2-c6 violated: drizzle decl must point at the PR-B manual " +
        "SQL so operators don't assume seed.ts handles the legacy " +
        "non-unique → unique upgrade automatically.",
    ).toMatch(/PR-B|manual SQL|ags-pending-perm-draft-hash-unique/i);
  });
});

describe("M2-c6 PR-A — createApprovalRequest catches the unique-violation race", () => {
  const src = readFileSync(APPROVAL_GATE_PATH, "utf8");

  it("source carries the M2-c6 closure marker", () => {
    expect(
      src,
      "M2-c6 violated: approval-gate.ts must carry the `M2-c6` " +
        "closure marker so a future audit can trace the " +
        "unique-violation retry back to its origin item.",
    ).toMatch(/M2-c6\b/);
  });

  it("source catches SQLSTATE 23505 (unique_violation)", () => {
    // Without this catch, PG's unique-violation propagates as a 500
    // — the rare race becomes a user-visible failure. M2-c6 is
    // about silent-dedup-with-DB-backstop, not "fail loudly on
    // races."
    expect(
      src,
      "M2-c6 violated: approval-gate.ts must catch SQLSTATE 23505 " +
        "(unique_violation) on the createApprovalRequest INSERT. " +
        "Without this, the DB-level UNIQUE turns a silent dedup " +
        "into a user-visible 500 on the rare SELECT-then-INSERT " +
        "race — a regression vs. pre-cycle-6 behavior.",
    ).toMatch(/code\s*!==?\s*["']23505["']|["']23505["']/);
  });

  it("source re-SELECTs after the unique-violation catch", () => {
    // The catch alone isn't enough — we need to recover the
    // existing row's id and return the silent-dedup result. A
    // future PR that "simplifies" by dropping the re-SELECT would
    // turn the catch into a swallow + return undefined.
    expect(
      src,
      "M2-c6 violated: approval-gate.ts must re-SELECT after " +
        "catching unique_violation so the caller gets the existing " +
        "row's id (silent-dedup contract).",
    ).toMatch(
      /23505[\s\S]{0,400}\.select\(\)[\s\S]{0,400}from\(agsPendingPermissionRequests\)/,
    );
  });

  it("doc-block on createApprovalRequest names the M2-c6 race coverage", () => {
    // The doc-block is the primary discovery surface for future
    // readers. Naming the race + the SQLSTATE pins the contract
    // even if the code reorganizes.
    expect(
      src,
      "M2-c6 violated: createApprovalRequest's doc-block must " +
        "explain the M2-c6 race coverage so a future reader who " +
        "encounters the try/catch knows why it's there.",
    ).toMatch(/Race coverage \(M2-c6\)|M2-c6.*UNIQUE INDEX/);
  });
});

describe("M2-c6 PR-B — operator-applied manual SQL for existing instances", () => {
  // Mirrors M2-c5 PR-B's 3-way lockstep (drizzle decl + builder
  // source + manual SQL). The SQL itself can't be unit-tested
  // against a live ASDB from the test runner; the contract this
  // pins is the SHAPE — name, target table, target columns, the
  // duplicate-detection guard, the DROP+CREATE upgrade path. A
  // future PR that drops the script or weakens its safety would
  // fail this block.
  const sql = readFileSync(MANUAL_SQL_PATH, "utf8");

  it("manual SQL exists at the documented path", () => {
    // The "exists" assertion is implicit in the readFileSync above
    // — but we surface a non-empty check so a future zero-byte
    // file (failed write, accidentally truncated) still fails
    // the test.
    expect(
      sql.length,
      "M2-c6 violated: manual SQL must exist with non-empty body " +
        "at scripts/migrations/manual/ags-pending-perm-draft-hash-unique.sql.",
    ).toBeGreaterThan(0);
  });

  it("manual SQL carries the M2-c6 closure marker", () => {
    expect(
      sql,
      "M2-c6 violated: manual SQL must carry the `M2-c6` closure " +
        "marker so a future operator can trace it back to the " +
        "audit item.",
    ).toMatch(/M2-c6\b/);
  });

  it("manual SQL targets ags_pending_permission_requests", () => {
    // Hard-pinning the table name catches a future copy-paste typo
    // that would silently apply the migration to the wrong table.
    expect(
      sql,
      "M2-c6 violated: manual SQL must target " +
        "`ags_pending_permission_requests` (the approval row table).",
    ).toMatch(/ags_pending_permission_requests\b/);
  });

  it("manual SQL targets the (agent_draft_id, proposed_tool_call_hash) tuple", () => {
    // The whole point of M2-c6 is unique-ness on this exact pair.
    // A future PR that "expanded the constraint" or used
    // (proposed_tool_call_hash, agent_draft_id) ordering (PG
    // treats column order in btree indexes as semantically
    // identical for unique-ness but different for query
    // planning) would fail this assertion.
    expect(
      sql,
      "M2-c6 violated: manual SQL must reference both " +
        "`agent_draft_id` AND `proposed_tool_call_hash` so the " +
        "constraint matches the drizzle declaration.",
    ).toMatch(/agent_draft_id[\s\S]{0,80}proposed_tool_call_hash/);
  });

  it("manual SQL includes a duplicate-detection guard before the constraint", () => {
    // Without this guard, CREATE UNIQUE INDEX would fail with a
    // raw constraint-violation error on the first duplicate row,
    // and the operator would be left guessing which rows to clean
    // up. A future PR that "simplified" by dropping the guard
    // would re-introduce the operator-pain path.
    expect(
      sql,
      "M2-c6 violated: manual SQL must detect duplicates before " +
        "attempting the unique constraint and surface a clear " +
        "operator-actionable error if any exist.",
    ).toMatch(/HAVING COUNT\(\*\) > 1[\s\S]{0,800}RAISE EXCEPTION/);
  });

  it("manual SQL drops the legacy non-unique index before creating the unique one", () => {
    // The DROP+CREATE pair is the load-bearing detail. A future
    // PR that "replaced" with `CREATE UNIQUE INDEX IF NOT EXISTS`
    // alone would no-op on legacy DBs (the legacy non-unique
    // index already holds the name), reverting the closure.
    expect(
      sql,
      "M2-c6 violated: manual SQL must DROP the legacy " +
        "`idx_ags_pending_perm_draft_hash` index before CREATE " +
        "UNIQUE INDEX. Without the DROP, IF NOT EXISTS short- " +
        "circuits on legacy DBs and the constraint never lands.",
    ).toMatch(
      /DROP INDEX IF EXISTS idx_ags_pending_perm_draft_hash[\s\S]{0,600}CREATE UNIQUE INDEX[\s\S]{0,200}idx_ags_pending_perm_draft_hash/,
    );
  });

  it("manual SQL is wrapped in a transaction (BEGIN/COMMIT)", () => {
    // Without the transaction, a failure between DROP and CREATE
    // would leave the table with NO index on (draft, hash) — the
    // approval-gate lookup would still work but at a sequential
    // scan, and any future drift between DROP success + CREATE
    // failure becomes operator-invisible.
    expect(
      sql,
      "M2-c6 violated: manual SQL must wrap the DROP+CREATE in a " +
        "transaction so a mid-script failure rolls back cleanly " +
        "instead of leaving the table without the lookup index.",
    ).toMatch(/BEGIN;[\s\S]+COMMIT;/);
  });
});
