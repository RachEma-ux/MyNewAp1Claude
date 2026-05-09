/**
 * Cross-flow C7 PR-A bundle (H5-c7 + M4-c7 + M5-c7) lockstep.
 *
 * Audit:
 *   /sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md §H5, §M4, §M5
 *
 * The chat.ts ↔ chat-stream.ts parallel-flow asymmetry is the
 * standing pattern from cycles 5 + 6. Cycle-5 fixed missing
 * runtimeRunId on chat-stream; cycle-6 fixed the entire D-RESUME
 * loop missing on chat.ts. Cycle-7 finds the OUTCOME-side
 * asymmetries: awaiting-approval signal / persistence-ordering doc /
 * outcome-test coverage.
 *
 * H5-c7 — non-streaming awaiting-approval signal:
 *   chat.ts now wires onAwaiting in awaitApprovalDecision, captures
 *   the (approvalRequestId, timeoutSec) into a closure-local, and
 *   surfaces it via SendChatMessageResult.awaitingApproval. Mirrors
 *   chat-stream.ts's SSE AwaitingApprovalEvent for the streaming
 *   path. Blocking RPC callers learn that approval is pending
 *   instead of waiting up to APPROVAL_RESUME_TIMEOUT_SEC silently.
 *
 * M4-c7 — outcome-path coverage:
 *   The audit listed event_denied / event_expired / timeout as
 *   uncovered. Pre-existing approval-resume-loop.test.ts already
 *   covers these at the helper level (tests 3-5 in that file).
 *   This file adds the higher-layer assertion: chat.ts's resume
 *   call site DOES wire onAwaiting (not just chat-stream) so all
 *   5 outcomes (recheck_permit / event_allowed_confirmed /
 *   event_denied / event_expired / timeout) flow through the
 *   awaiting-signal capture path on BOTH chats.
 *
 * M5-c7 — persistence-ordering doc-block:
 *   appendChatMessage MUST resolve BEFORE sendEvent (chat-stream)
 *   or the next loop iteration (chat.ts). Pre-cycle-7 this was
 *   undocumented — a future perf optimization could reorder for
 *   "perceived latency" and break the durability invariant. Both
 *   files now carry M5-c7 doc-blocks naming the contract.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CHAT_TS_PATH = join(
  process.cwd(),
  "server/agent-studio/services/chat.ts",
);
const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);

describe("H5-c7 — chat.ts surfaces awaitingApproval to the blocking caller", () => {
  const src = readFileSync(CHAT_TS_PATH, "utf8");

  it("source carries the H5-c7 closure marker", () => {
    expect(
      src,
      "H5-c7 violated: chat.ts must carry the `H5-c7` closure marker " +
        "so a future audit can trace the awaiting-signal back to its " +
        "origin item.",
    ).toMatch(/H5-c7\b/);
  });

  it("SendChatMessageResult declares optional awaitingApproval field", () => {
    expect(
      src,
      "H5-c7 violated: SendChatMessageResult must declare " +
        "`awaitingApproval?: { approvalRequestId: number; timeoutSec: number }` " +
        "so blocking RPC callers can render a pending-approval state.",
    ).toMatch(
      /awaitingApproval\?\:\s*\{\s*approvalRequestId:\s*number;\s*timeoutSec:\s*number\s*\}/,
    );
  });

  it("doc-block on awaitingApproval names the parallel-flow asymmetry shape", () => {
    // Cross-link to the chat-stream / cycle-5/6 pattern. Without it,
    // a future contributor may not realize this is the c7 entry of
    // the standing parallel-flow asymmetry pattern.
    expect(
      src,
      "H5-c7 violated: the awaitingApproval doc-block must name the " +
        "parallel-flow asymmetry pattern (chat-stream had the signal, " +
        "chat.ts didn't — same shape as cycle-5/6 asymmetries).",
    ).toMatch(
      /parallel-flow asymmetry|chat-stream had the signal|cycle-5\/6/i,
    );
  });

  it("loop declares `lastAwaiting` capture variable", () => {
    expect(
      src,
      "H5-c7 violated: chat.ts loop must declare a `lastAwaiting` " +
        "closure-local to capture the LAST awaiting-approval event " +
        "the turn observed.",
    ).toMatch(
      /let\s+lastAwaiting:\s*\{\s*approvalRequestId:\s*number;\s*timeoutSec:\s*number\s*\}\s*\|\s*null\s*=\s*null/,
    );
  });

  it("awaitApprovalDecision call wires onAwaiting (not omitted as pre-cycle-7)", () => {
    // The fix's load-bearing assertion. A future PR that "simplified"
    // by dropping the onAwaiting param restores the silent-block bug.
    expect(
      src,
      "H5-c7 violated: chat.ts's awaitApprovalDecision call must " +
        "wire onAwaiting (capture into lastAwaiting). Pre-cycle-7 " +
        "the comment said \"no onAwaiting\" — that comment must be " +
        "gone, replaced with the capture body.",
    ).toMatch(
      /awaitApprovalDecision\s*\([\s\S]{0,2000}onAwaiting:\s*\([^)]*\)\s*=>\s*\{[\s\S]{0,400}lastAwaiting\s*=/,
    );
  });

  it("loop result return shape includes awaitingApproval: lastAwaiting", () => {
    // Both return paths (success + max-turns-hit) must surface the
    // capture. Catches a future PR that adds a third return path
    // without threading the awaiting state.
    const matches = src.match(/awaitingApproval:\s*lastAwaiting/g) ?? [];
    expect(
      matches.length,
      `H5-c7 violated: chat.ts must surface awaitingApproval: lastAwaiting ` +
        `in BOTH the success return AND the max-turns-hit return. ` +
        `Found ${matches.length} occurrences.`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("sendChatMessageViaBinding propagates loopResult.awaitingApproval to result", () => {
    // The outer-layer plumbing. Without this, the inner loop captures
    // but the outer caller never sees the field.
    expect(
      src,
      "H5-c7 violated: sendChatMessageViaBinding (or the wrapping " +
        "layer that calls runChatWithToolsViaBinding) must propagate " +
        "`loopResult.awaitingApproval` into the SendChatMessageResult.",
    ).toMatch(
      /awaitingApproval:\s*loopResult\.awaitingApproval\s*\?\?\s*undefined/,
    );
  });

  it("chat-stream's onAwaiting + chat.ts's onAwaiting use the SAME shape (parallel-flow lockstep)", () => {
    // Cross-flow source-scan: both call sites construct
    // `{approvalRequestId, timeoutSec}` from the (rid, tms) callback
    // args. Catches drift where one path captures different fields
    // than the other.
    const streamSrc = readFileSync(CHAT_STREAM_PATH, "utf8");
    expect(streamSrc).toMatch(
      /onAwaiting:\s*\(rid,\s*tms\)\s*=>\s*\{[\s\S]{0,400}approvalRequestId:\s*rid[\s\S]{0,200}timeoutSec:\s*Math\.floor\(tms\s*\/\s*1000\)/,
    );
    expect(src).toMatch(
      /onAwaiting:\s*\(rid,\s*tms\)\s*=>\s*\{[\s\S]{0,400}approvalRequestId:\s*rid[\s\S]{0,200}timeoutSec:\s*Math\.floor\(tms\s*\/\s*1000\)/,
    );
  });
});

describe("M5-c7 — persistence-ordering doc-block (append-before-send/proceed invariant)", () => {
  it("chat-stream.ts carries the M5-c7 marker on the persist-then-emit pair", () => {
    const src = readFileSync(CHAT_STREAM_PATH, "utf8");
    expect(
      src,
      "M5-c7 violated: chat-stream.ts must carry the `M5-c7` marker " +
        "above the appendChatMessage + sendEvent pair so future readers " +
        "know the ordering is load-bearing.",
    ).toMatch(/M5-c7\b/);
  });

  it("chat-stream.ts doc-block names the durability invariant", () => {
    const src = readFileSync(CHAT_STREAM_PATH, "utf8");
    expect(
      src,
      "M5-c7 violated: chat-stream.ts doc-block must name the " +
        "durability invariant (SSE client never sees a result that " +
        "isn't yet durable in the message store).",
    ).toMatch(/durab[il]/i);
  });

  it("chat.ts carries the M5-c7 marker on the persist-then-loop pair", () => {
    const src = readFileSync(CHAT_TS_PATH, "utf8");
    expect(
      src,
      "M5-c7 violated: chat.ts must carry the `M5-c7` marker above " +
        "the appendChatMessage call so future readers know the " +
        "ordering vs the next loop iteration is load-bearing.",
    ).toMatch(/M5-c7\b/);
  });

  it("chat.ts doc-block names the next-iteration history-rebuild concern", () => {
    const src = readFileSync(CHAT_TS_PATH, "utf8");
    expect(
      src,
      "M5-c7 violated: chat.ts doc-block must explain why ordering " +
        "matters here — the next loop iteration rebuilds the LLM " +
        "history from the message store.",
    ).toMatch(/rebuilds the LLM history|history from the message store/i);
  });
});

describe("M4-c7 — outcome-path coverage parity (chat.ts wires onAwaiting like chat-stream)", () => {
  // Pre-existing approval-resume-loop.test.ts covers the 5 outcomes
  // at the helper level (recheck_permit / event_allowed_confirmed /
  // event_denied / event_expired / timeout). The audit's gap was
  // really "chat.ts doesn't even GET the awaiting signal" — now
  // closed by H5-c7. This block asserts the parity contract: both
  // chat-stream.ts AND chat.ts wire onAwaiting, so any of the 5
  // outcome paths produces a captured awaiting-signal on EITHER
  // surface.

  it("chat-stream.ts wires onAwaiting (existing — guards regression)", () => {
    const src = readFileSync(CHAT_STREAM_PATH, "utf8");
    expect(src).toMatch(/onAwaiting:\s*\([^)]*\)\s*=>\s*\{/);
  });

  it("chat.ts wires onAwaiting (H5-c7 add — closes parity)", () => {
    const src = readFileSync(CHAT_TS_PATH, "utf8");
    expect(src).toMatch(/onAwaiting:\s*\([^)]*\)\s*=>\s*\{/);
  });

  it("the pre-cycle-7 \"no onAwaiting\" comment is gone from chat.ts", () => {
    // Catches a future PR that re-introduces the silent-block path
    // (e.g., reverts H5-c7 by removing the onAwaiting wiring + adding
    // back the explanatory comment). The comment WAS the
    // documentation of the bug; its disappearance signals the fix.
    const src = readFileSync(CHAT_TS_PATH, "utf8");
    expect(
      src,
      "M4-c7 violated: the pre-cycle-7 comment claiming \"no onAwaiting\" " +
        "must be removed from chat.ts now that H5-c7 wires the callback. " +
        "Leaving it in is misleading — it documents a bug that no " +
        "longer exists.",
    ).not.toMatch(/Non-streaming path:\s*no SSE event surface,\s*no onAwaiting\./);
  });
});
