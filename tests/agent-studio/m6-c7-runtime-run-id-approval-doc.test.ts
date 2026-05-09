/**
 * M6-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §M6-c7) — runtimeRunId threading on approval rows.
 *
 * The `agsPendingPermissionRequests.runtimeRunId` column anchors
 * approval rows to the originating runtime run. For OFFLINE / SCHEDULED
 * runs this is straightforward — there's a real `agsRuntimeRuns` row
 * that owns the dispatcher chain. For LIVE CHAT sessions (Phase 18+
 * binding-aware chat-stream / chat service), there is NO formal
 * `agsRuntimeRuns` row: the chat session's id stands in. This works
 * for the schema's NOT NULL + index requirements but creates a
 * subtle forensics asymmetry — operators filtering
 * `agsRuntimePolicyEvents` by `runtimeRunId` for "all dispatches
 * under run #5" can get two populations mixed if a chat session and
 * a runtime run happen to collide on the integer id.
 *
 * Cycle-7 closure shape (per audit doc): doc-block FLAG, no
 * migration. Eliminating the asymmetry properly requires a
 * Phase 12.6+ design (sentinel runtime-run-per-chat-session, OR
 * tagged-union split of runtimeRunId at the audit + trace layer)
 * — too much surface for cycle-7's scope.
 *
 * This file pins:
 *   1. The schema doc-block flags the asymmetry + names the two
 *      Phase 12.6+ resolution paths (sentinel-row vs tagged-union).
 *   2. The doc-block names the M4-c5 approvalRequestId mitigation so
 *      a reader doesn't think the asymmetry is unmitigated.
 *   3. The doc-block names L6-c7 (folded) as the joint-resolution
 *      partner so a future PR finds both items.
 *   4. The closure marker `M6-c7` is on the schema file.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SCHEMA_PATH = join(
  process.cwd(),
  "drizzle/tables/agent-studio.ts",
);

describe("M6-c7 — runtimeRunId asymmetry doc-block on approval table", () => {
  const src = readFileSync(SCHEMA_PATH, "utf8");

  it("schema file carries the M6-c7 closure marker", () => {
    expect(
      src,
      "M6-c7 violated: drizzle/tables/agent-studio.ts must carry " +
        "the M6-c7 closure marker so a future audit can trace the " +
        "doc-block back to its origin item.",
    ).toMatch(/M6-c7\b/);
  });

  it("doc-block sits on agsPendingPermissionRequests (not floating elsewhere)", () => {
    // The asymmetry is a property of the approval table — the
    // doc-block has to be visually adjacent so a reviewer
    // touching the table sees the contract.
    expect(
      src,
      "M6-c7 violated: M6-c7 doc-block must be in the JSDoc " +
        "directly above `agsPendingPermissionRequests`, not " +
        "elsewhere in the file.",
    ).toMatch(
      /M6-c7[\s\S]{0,3000}export\s+const\s+agsPendingPermissionRequests/,
    );
  });

  it("doc-block names the offline-vs-live-chat distinction", () => {
    expect(
      src,
      "M6-c7 violated: doc-block must explain the asymmetry — " +
        "OFFLINE / SCHEDULED runs anchor to a real agsRuntimeRuns row, " +
        "while LIVE CHAT uses the chat session id as a stand-in. " +
        "Without naming both populations the asymmetry is invisible.",
    ).toMatch(/M6-c7[\s\S]{0,3000}OFFLINE[\s\S]{0,500}LIVE CHAT/i);
  });

  it("doc-block names the operator-forensics impact (mixed populations on filter)", () => {
    expect(
      src,
      "M6-c7 violated: doc-block must explain the operator-facing " +
        "consequence — filtering policyEvents by runtimeRunId can " +
        "mix runtime-run dispatches with chat-session dispatches if " +
        "the integer ids collide.",
    ).toMatch(/M6-c7[\s\S]{0,3000}policyEvents|RuntimePolicyEvents|policy events/i);
  });

  it("doc-block names BOTH Phase 12.6+ resolution paths (sentinel-row vs tagged-union)", () => {
    // The audit's closure shape said "flag for Phase 12.6+ formal
    // runtimeRuns-for-chat-sessions design." Naming the two viable
    // paths inline gives a future designer the trade-off without
    // re-deriving them.
    expect(
      src,
      "M6-c7 violated: doc-block must enumerate BOTH viable " +
        "Phase 12.6+ resolution paths: (a) sentinel agsRuntimeRuns " +
        "row per chat session (uniform anchor), (b) tagged-union " +
        "runtimeRunId split (cleaner semantics but schema migration). " +
        "Naming only one path biases the future design.",
    ).toMatch(
      /M6-c7[\s\S]{0,3000}sentinel[\s\S]{0,500}tagged[\s\S]{0,200}union|tagged[\s\S]{0,500}union[\s\S]{0,500}sentinel/i,
    );
  });

  it("doc-block names the M4-c5 approvalRequestId mitigation", () => {
    // M4-c5 already threaded approvalRequestId into the audit
    // payload so approval→audit joins don't NEED runtimeRunId-as-
    // pivot. Without naming this mitigation a reader could think
    // the asymmetry blocks operator forensics entirely (it doesn't —
    // it just complicates one specific query pattern).
    expect(
      src,
      "M6-c7 violated: doc-block must name the M4-c5 mitigation " +
        "(approvalRequestId in audit payload) so a reader doesn't " +
        "think the asymmetry is unmitigated. Today's forensic story " +
        "is 'JOIN ON approvalRequestId, not runtimeRunId.'",
    ).toMatch(/M6-c7[\s\S]{0,3000}M4-c5[\s\S]{0,500}approvalRequestId/);
  });

  it("doc-block names L6-c7 (folded) as the joint-resolution partner", () => {
    // L6-c7 covers the same ambiguity at the chat-session lifecycle
    // layer. They share the resolution path; naming the partner
    // ensures a future PR closes both together.
    expect(
      src,
      "M6-c7 violated: doc-block must reference L6-c7 (the folded " +
        "chat-session-lifecycle item) so a future PR addressing the " +
        "Phase 12.6+ design closes both items together.",
    ).toMatch(/L6-c7/);
  });

  it("doc-block flags 'a future migration that tackles this MUST update this doc-block + lockstep'", () => {
    // Standing pattern: doc-block says "if you change this, update
    // me." Mirrors the L4-c5 / H7-c7 / L3-c7 contract markers.
    expect(
      src,
      "M6-c7 violated: doc-block must explicitly require future " +
        "migrations to update the doc-block + the M6-c7 lockstep — " +
        "the standing 'contract surface' pattern from cycle-5/6/7.",
    ).toMatch(/M6-c7[\s\S]{0,3000}future migration[\s\S]{0,200}MUST update/i);
  });
});
