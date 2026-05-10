/**
 * M8-c8 (cycle-8 audit `/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`
 * §M8-c8) — CAG event-log write failures get a durable audit fallback.
 *
 * Pre-cycle-8 every `appendPackEvent(...).catch(console.warn)` site in
 * `cag/resolver.ts` dropped the event row from the audit trail and left
 * only a stdout line. Operators chasing "why did this CAG validation
 * fire" had to grep stdout — a process-local signal that doesn't
 * survive container restart and isn't queryable from the audit ledger.
 *
 * Cycle-8 closure mirrors cycle-7 H9-c7's pattern: when the primary
 * audit write fails, the resolver writes a structured row to
 * `agsRuntimePolicyEvents` with `policyKey="cag_event_persistence_failed"`
 * (when `runtimeRunId` is available). When the runId is absent OR the
 * fallback row write itself fails, the helper falls back to a
 * structured-JSON stdout line so operators can still grep + parse.
 *
 * The runtimeRunId is plumbed end-to-end:
 *   chat-stream.ts / chat.ts:  sessionId
 *      → buildRuntimeSystemPrompt (rac-orchestrator.ts):  runtimeRunId
 *      → resolveAndAssembleContext (rac-orchestrator.ts): runtimeRunId
 *      → resolveCagPack (cag/resolver.ts):                runtimeRunId
 *      → recordCagEventFallback helper (uses it for audit-row write)
 *
 * Pinned invariants (lockstep):
 *   1. cag/resolver.ts has the `recordCagEventFallback` helper with
 *      the policyKey="cag_event_persistence_failed" discriminator
 *      (operator query target).
 *   2. cag/resolver.ts uses `recordCagEventFallback` (not inline
 *      console.warn) at all THREE event-log catch sites:
 *         - pack_validation_failed
 *         - pack_marked_stale
 *         - pack_used
 *   3. ResolveCagInput exposes `runtimeRunId?: number | null`.
 *   4. ResolveContextInput (rac-orchestrator) exposes runtimeRunId
 *      and threads it into resolveCagPack.
 *   5. chat-stream.ts + chat.ts both pass `runtimeRunId: sessionId`
 *      to buildRuntimeSystemPrompt (cross-flow lockstep — cycle-7
 *      H8-c7 / H1-c8 / H5-c8 / M6-c8 idiom).
 *   6. M8-c8 closure marker on the resolver.
 *
 * No behavioral test for the audit-row write itself: that requires a
 * live ASDB. The lockstep tests above pin the contract; the row write
 * is exercised by the existing CAG integration suite when runId is
 * threaded through.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const RESOLVER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/cag/resolver.ts",
);
const ORCHESTRATOR_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/rac-orchestrator.ts",
);
const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);
const CHAT_TS_PATH = join(
  process.cwd(),
  "server/agent-studio/services/chat.ts",
);

const resolverSrc = readFileSync(RESOLVER_PATH, "utf8");
const orchestratorSrc = readFileSync(ORCHESTRATOR_PATH, "utf8");
const chatStreamSrc = readFileSync(CHAT_STREAM_PATH, "utf8");
const chatTsSrc = readFileSync(CHAT_TS_PATH, "utf8");

describe("M8-c8 — recordCagEventFallback helper exists with policyKey discriminator", () => {
  it("declares recordCagEventFallback as an async function", () => {
    expect(
      resolverSrc,
      "M8-c8: the helper centralizes the audit-fallback pattern. " +
        "Without it, the three .catch sites would re-implement the " +
        "fallback inline and drift apart.",
    ).toMatch(/async\s+function\s+recordCagEventFallback\s*\(/);
  });

  it("uses policyKey='cag_event_persistence_failed' as the operator query target", () => {
    // The closure shape names this discriminator so operators can
    // run `WHERE policy_key = 'cag_event_persistence_failed'` against
    // agsRuntimePolicyEvents. Renaming the policyKey breaks operator
    // dashboards / runbooks.
    expect(resolverSrc).toMatch(
      /policyKey:\s*["']cag_event_persistence_failed["']/,
    );
  });

  it("calls appendRuntimePolicyEvent (the durable audit ledger writer)", () => {
    // The fallback path MUST hit the policy-events table, not just
    // a different log surface.
    expect(resolverSrc).toMatch(/appendRuntimePolicyEvent\s*\(/);
  });

  it("falls back to structured stdout when audit-row write also fails", () => {
    // Defense in depth: the audit table can fail too (ASDB outage).
    // A `JSON.stringify(payload)` call inside the helper proves the
    // last-resort stdout breadcrumb is structured (operator-greppable
    // + parseable).
    expect(
      resolverSrc,
      "M8-c8: when the audit-row write fails, stdout MUST carry a " +
        "structured (JSON) breadcrumb so operators can still " +
        "reconstruct what was supposed to be persisted.",
    ).toMatch(/JSON\.stringify\s*\(\s*payload\s*\)/);
  });
});

describe("M8-c8 — all three resolver catch sites use the helper", () => {
  // Negative assertion: the legacy inline `console.warn(\`[ags-cag] ... event log failed`)`
  // pattern is GONE from the resolver. If a future PR re-introduces it
  // (or adds a new catch site without the helper), this test fails.
  it("legacy inline 'pack event log failed' console.warn shape is removed", () => {
    // Strip comments so doc-block references don't trigger the negative.
    const stripped = resolverSrc
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(
      stripped,
      "M8-c8: the legacy `console.warn(\\`[ags-cag] ... event log failed\\`)` " +
        "pattern is gone. Use recordCagEventFallback for new catch sites.",
    ).not.toMatch(/console\.warn\s*\(\s*`\[ags-cag\] [^`]*event log failed/);
  });

  it("recordCagEventFallback is invoked for pack_validation_failed", () => {
    const re =
      /recordCagEventFallback\s*\([\s\S]*?eventType:\s*["']pack_validation_failed["']/;
    expect(resolverSrc).toMatch(re);
  });

  it("recordCagEventFallback is invoked for pack_marked_stale", () => {
    const re =
      /recordCagEventFallback\s*\([\s\S]*?eventType:\s*["']pack_marked_stale["']/;
    expect(resolverSrc).toMatch(re);
  });

  it("recordCagEventFallback is invoked for pack_used", () => {
    const re =
      /recordCagEventFallback\s*\([\s\S]*?eventType:\s*["']pack_used["']/;
    expect(resolverSrc).toMatch(re);
  });
});

describe("M8-c8 — runtimeRunId plumbed end-to-end", () => {
  it("ResolveCagInput exposes runtimeRunId field", () => {
    // Match the field within the ResolveCagInput interface body.
    const re =
      /interface\s+ResolveCagInput\s*\{[\s\S]*?runtimeRunId\?:\s*number\s*\|\s*null[\s\S]*?\}/;
    expect(resolverSrc).toMatch(re);
  });

  it("ResolveContextInput exposes runtimeRunId field", () => {
    const re =
      /interface\s+ResolveContextInput\s*\{[\s\S]*?runtimeRunId\?:\s*number\s*\|\s*null[\s\S]*?\}/;
    expect(orchestratorSrc).toMatch(re);
  });

  it("orchestrator threads runtimeRunId into resolveCagPack", () => {
    // The resolveCagPack call site must include runtimeRunId.
    const re =
      /resolveCagPack\s*\(\s*\{[\s\S]*?runtimeRunId:\s*input\.runtimeRunId[\s\S]*?\}\s*\)/;
    expect(orchestratorSrc).toMatch(re);
  });

  // Cross-flow lockstep — both chat flows pass runtimeRunId.
  const flows = [
    { name: "chat-stream.ts", src: chatStreamSrc, sessionVar: "sessionId" },
    { name: "chat.ts", src: chatTsSrc, sessionVar: "input.sessionId" },
  ];
  for (const { name, src, sessionVar } of flows) {
    it(`${name} passes runtimeRunId: ${sessionVar} into buildRuntimeSystemPrompt`, () => {
      // Match the buildRuntimeSystemPrompt call body containing the
      // runtimeRunId field. The session-var matcher is loose because
      // each flow names its session id slightly differently
      // (sessionId vs. input.sessionId).
      const re = new RegExp(
        `buildRuntimeSystemPrompt\\s*\\(\\s*\\{[\\s\\S]*?runtimeRunId:\\s*${sessionVar.replace(/\./g, "\\.")}`,
      );
      expect(
        src,
        `M8-c8: ${name} must pass runtimeRunId so the CAG resolver's ` +
          "event-log fallback can write a durable audit row instead of " +
          "stdout-only.",
      ).toMatch(re);
    });
  }
});

describe("M8-c8 — closure marker", () => {
  it("M8-c8 marker is present on the resolver", () => {
    expect(resolverSrc).toMatch(/M8-c8/);
  });
});
