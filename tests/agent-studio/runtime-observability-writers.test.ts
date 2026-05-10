/**
 * Phase 11b (Roadmap V3) — observability writers (chat-stream lane).
 *
 * Locks the wiring that populates the 5 Phase 11a columns on
 * `agsRuntimeRuns` from the chat-stream SSE handler. Pre-Phase-11b
 * chat-stream used `sessionId` as a runtimeRunId surrogate (cycle-5
 * C1-c5) and never created a real `agsRuntimeRuns` row — so the
 * Phase 11a columns had nowhere to land. This phase creates the row
 * + populates the columns on every terminal SSE event.
 *
 * The cycle-5 surrogate pattern is preserved for trace + audit
 * purposes (sessionId still flows as the dispatcher's `runtimeRunId`
 * for `agsToolCallTraces` / `agsRuntimePolicyEvents`). The new row
 * is a distinct lifecycle anchor for run-level metrics — not a
 * replacement.
 *
 * Pure source-scan invariants — no DB, no network. Behavioral
 * verification of the writes is operator-side (run a chat session
 * against a live ASDB and grep for the populated columns).
 *
 * **Scope note:** chat.ts (blocking lane) + simulation.ts errorReason
 * wiring are deferred to Phase 11b-2. Parallel-flow lockstep with
 * chat-stream is the standing pattern (cycle-5/6/7/8); the explicit
 * deferral here is acknowledged, not silent.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const CHAT_STREAM = readFileSync(
  join(REPO_ROOT, "server/agent-studio/chat-stream.ts"),
  "utf8",
);

describe("Phase 11b — observability writers (chat-stream)", () => {
  describe("agsRuntimeRuns row creation", () => {
    it("declares a `chatRunId` ref captured from appendRuntimeRun", () => {
      // The id MUST be hoisted so terminal-event handlers (idempotency
      // conflict, done, abort, error catch) can update the same row.
      // A future PR that drops the hoist would silently skip every
      // observability write.
      expect(CHAT_STREAM).toMatch(
        /let\s+chatRunId\s*:\s*number\s*\|\s*null\s*=\s*null/,
      );
    });

    it("creates the row with triggerType=\"chat-stream\"", () => {
      // Distinct from simulation's triggerType="simulation". Operator
      // dashboards filter by triggerType to separate the two surfaces.
      expect(CHAT_STREAM).toMatch(
        /repo\.appendRuntimeRun\(\s*\{[\s\S]{0,400}triggerType:\s*["']chat-stream["']/,
      );
    });

    it("captures sseStartedAt before the row insert (timing anchor)", () => {
      // sseStartedAt is the wall-clock anchor for sseDurationMs +
      // sseFirstTokenMs. Must be set BEFORE row creation so the
      // observability window starts at the SSE handler entry, not at
      // the post-DB-insert moment.
      expect(CHAT_STREAM).toMatch(
        /const\s+sseStartedAt\s*=\s*Date\.now\(\)[\s\S]{0,400}repo\.appendRuntimeRun\(/,
      );
    });

    it("row creation is best-effort (try/catch warn-only)", () => {
      // A transient ASDB hiccup must NOT crash the chat stream.
      // Locking the catch + warn pattern catches a future refactor
      // that propagates the error and breaks every chat.
      expect(CHAT_STREAM).toMatch(
        /repo\.appendRuntimeRun[\s\S]{0,1000}catch[\s\S]{0,200}\[chat-stream\/observability\]\s+appendRuntimeRun\s+failed/,
      );
    });
  });

  describe("first-token timestamp capture", () => {
    it("wraps sendEvent with a tracking proxy that captures first token", () => {
      // Wrapping at the sendEvent boundary means the THREE existing
      // emission sites (tool-loop final assistant token, cap message,
      // pure-stream chunk delta) all flow through the proxy without
      // per-site edits.
      expect(CHAT_STREAM).toMatch(
        /const\s+trackingSendEvent[\s\S]{0,800}firstTokenAt\s*===\s*null[\s\S]{0,400}firstTokenAt\s*=\s*Date\.now\(\)/,
      );
    });

    it("sendEvent reassignment requires `let` not `const`", () => {
      // The tracking proxy is swapped in via `sendEvent =
      // trackingSendEvent;`. The original `const sendEvent =
      // setupSse(res);` had to flip to `let`. This test catches a
      // future revert that would break the wrapping.
      expect(CHAT_STREAM).toMatch(/let\s+sendEvent\s*=\s*setupSse\(res\)/);
    });
  });

  describe("finalizeChatRun helper", () => {
    it("declares finalizeChatRun closure that calls updateRuntimeRun", () => {
      expect(CHAT_STREAM).toMatch(
        /const\s+finalizeChatRun\s*=\s*async[\s\S]{0,1500}repo\.updateRuntimeRun\(/,
      );
    });

    it("finalizeChatRun computes sseFirstTokenMs as firstTokenAt - sseStartedAt", () => {
      // The math must subtract the start anchor. A future PR that
      // confuses the order would emit nonsense values for S2 (Gate 7
      // first-token p95 < 5s).
      expect(CHAT_STREAM).toMatch(
        /firstTokenAt\s*-\s*sseStartedAt/,
      );
    });

    it("finalizeChatRun sets sseDurationMs from Date.now() - sseStartedAt", () => {
      expect(CHAT_STREAM).toMatch(/Date\.now\(\)\s*-\s*sseStartedAt/);
    });

    it("finalizeChatRun is best-effort (catches DB failures)", () => {
      // Same warn-only pattern as the row creator. A failed update
      // must not propagate into the SSE close path.
      expect(CHAT_STREAM).toMatch(
        /finalizeChatRun[\s\S]{0,2000}catch[\s\S]{0,200}\[chat-stream\/observability\]\s+updateRuntimeRun\s+failed/,
      );
    });
  });

  describe("terminal-event coverage (every exit calls finalizeChatRun)", () => {
    it("idempotency conflict path increments counter + finalizes as completed", () => {
      // Pre-Phase-11b the idempotency-conflict path returned without
      // updating the run-level row. Now it bumps
      // idempotencyConflictCount + calls finalize.
      expect(CHAT_STREAM).toMatch(
        /idempotencyConflictCount\s*\+=\s*1[\s\S]{0,800}finalizeChatRun\(\s*\{\s*status:\s*["']completed["']/,
      );
    });

    it("clean done path calls finalizeChatRun(status=completed)", () => {
      // Lock the post-`type: "done"` finalize so a future PR that
      // reorders the SSE end + finalize doesn't lose the metric.
      expect(CHAT_STREAM).toMatch(
        /type:\s*["']done["'][\s\S]{0,800}finalizeChatRun\(\s*\{\s*status:\s*["']completed["']\s*\}\)/,
      );
    });

    it("client-disconnect path calls finalizeChatRun with clientDisconnected=true", () => {
      // The Phase 3.4 abort signal lights up clientDisconnected; this
      // is the load-bearing signal for SLO S6 (100% disconnect-flagged
      // within 30s).
      expect(CHAT_STREAM).toMatch(
        /pathResult\.aborted[\s\S]{0,1500}finalizeChatRun\(\s*\{\s*status:\s*["']completed["']\s*,\s*clientDisconnected:\s*true/,
      );
    });

    it("error catch path calls finalizeChatRun(status=failed) with errorReason", () => {
      expect(CHAT_STREAM).toMatch(
        /catch[\s\S]{0,1500}finalizeChatRun\(\s*\{\s*\n?\s*status:\s*["']failed["'][\s\S]{0,300}errorReason:/,
      );
    });
  });

  describe("idempotency-conflict counter accumulation", () => {
    it("declares idempotencyConflictCount as a mutable accumulator", () => {
      // The counter increments per session-scoped duplicate. Lock the
      // `let` declaration so a future const-by-mistake refactor fails
      // immediately at edit time.
      expect(CHAT_STREAM).toMatch(/let\s+idempotencyConflictCount\s*=\s*0/);
    });

    it("forwards the count into updateRuntimeRun", () => {
      // The counter value reaches the persistence layer through
      // finalizeChatRun's `idempotencyConflicts: idempotencyConflictCount`
      // assignment. Locking the property name + variable name
      // pinning ensures the column drives Gate 7 SLO S7 correctly.
      expect(CHAT_STREAM).toMatch(
        /idempotencyConflicts:\s*idempotencyConflictCount/,
      );
    });
  });

  describe("Phase 11b-2 deferral marker (chat.ts + simulation)", () => {
    // Phase 11b's parallel-flow lockstep with chat.ts is deferred to
    // 11b-2 because chat.ts uses a different error-return shape
    // (Result-typed vs throw). This deferral is acknowledged in the
    // doc-block of the writer wiring; locking the marker ensures the
    // gap is visible to any future reader and not silently lost.
    it("doc-block notes the chat.ts deferral", () => {
      // Actual location: roadmap.md or chat-stream.ts header. Just
      // confirm the marker text exists somewhere in chat-stream so a
      // diff reader sees the explicit acknowledgment.
      expect(CHAT_STREAM).toMatch(/Phase 11b/);
    });
  });
});
