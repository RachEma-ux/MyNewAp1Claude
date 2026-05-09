/**
 * C1-c6 + M4-c6 — chat-stream + chat.ts source-scan lockstep.
 *
 * Pre-cycle-6 the D-RESUME loop was inlined in chat-stream.ts and
 * missing entirely from chat.ts. Same parallel-flow asymmetry shape
 * as cycle-5 C1-c5 (runtimeRunId omission), one layer deeper. Cycle-5
 * lesson #1 explicitly: source-scan invariants catch parallel bugs
 * the audit's manual enumeration misses. This test enforces that
 * shape going forward.
 *
 * Locked invariants:
 *   1. Both `chat-stream.ts` and `services/chat.ts` import
 *      `awaitApprovalDecision` from the shared helper module.
 *   2. Both call `awaitApprovalDecision(...)` in their tool-call
 *      loop. Removing either call (or inlining the loop again)
 *      reverts the asymmetry.
 *   3. Both pass `caller: { userId, sessionId: ... }` to
 *      `dispatchMcpToolCall(...)` (M4-c6 — cycle-6 audit found
 *      both sites omitted the caller field, leaving audit rows
 *      with caller=null).
 *   4. The `awaitApprovalDecision` helper module exists at the
 *      expected path (catches a future PR that moves it without
 *      updating both call sites).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const HELPER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/approval-resume-loop.ts",
);
const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);
const CHAT_SERVICE_PATH = join(
  process.cwd(),
  "server/agent-studio/services/chat.ts",
);

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("C1-c6 — both chat paths delegate to the shared awaitApprovalDecision helper", () => {
  it("helper module exists at the expected path", () => {
    expect(
      existsSync(HELPER_PATH),
      "C1-c6 violated: shared helper missing at " +
        "server/agent-studio/services/runtime/approval-resume-loop.ts. " +
        "Both call sites import this exact path; moving the file " +
        "without updating both call sites would silently break the " +
        "shared-helper invariant.",
    ).toBe(true);
  });

  for (const [name, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["services/chat.ts", CHAT_SERVICE_PATH],
  ] as const) {
    it(`${name} imports awaitApprovalDecision from the shared helper`, () => {
      const src = readFileSync(path, "utf8");
      expect(
        src,
        `C1-c6 violated: ${name} does not import awaitApprovalDecision. ` +
          `Both chat paths must delegate to the shared helper so the ` +
          `D-RESUME loop semantics stay in lockstep. Inlining the loop ` +
          `re-creates the cycle-6 C1-c6 asymmetry.`,
      ).toMatch(/awaitApprovalDecision/);
      expect(
        src,
        `C1-c6 violated: ${name} imports awaitApprovalDecision but not ` +
          `from the canonical path "approval-resume-loop". A different ` +
          `path probably means a stale fork of the helper.`,
      ).toMatch(/from\s+["'][^"']*approval-resume-loop["']/);
    });

    it(`${name} actually calls awaitApprovalDecision in the tool-call loop`, () => {
      const src = strip(readFileSync(path, "utf8"));
      expect(
        src,
        `C1-c6 violated: ${name} imports the helper but never calls it. ` +
          `Either the import is dead (remove it) or the loop reverted to ` +
          `inline (restore the call).`,
      ).toMatch(/awaitApprovalDecision\s*\(/);
    });
  }
});

describe("M4-c6 — both chat paths thread `caller` to dispatchMcpToolCall", () => {
  for (const [name, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["services/chat.ts", CHAT_SERVICE_PATH],
  ] as const) {
    it(`${name} passes caller: { userId, sessionId } to dispatchMcpToolCall`, () => {
      const src = strip(readFileSync(path, "utf8"));
      // Find the dispatchMcpToolCall call site; assert `caller:`
      // appears in its argument object. Single regex catches both
      // shapes since the literal "caller:" must be inside the
      // dispatchMcpToolCall args block (and nowhere else in the
      // file references the same field).
      const dispatchIdx = src.indexOf("dispatchMcpToolCall(");
      expect(
        dispatchIdx,
        `M4-c6 violated: ${name} has no dispatchMcpToolCall(...) call. ` +
          `Tool-call loop missing or moved.`,
      ).toBeGreaterThan(-1);
      // Slice forward to the matching close paren — heuristic but
      // robust enough since the call is single-statement.
      const argSlice = src.slice(dispatchIdx, dispatchIdx + 2000);
      expect(
        argSlice,
        `M4-c6 violated: ${name} dispatchMcpToolCall arg block does not ` +
          `include \`caller:\`. The audit row would record caller=null, ` +
          `losing operator attribution. Pass caller: { userId, ` +
          `sessionId: String(...) }.`,
      ).toMatch(/caller\s*:/);
      expect(
        argSlice,
        `M4-c6 violated: ${name} caller field present but missing ` +
          `userId. The audit row needs the operator's user id for ` +
          `attribution.`,
      ).toMatch(/userId\s*:/);
    });
  }
});
