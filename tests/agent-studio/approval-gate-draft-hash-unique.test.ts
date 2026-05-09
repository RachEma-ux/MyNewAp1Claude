/**
 * M2-c6 PR-A (cycle-6 audit `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`
 * §M2-c6) — `(agentDraftId, proposedToolCallHash)` UNIQUE INDEX
 * lockstep.
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
 * Coverage strategy mirrors H5-c6:
 *   - PR-A (this PR): drizzle decl + builder retry + source-scan
 *     lockstep. Fresh ASDB instances pick up the UNIQUE INDEX from
 *     seed.ts's reconciler.
 *   - PR-B: operator-applied
 *     `scripts/migrations/manual/ags-pending-perm-draft-hash-unique.sql`
 *     for existing instances (DROP non-unique → CREATE unique). Same
 *     two-PR shape as M2-c5 because IF NOT EXISTS is a no-op when an
 *     index of the same name already exists; non-unique → unique on
 *     legacy DBs requires a DROP + CREATE step that is too dangerous
 *     to run from the boot-time reconciler.
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
