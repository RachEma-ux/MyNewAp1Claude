/**
 * C2-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §C2-c7) — message-vs-trace asymmetric failure doc-bundle lockstep.
 *
 * Pre-cycle-7 the message-store (`agsChatMessages` in MAIN DB) and
 * trace (`agsToolCallTraces` in ASDB) write paths were silently
 * non-atomic — a successful message persistence + failed trace
 * write left the operator UI with a tool result but no
 * per-validation-gate breadcrumbs. Two of the four cycle-7 audit
 * lanes flagged this independently; consolidated into C2-c7.
 *
 * Closure (PR-A merged at #357) fixed the related drizzle-partial-
 * update race (H4-c7 + M3-c7). PR-B (this PR) documents:
 *   1. The persistence asymmetry on `persistRuntimeToolCallTrace`
 *      (mirrors L4-c5 trace-vs-audit shape one layer up — message
 *      is canonical, trace is best-effort, ASDB and MAIN can't
 *      share a Postgres transaction)
 *   2. The runtimeTraceId / messageId nullability contract on
 *      `buildToolCallTraceRow` (operator UI must tolerate null and
 *      render a "trace unavailable" placeholder)
 *
 * Lockstep guards future PRs from:
 *   - Promoting trace-write to fatal without updating the doc
 *   - Removing the L4-c5 cross-reference
 *   - "Fixing" the nullable FK shape with a non-null constraint
 *     (would crash the early-rejection / system-dispatch paths)
 *
 * Mirrors the cycle-4/5/6 doc-block + lockstep pattern.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const RUNTIME_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/proposed-tool-call-runtime.ts",
);
const TRACE_WRITER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/trace-writer.ts",
);

describe("C2-c7 — persistRuntimeToolCallTrace doc-block on message-vs-trace asymmetry", () => {
  const src = readFileSync(RUNTIME_PATH, "utf8");

  it("source carries the C2-c7 closure marker", () => {
    expect(
      src,
      "C2-c7 violated: proposed-tool-call-runtime.ts must carry the " +
        "`C2-c7` closure marker so a future audit can trace the " +
        "message-vs-trace asymmetry doc back to its origin item.",
    ).toMatch(/C2-c7\b/);
  });

  it("doc-block names message-store as canonical and trace as best-effort", () => {
    // The asymmetry framing is load-bearing — without it, future
    // contributors may try to "fix the inconsistency" by symmetrizing.
    expect(
      src,
      "C2-c7 violated: the doc-block must name message persistence " +
        "as canonical AND trace persistence as best-effort so the " +
        "asymmetry intent survives future refactors.",
    ).toMatch(/Message persistence is canonical[\s\S]{0,800}Trace persistence is best-effort/);
  });

  it("doc-block explains why ASDB + MAIN DB can't share a Postgres transaction", () => {
    // The "why not transactional" rationale is the structural
    // constraint. A future contributor proposing a 2PC fix needs to
    // see this caveat first.
    expect(
      src,
      "C2-c7 violated: the doc-block must explain the cross-DB " +
        "transaction impossibility (Phase 12.5 split) so a future PR " +
        "doesn't propose a 2PC 'fix'.",
    ).toMatch(/SEPARATE[\s\S]{0,200}PostgreSQL databases|cross-DB|cannot span/i);
  });

  it("doc-block describes the resulting failure mode + UI null-handling expectation", () => {
    // The operator-UI implications are the load-bearing detail —
    // without them, the UI team may not know to render the
    // "trace unavailable" placeholder.
    expect(
      src,
      "C2-c7 violated: the doc-block must describe the failure mode " +
        "(message persists + trace missing) and call out that " +
        "operator UI MUST tolerate null trace rows.",
    ).toMatch(/trace unavailable|operator UI MUST tolerate/i);
  });

  it("doc-block cross-references L4-c5 (the prior layer's asymmetry)", () => {
    // The cross-reference is intentional — C2-c7 mirrors L4-c5 one
    // layer up. Reading the C2-c7 block should lead the reader to
    // the L4-c5 block for the deeper canonical-vs-observability
    // pattern.
    expect(
      src,
      "C2-c7 violated: the doc-block should cross-reference L4-c5 " +
        "since C2-c7 mirrors the same canonical-vs-observability " +
        "pattern one layer up.",
    ).toMatch(/L4-c5/);
  });

  it("doc-block names the audit-row forensic recovery path", () => {
    // If trace fails but audit succeeds, forensics still works via
    // agsRuntimePolicyEvents + the M4-c5 approvalRequestId cross-link.
    // Future PRs that drop this recovery story leave operators
    // believing "trace failure = forensics failure" (untrue).
    expect(
      src,
      "C2-c7 violated: the doc-block must name the audit-row " +
        "forensic recovery path so operators know trace-write " +
        "failures don't erode the audit ledger.",
    ).toMatch(/agsRuntimePolicyEvents[\s\S]{0,400}M4-c5/);
  });
});

describe("C2-c7 — buildToolCallTraceRow nullability contract on runtimeTraceId / messageId", () => {
  const src = readFileSync(TRACE_WRITER_PATH, "utf8");

  it("source carries the C2-c7 closure marker", () => {
    expect(
      src,
      "C2-c7 violated: trace-writer.ts must carry the `C2-c7` " +
        "closure marker on the buildToolCallTraceRow doc-block.",
    ).toMatch(/C2-c7\b/);
  });

  it("doc-block explains runtimeTraceId nullable case (early-rejection + system-dispatch)", () => {
    // Catches a future PR that adds .notNull() to the column
    // without realizing it crashes early-rejection paths.
    expect(
      src,
      "C2-c7 violated: the doc-block must explain that runtimeTraceId " +
        "is null on early-rejection paths (validator rejection before " +
        "RAC trace assignment) and direct/system dispatches.",
    ).toMatch(/runtimeTraceId[\s\S]{0,400}early-rejection|early-rejection[\s\S]{0,200}runtimeTraceId/i);
  });

  it("doc-block explains messageId nullable case (non-chat dispatch sources)", () => {
    expect(
      src,
      "C2-c7 violated: the doc-block must explain that messageId is " +
        "null on simulation / manual_test / subagent dispatches that " +
        "don't originate from a chat message.",
    ).toMatch(/messageId[\s\S]{0,400}(?:simulation|manual_test|chat message)/i);
  });

  it("doc-block notes the cross-DB FK impossibility (mirrors C2-c7 main doc)", () => {
    // The reason there's no FK constraint at the DB layer — runtimeTraceId
    // targets ASDB while messageId targets MAIN. Future PRs that "tighten"
    // by adding FKs would fail at startup (cross-DB FKs aren't supported).
    expect(
      src,
      "C2-c7 violated: the doc-block must note that runtimeTraceId / " +
        "messageId have no FK constraint partly because they target " +
        "different databases (ASDB vs MAIN).",
    ).toMatch(/foreign-key|FK[\s\S]{0,300}(?:ASDB[\s\S]{0,200}MAIN|cross-DB)/i);
  });

  it("doc-block points the reader at the persistence-side asymmetry doc", () => {
    // Cross-link so a reader landing on either doc-block can find
    // the other.
    expect(
      src,
      "C2-c7 violated: the trace-writer.ts doc-block must point at " +
        "persistRuntimeToolCallTrace's matching asymmetry doc so " +
        "the two doc-blocks form a navigable pair.",
    ).toMatch(/persistRuntimeToolCallTrace|proposed-tool-call-runtime/);
  });
});
