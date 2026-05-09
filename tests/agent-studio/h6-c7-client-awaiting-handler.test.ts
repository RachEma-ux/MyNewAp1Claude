/**
 * H6-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §H6-c7) — client-side awaiting_approval handler lockstep.
 *
 * Pre-cycle-7 the AgentStudioChatWindow tool_end handler checked
 * `data.ok ? "ok" : "error"` only — no special case for the
 * AwaitingApprovalEvent variant (`{ok: false, status:
 * "awaiting_approval", approvalRequestId, timeoutSec}`). When
 * chat-stream emitted the event (added in H4-c6), the client
 * collapsed it to a tool error and rendered a red X badge instead
 * of a "pending approval" indicator.
 *
 * Post-cycle-7 the handler discriminates on `data.status ===
 * "awaiting_approval"` BEFORE the ok/error branch, captures
 * `approvalRequestId` + `timeoutSec`, and the chip renders an
 * amber Clock badge with the countdown.
 *
 * This file pins via source-scan:
 *   1. activeTools state type extended with `awaiting_approval`
 *      status + approvalRequestId + timeoutSec fields
 *   2. Handler discriminates on data.status === "awaiting_approval"
 *      BEFORE the ok/error branch (catches a future PR that
 *      reorders the if/else and re-collapses to error)
 *   3. Chip rendering covers all 4 status values
 *   4. Amber color palette (signals "operator action required"
 *      without conflating with success-green or error-red)
 *   5. Clock icon (distinct from Check/X for ok/error)
 *   6. Closure marker present
 *
 * Behavioral coverage (the chip actually renders amber when an
 * AwaitingApprovalEvent arrives) would require RTL + a fake
 * EventSource — deferred to a B-coverage UI test.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CHAT_WINDOW_PATH = join(
  process.cwd(),
  "client/src/modules/agent-studio/components/AgentStudioChatWindow.tsx",
);

describe("H6-c7 — AgentStudioChatWindow awaiting_approval handler", () => {
  const src = readFileSync(CHAT_WINDOW_PATH, "utf8");

  it("source carries the H6-c7 closure marker", () => {
    expect(
      src,
      "H6-c7 violated: AgentStudioChatWindow.tsx must carry the " +
        "`H6-c7` closure marker so a future audit can trace the " +
        "client-side handler back to its origin item.",
    ).toMatch(/H6-c7\b/);
  });

  it("activeTools state type includes awaiting_approval status", () => {
    expect(
      src,
      "H6-c7 violated: activeTools state type must include " +
        "`awaiting_approval` so the chip rendering can branch on it.",
    ).toMatch(
      /status:\s*"running"\s*\|\s*"ok"\s*\|\s*"error"\s*\|\s*"awaiting_approval"/,
    );
  });

  it("activeTools state type carries approvalRequestId + timeoutSec fields", () => {
    expect(
      src,
      "H6-c7 violated: activeTools entries must carry " +
        "approvalRequestId + timeoutSec so the chip can render " +
        "operator-facing context (request id click-through, countdown).",
    ).toMatch(/approvalRequestId\?:\s*number;\s*timeoutSec\?:\s*number/);
  });
});

describe("H6-c7 — handler discrimination order", () => {
  const src = readFileSync(CHAT_WINDOW_PATH, "utf8");

  it("handler checks data.status === 'awaiting_approval' BEFORE the ok/error branch", () => {
    // The load-bearing assertion. A future PR that "simplified" by
    // reordering the if/else (status check after ok/error) would
    // re-collapse AwaitingApprovalEvent to a generic tool error.
    // Source-scan that the awaiting_approval check appears LEXICALLY
    // before the data.ok branch within the tool_end handler block.
    const handlerStart = src.indexOf('data.type === "tool_end"');
    expect(handlerStart).toBeGreaterThan(0);
    const handlerEnd = src.indexOf('data.type === "done"');
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    const handlerBody = src.slice(handlerStart, handlerEnd);

    const awaitingIdx = handlerBody.indexOf(
      'data.status === "awaiting_approval"',
    );
    const okErrorIdx = handlerBody.indexOf("data.ok ?");
    expect(awaitingIdx, "expected awaiting_approval discrimination").toBeGreaterThan(0);
    expect(okErrorIdx, "expected data.ok branch").toBeGreaterThan(0);
    expect(
      awaitingIdx,
      "H6-c7 violated: data.status === 'awaiting_approval' check MUST " +
        "appear BEFORE the data.ok branch in the tool_end handler. " +
        "Reversing the order re-collapses AwaitingApprovalEvent into " +
        "a generic tool error.",
    ).toBeLessThan(okErrorIdx);
  });

  it("handler captures approvalRequestId + timeoutSec from data into the chip state", () => {
    expect(
      src,
      "H6-c7 violated: when data.status is awaiting_approval, the " +
        "handler must capture approvalRequestId + timeoutSec from " +
        "the SSE event payload into the chip state.",
    ).toMatch(
      /status:\s*"awaiting_approval"[\s\S]{0,200}approvalRequestId:\s*data\.approvalRequestId[\s\S]{0,200}timeoutSec:\s*data\.timeoutSec/,
    );
  });

  it("doc-block above the handler explains the discrimination invariant", () => {
    // Future readers see the comment + understand why the order is
    // load-bearing. A future PR that rewrites the handler shouldn't
    // accidentally drop the discrimination.
    expect(
      src,
      "H6-c7 violated: the doc-block on the tool_end handler must " +
        "explain why awaiting_approval discrimination MUST come " +
        "BEFORE the ok/error branch (otherwise it collapses to error).",
    ).toMatch(/H6-c7[\s\S]{0,800}BEFORE/);
  });
});

describe("H6-c7 — chip rendering covers awaiting_approval", () => {
  const src = readFileSync(CHAT_WINDOW_PATH, "utf8");

  it("chip className branches on awaiting_approval (amber palette)", () => {
    // Amber signals "operator action required" — distinct from
    // success-green and error-red. A future PR that reuses the error
    // palette for awaiting would conflate the operator-action UX.
    expect(
      src,
      "H6-c7 violated: chip rendering must use a distinct amber " +
        "palette for awaiting_approval — reusing the error red would " +
        "conflate \"operator must act\" with \"the call failed\".",
    ).toMatch(/awaiting_approval[\s\S]{0,400}amber/);
  });

  it("chip icon for awaiting_approval is Clock (distinct from Check / X)", () => {
    // The icon is the at-a-glance signal. Clock = pending; Check =
    // ok; X = error. Reusing Check or X would defeat the purpose.
    expect(
      src,
      "H6-c7 violated: chip icon for awaiting_approval must be Clock " +
        "(distinct from Check / X). Reusing either icon defeats the " +
        "at-a-glance status signal.",
    ).toMatch(/awaiting_approval"\s*\?\s*\([\s\S]{0,50}<Clock\b/);
  });

  it("Clock icon imported from lucide-react", () => {
    expect(
      src,
      "H6-c7 violated: Clock icon must be imported from lucide-react " +
        "for the awaiting_approval chip rendering.",
    ).toMatch(/import\s*\{[\s\S]{0,400}Clock[\s\S]{0,400}\}\s*from\s*["']lucide-react["']/);
  });

  it("chip title attribute surfaces approval request id + timeout when awaiting", () => {
    // The hover-tooltip is operator-facing context — without
    // approvalRequestId in the title, an operator triaging a
    // pending chip can't easily click through to the approval row.
    expect(
      src,
      "H6-c7 violated: chip title must surface approvalRequestId + " +
        "timeoutSec when the status is awaiting_approval — operator " +
        "triage needs the request id for click-through.",
    ).toMatch(
      /awaiting operator approval[\s\S]{0,400}approvalRequestId[\s\S]{0,400}timeoutSec/,
    );
  });

  it("chip body shows the countdown inline when awaiting", () => {
    // The countdown is the at-a-glance "how long until the dispatcher
    // gives up" signal. Without it, operators can't tell if they have
    // 5 seconds or 5 minutes to decide.
    expect(
      src,
      "H6-c7 violated: chip body must show the timeoutSec countdown " +
        "inline when the status is awaiting_approval.",
    ).toMatch(
      /awaiting_approval"\s*&&\s*t\.timeoutSec\s*!=\s*null[\s\S]{0,200}\{t\.timeoutSec\}/,
    );
  });
});
