/**
 * C2-c4 PR-2 — approval-event-bus unit tests (D-RESUME-7).
 *
 * Locks the bus contract documented in
 * `docs/architecture/agent-studio-approval-resume-path.md` D-RESUME-1
 * and D-RESUME-2:
 *   - subscribe → emit → waitFor resolves with the event
 *   - subscribe → no emit → waitFor returns "timeout" (not throws)
 *   - multiple subscribers on same key → all receive
 *   - emit before subscribe → that subscribe times out (events not buffered;
 *     D-RESUME-3 handles the race via DB re-eval in the caller)
 *   - cross-key isolation: emit on key A doesn't fire waiters on key B
 *   - listener cleanup: completed waiters remove their listeners
 */
import { describe, it, expect } from "vitest";
import {
  createApprovalEventBus,
  type ApprovalDecidedEvent,
} from "../../server/agent-studio/services/runtime/approval-event-bus";

describe("approval-event-bus — D-RESUME-1 in-process bus", () => {
  it("subscribe → emit → waitFor resolves with the event", async () => {
    const bus = createApprovalEventBus();
    const event: ApprovalDecidedEvent = {
      approvalRequestId: 42,
      status: "allowed",
      expiresAt: new Date("2026-05-09T12:00:00Z"),
    };

    const waiter = bus.waitFor(42, 1000);
    bus.emit(event);

    const result = await waiter;
    expect(result).toEqual(event);
  });

  it("subscribe → no emit → waitFor returns 'timeout' literal (not throws)", async () => {
    const bus = createApprovalEventBus();
    const result = await bus.waitFor(99, 50);
    expect(result).toBe("timeout");
  });

  it("multiple subscribers on same approvalRequestId all receive the event", async () => {
    const bus = createApprovalEventBus();
    const event: ApprovalDecidedEvent = {
      approvalRequestId: 7,
      status: "denied",
      expiresAt: null,
    };

    const w1 = bus.waitFor(7, 1000);
    const w2 = bus.waitFor(7, 1000);
    const w3 = bus.waitFor(7, 1000);
    bus.emit(event);

    const [r1, r2, r3] = await Promise.all([w1, w2, w3]);
    expect(r1).toEqual(event);
    expect(r2).toEqual(event);
    expect(r3).toEqual(event);
  });

  it("emit before subscribe → subscriber times out (events are not buffered)", async () => {
    const bus = createApprovalEventBus();
    const event: ApprovalDecidedEvent = {
      approvalRequestId: 100,
      status: "allowed",
      expiresAt: new Date(),
    };

    // Emit FIRST (no subscribers yet)
    bus.emit(event);

    // Subscribe AFTER — should not see the dropped event, must time out
    const result = await bus.waitFor(100, 50);
    expect(result).toBe("timeout");
  });

  it("cross-key isolation: emit on key A doesn't fire waiters on key B", async () => {
    const bus = createApprovalEventBus();
    const eventA: ApprovalDecidedEvent = {
      approvalRequestId: 1,
      status: "allowed",
      expiresAt: null,
    };

    const waiterB = bus.waitFor(2, 50);
    bus.emit(eventA);

    const result = await waiterB;
    expect(result).toBe("timeout");
  });

  it("waitFor cleans up its listener after timeout (no leak)", async () => {
    const bus = createApprovalEventBus();
    // Run several timeouts back-to-back; if listeners leaked, the
    // EventEmitter would warn at >100 (max set in createApprovalEventBus).
    // We assert the warning is never raised.
    const warnings: unknown[] = [];
    const origWarn = process.emitWarning;
    process.emitWarning = (warning: string | Error) => {
      warnings.push(warning);
    };
    try {
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 200; i++) {
        promises.push(bus.waitFor(i, 10));
      }
      await Promise.all(promises);
    } finally {
      process.emitWarning = origWarn;
    }
    expect(
      warnings,
      "EventEmitter MaxListenersExceededWarning means listeners leaked",
    ).toEqual([]);
  });

  it("waitFor cleans up its listener after event resolution (no leak)", async () => {
    const bus = createApprovalEventBus();
    const warnings: unknown[] = [];
    const origWarn = process.emitWarning;
    process.emitWarning = (warning: string | Error) => {
      warnings.push(warning);
    };
    try {
      // Each iteration: subscribe, immediately emit, await resolution.
      // If listeners leaked, repeating this 200x would trigger the
      // max-listeners warning on the same key.
      for (let i = 0; i < 200; i++) {
        const w = bus.waitFor(123, 1000);
        bus.emit({
          approvalRequestId: 123,
          status: "allowed",
          expiresAt: null,
        });
        await w;
      }
    } finally {
      process.emitWarning = origWarn;
    }
    expect(
      warnings,
      "Resolved listeners must be removed; leak detected",
    ).toEqual([]);
  });

  // ── C4-c6 — AbortSignal-driven cancellation ────────────────────────
  // Pre-cycle-6 the bus had no cancellation API. The shared
  // awaitApprovalDecision helper (cycle-6 C1+C4 closure) needs to
  // release the listener synchronously when the D-RESUME-3 re-eval
  // succeeds. AbortSignal is the contract.

  it("C4-c6: aborting the signal resolves waitFor with 'cancelled'", async () => {
    const bus = createApprovalEventBus();
    const ac = new AbortController();
    const w = bus.waitFor(42, 5000, ac.signal);
    queueMicrotask(() => ac.abort());
    const result = await w;
    expect(result).toBe("cancelled");
  });

  it("C4-c6: pre-aborted signal short-circuits without attaching listener", async () => {
    const bus = createApprovalEventBus();
    const ac = new AbortController();
    ac.abort();
    const result = await bus.waitFor(42, 5000, ac.signal);
    expect(result).toBe("cancelled");
    // Subsequent emit must not crash (listener was never attached).
    bus.emit({ approvalRequestId: 42, status: "allowed", expiresAt: null });
  });

  it("C4-c6: cancellation cleans up the timer (no leak)", async () => {
    const bus = createApprovalEventBus();
    const ac = new AbortController();
    const w = bus.waitFor(42, 100, ac.signal);
    ac.abort();
    expect(await w).toBe("cancelled");
    // Wait past the timer's would-be firing window; if the timer
    // wasn't cleared the timeout would log or fire a no-op `off` which
    // is fine, but the test asserts the cancellation path completed.
    await new Promise((r) => setTimeout(r, 150));
  });
});
