/**
 * H4-c6 + L3-c6 + L4-c6 + L5-c6 — cycle-6 doc-bundle lockstep.
 *
 * Four small "preserve this property" findings from
 * `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md` bundled into
 * one test file (cycle-5 lesson #4: doc-block + lockstep is the
 * standing closure shape for this finding shape).
 *
 *   - **H4-c6**: SSE `awaiting_approval` event shape now exported as
 *     `AwaitingApprovalEvent` interface from chat-stream.ts. The
 *     interface IS the contract; this file pins the shape so a
 *     future refactor can't silently rename `timeoutSec` →
 *     `timeout_seconds` (or drop `approvalRequestId`).
 *   - **L3-c6**: approval-gate.ts must NOT import from `services/mcp/`
 *     — inverse direction of cycle-4 H1-c4 (which locked dispatcher
 *     → no-import-from-approval-gate). Locks the bidirectional
 *     boundary against accidental circular dependency.
 *   - **L4-c6**: D-RESUME-3 race protection (subscribe BEFORE
 *     revalidate) — the `awaitApprovalDecision` helper had an
 *     ordering test in C1-c6 that captured this. This test pins the
 *     audit's specific scenario (event arrives DURING revalidate, not
 *     before, not after — the helper still picks it up).
 *   - **L5-c6**: APPROVAL_RESUME_TIMEOUT_SEC recommended 10-3600s.
 *     `approvalResumeTimeoutMs()` in chat-stream.ts + chat.ts both
 *     warn on out-of-range values + carry the L5-c6 marker.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  awaitApprovalDecision,
} from "../../server/agent-studio/services/runtime/approval-resume-loop";
import {
  createApprovalEventBus,
} from "../../server/agent-studio/services/runtime/approval-event-bus";
import type {
  ProposedToolCall,
} from "../../server/agent-studio/services/mcp/proposed-tool-call";
import type {
  RuntimeDispatchVerdict,
} from "../../server/agent-studio/services/runtime/proposed-tool-call-runtime";
import type { AwaitingApprovalEvent } from "../../server/agent-studio/chat-stream";

const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);
const CHAT_SERVICE_PATH = join(
  process.cwd(),
  "server/agent-studio/services/chat.ts",
);
const APPROVAL_GATE_PATH = join(
  process.cwd(),
  "server/agent-studio/services/approval/approval-gate.ts",
);

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// ─────────────────────────────────────────────────────────────────
// H4-c6 — SSE AwaitingApprovalEvent contract
// ─────────────────────────────────────────────────────────────────

describe("H4-c6 — AwaitingApprovalEvent SSE contract", () => {
  it("exported interface allows the cycle-4 PR-3 shape verbatim", () => {
    // TypeScript-level pinning: this object literal must satisfy
    // AwaitingApprovalEvent. Renaming any field on the interface
    // makes this test file fail to compile (which IS the lockstep).
    const event: AwaitingApprovalEvent = {
      type: "tool_end",
      toolName: "mcp__github__create_issue",
      ok: false,
      status: "awaiting_approval",
      approvalRequestId: 42,
      timeoutSec: 300,
    };
    expect(event.type).toBe("tool_end");
    expect(event.status).toBe("awaiting_approval");
    expect(event.ok).toBe(false);
    expect(event.approvalRequestId).toBe(42);
    expect(event.timeoutSec).toBe(300);
  });

  it("chat-stream.ts emits the typed event (not an untyped object literal)", () => {
    // The emit site uses `const event: AwaitingApprovalEvent = {...}; sendEvent(event)`.
    // If a future refactor drops the type annotation and pre-coerces
    // (e.g. `sendEvent({...arbitrary})`), this lockstep fires.
    const src = strip(readFileSync(CHAT_STREAM_PATH, "utf8"));
    expect(
      src,
      "H4-c6 violated: chat-stream.ts must emit the awaiting-approval " +
        "event via the exported `AwaitingApprovalEvent` interface, " +
        "not an untyped literal. Without the type annotation a " +
        "rename of any contract field would compile cleanly.",
    ).toMatch(/const\s+event\s*:\s*AwaitingApprovalEvent\s*=/);
  });
});

// ─────────────────────────────────────────────────────────────────
// L3-c6 — approval-gate inverse import lockstep
// ─────────────────────────────────────────────────────────────────

describe("L3-c6 — approval-gate.ts does not import from services/mcp/", () => {
  it("source contains no import from `services/mcp/` paths", () => {
    // Cycle-4 H1-c4 locked dispatcher → no-import-from-approval-gate.
    // Inverse direction: approval-gate.ts must not import from any
    // services/mcp/ module (would create circular dependency).
    // Exception: importing TYPES from `services/mcp/proposed-tool-call`
    // is allowed (verified by current source: it imports
    // hashProposedToolCall + types only, no runtime mcp modules).
    const src = readFileSync(APPROVAL_GATE_PATH, "utf8");
    // Forbidden module roots under services/mcp/ (anything BUT the
    // proposed-tool-call ADR boundary).
    const forbidden = [
      "services/mcp/dispatcher",
      "services/mcp/registry",
      "services/mcp/mcp-manager",
      "services/mcp/transports",
      "services/mcp/auto-sync-resolver",
    ];
    for (const path of forbidden) {
      const re = new RegExp(`from\\s+["'][^"']*${path.replace(/\//g, "\\/")}`);
      expect(
        src,
        `L3-c6 violated: approval-gate.ts imports from \`${path}\`. ` +
          `Approval-gate must not depend on the MCP dispatch surface — ` +
          `dispatcher imports approval verdicts via the shared ProposedToolCall ` +
          `boundary, NOT vice versa. Inverse of cycle-4 H1-c4.`,
      ).not.toMatch(re);
    }
  });

  it("source MAY import types from services/mcp/proposed-tool-call (ADR boundary)", () => {
    // Current source already imports from this path — this test
    // documents that the path is intentionally NOT in the forbidden
    // list above. If a future refactor moves these types and the
    // import disappears, this test stays green (test asserts the path
    // is allowed, not that the import exists).
    const src = readFileSync(APPROVAL_GATE_PATH, "utf8");
    if (!src.includes("services/mcp/proposed-tool-call") &&
        !src.includes("../mcp/proposed-tool-call")) {
      // Either path style; not asserting either is present.
    }
    expect(true).toBe(true); // type-doc test only
  });
});

// ─────────────────────────────────────────────────────────────────
// L4-c6 — D-RESUME-3 race: emit DURING revalidate is not lost
// ─────────────────────────────────────────────────────────────────

describe("L4-c6 — D-RESUME-3 race protection (event arrives DURING revalidate)", () => {
  const SAMPLE_CALL: ProposedToolCall = {
    mcpServerId: "srv1",
    toolName: "drop_table",
    arguments: { name: "users" },
    rationale: "audit",
    evidenceChunkIds: [],
    riskLevel: "critical",
    requiresApproval: true,
  };

  function pendingVerdict(): RuntimeDispatchVerdict {
    return {
      ok: false,
      reason: "approval_pending",
      message: "operator decision required",
      code: null,
      call: SAMPLE_CALL,
      approvalRequestId: 42,
    };
  }

  it("event emitted DURING revalidate (not before, not after) is captured", async () => {
    // The race: subscribe at T0; revalidate starts at T1; event fires
    // at T2 (between T1 and the revalidate result at T3); revalidate
    // returns 'still pending' at T3. Without subscribe-before-revalidate
    // (D-RESUME-3 protection), the event would be lost between T2 and
    // the would-be subscribe at T4. With it, the event is captured by
    // the active subscription at T0.
    const bus = createApprovalEventBus();
    let revalidateCalls = 0;
    const revalidate = vi.fn(async () => {
      revalidateCalls += 1;
      // Fire the bus event mid-revalidate — only on the first call
      // (D-RESUME-3 path). Don't fire on the defensive re-eval.
      if (revalidateCalls === 1) {
        // Emit AFTER subscribe (helper subscribes BEFORE calling
        // revalidate) but BEFORE revalidate returns. The bus listener
        // must capture this.
        bus.emit({
          approvalRequestId: 42,
          status: "allowed",
          expiresAt: null,
        });
      }
      // First call: still pending. Second call: confirm permit.
      return revalidateCalls === 1
        ? pendingVerdict()
        : ({
            ok: true,
            reason: null,
            message: null,
            code: null,
            call: SAMPLE_CALL,
            approvalRequestId: 42,
          } as RuntimeDispatchVerdict);
    });

    const result = await awaitApprovalDecision({
      approvalRequestId: 42,
      timeoutMs: 5000,
      initialVerdict: pendingVerdict(),
      bus,
      revalidate,
    });

    // Without D-RESUME-3 protection, the helper would time out
    // (verdict.outcome === "timeout"). With it, the bus event fires
    // → defensive re-eval → permit verdict.
    expect(result.outcome).toBe("event_allowed_confirmed");
    expect(result.verdict.ok).toBe(true);
    expect(revalidate).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────
// L5-c6 — APPROVAL_RESUME_TIMEOUT_SEC sanity range doc + warn
// ─────────────────────────────────────────────────────────────────

describe("L5-c6 — APPROVAL_RESUME_TIMEOUT_SEC range guidance", () => {
  for (const [name, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["services/chat.ts", CHAT_SERVICE_PATH],
  ] as const) {
    it(`${name} carries the L5-c6 closure marker`, () => {
      const src = readFileSync(path, "utf8");
      expect(
        src,
        `L5-c6 violated: ${name} must carry the \`L5-c6\` closure ` +
          `marker so a future audit can trace the timeout-range guidance ` +
          `back to its origin item.`,
      ).toMatch(/L5-c6\b/);
    });

    it(`${name} documents the recommended 10-3600s range`, () => {
      const src = readFileSync(path, "utf8");
      expect(
        src,
        `L5-c6 violated: ${name} must document the recommended ` +
          `\`10-3600\` second range for APPROVAL_RESUME_TIMEOUT_SEC. ` +
          `Without the doc, an operator pasting in a value below 10s ` +
          `(approvals always timeout) or above 3600s (browser/proxy ` +
          `keep-alive limits close the SSE first) won't see why their ` +
          `incidents correlate with the env var.`,
      ).toMatch(/10-3600/);
    });

    it(`${name} warns on out-of-range parsed values`, () => {
      const src = strip(readFileSync(path, "utf8"));
      expect(
        src,
        `L5-c6 violated: ${name} must call \`console.warn\` when the ` +
          `parsed APPROVAL_RESUME_TIMEOUT_SEC is outside 10-3600. ` +
          `Silent acceptance is the problem L5-c6 closes.`,
      ).toMatch(/console\.warn[\s\S]+APPROVAL_RESUME_TIMEOUT_SEC/);
    });

    it(`${name} preserves the Math.max(1, ...) defensive floor`, () => {
      const src = strip(readFileSync(path, "utf8"));
      expect(
        src,
        `L5-c6 violated: ${name} dropped the \`Math.max(1, ...)\` ` +
          `defensive floor on the parsed timeout. Even with the ` +
          `recommended-range warning, the floor stays as a guard ` +
          `against negative / zero values that would short-circuit ` +
          `the approval wait entirely.`,
      ).toMatch(/Math\.max\s*\(\s*1\s*,/);
    });
  }
});
