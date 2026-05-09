/**
 * L4-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md`
 * §L4-c5) — trace-vs-audit asymmetry documentation lockstep.
 *
 * Pre-cycle-5 the runtime trace writer was best-effort (catch +
 * console.warn) while the dispatcher's audit writer was fatal
 * (re-throw). The asymmetry was correct in spirit (audit must not
 * fail; trace can degrade) but undocumented — a future refactor
 * could "symmetrize" by flipping trace to fatal (breaking the chat
 * loop on an observability outage) or flipping audit to best-effort
 * (silently dropping security-ledger rows).
 *
 * Post-cycle-5 (this PR — doc-only): the `persistRuntimeToolCallTrace`
 * function-level doc-block enumerates the asymmetry + records why
 * each ledger has its chosen failure mode + names the rejected
 * symmetrize options.
 *
 * This test locks the doc — a future PR that strips the asymmetry
 * doc, or that flips one of the failure modes without updating the
 * doc here, fails the lockstep.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const RUNTIME_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/proposed-tool-call-runtime.ts",
);
const DISPATCHER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/mcp/dispatcher.ts",
);

describe("L4-c5 — proposed-tool-call-runtime.ts documents the trace-vs-audit asymmetry", () => {
  const src = readFileSync(RUNTIME_PATH, "utf8");

  it("doc-block names the L4-c5 closure marker", () => {
    expect(
      src,
      "L4-c5 violated: persistRuntimeToolCallTrace doc-block must " +
        "carry the `L4-c5` closure marker so a future audit (cycle-6+) " +
        "can trace the asymmetry rationale back to its origin item.",
    ).toMatch(/L4-c5\b/);
  });

  it("doc-block names the trace path as best-effort", () => {
    expect(
      src,
      "L4-c5 violated: doc-block must explicitly mark the trace " +
        "writer as `best-effort` (or `BEST-EFFORT`). A future reader " +
        "must be able to derive the failure-mode contract from the " +
        "doc, not from the source.",
    ).toMatch(/best-?effort/i);
  });

  it("doc-block names the audit path as fatal (re-throws)", () => {
    expect(
      src,
      "L4-c5 violated: doc-block must explicitly contrast against " +
        "the audit writer's `fatal` (re-throw) failure mode. Without " +
        "the contrast a future PR could legitimately ask 'why is one " +
        "best-effort and the other not?' and silently flip one to " +
        "match the other.",
    ).toMatch(/fatal|re-?throw/i);
  });

  it("doc-block records WHY audit must not fail (compliance / canonical)", () => {
    // The justification is "audit is the canonical security ledger;
    // silent dispatch with no audit row is the worst possible outcome".
    // The exact wording isn't pinned but at least one of these
    // load-bearing words must appear so the doc explains the intent.
    expect(
      src,
      "L4-c5 violated: doc-block must record WHY the audit ledger " +
        "is fatal-on-failure — at minimum naming compliance, " +
        "forensics, canonical, or security-ledger semantics. Without " +
        "the rationale, a future refactor could 'fix' the inconsistency " +
        "by flipping audit to best-effort.",
    ).toMatch(/compliance|forensics|canonical|security ledger/i);
  });

  it("doc-block records WHY trace can degrade (operator-visible cache)", () => {
    expect(
      src,
      "L4-c5 violated: doc-block must record WHY the trace ledger is " +
        "best-effort — at minimum naming `cache`, `observability`, " +
        "`operator-visible`, or `convenience` semantics. Without the " +
        "rationale, a future refactor could 'fix' the inconsistency " +
        "by flipping trace to fatal (breaking the chat loop on a " +
        "non-critical persistence outage).",
    ).toMatch(/cache|observability|operator-visible|convenience/i);
  });

  it("doc-block enumerates the rejected symmetrize options", () => {
    // Both alternatives must be named: option A (both fatal) and
    // option B (both best-effort), with rationale for rejecting each.
    expect(
      src,
      "L4-c5 violated: doc-block must enumerate the rejected " +
        "symmetrize options (A: both fatal, B: both best-effort). " +
        "Naming the alternatives prevents a future refactor from " +
        "re-litigating the design space without recognizing the " +
        "trade-offs.",
    ).toMatch(/option A.*option B/is);
  });

  it("dispatcher.ts writeAuditRow still re-throws (lockstep with trace doc)", () => {
    // The trace doc claims the dispatcher's audit writer is fatal.
    // Lock that claim against the actual dispatcher source so the
    // pair stays consistent.
    const dispatcherSrc = readFileSync(DISPATCHER_PATH, "utf8");
    // writeAuditRow's catch branch must contain a `throw` (re-throw).
    const writeAuditRow =
      dispatcherSrc.split("async function writeAuditRow")[1] ?? "";
    // Restrict to the function body — first ~40 lines after the
    // signature is enough; the throw must appear before the next
    // function declaration.
    const body = writeAuditRow
      .split(/\n(async function|function|export )/)[0]
      ?? "";
    expect(
      body,
      "L4-c5 violated: dispatcher.ts `writeAuditRow` no longer " +
        "re-throws on audit-write failure. The trace-vs-audit asymmetry " +
        "documented in proposed-tool-call-runtime.ts assumes audit is " +
        "fatal — flipping audit to best-effort without updating the " +
        "doc breaks the documented invariant.",
    ).toMatch(/throw\s+new\s+Error/);
  });
});
