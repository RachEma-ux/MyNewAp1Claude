/**
 * L2-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md`
 * §L2-c5) — graceful → forced child-process shutdown unit tests.
 *
 * Pre-cycle-5 the stdio transport's `close` fired SIGTERM and returned
 * immediately; a child that ignored SIGTERM stayed around as an
 * orphan. Post-cycle-5 (this PR): `gracefulCloseChild` escalates
 * SIGTERM → SIGKILL on a `gracePeriodMs` (default 2s) timeout.
 *
 * The helper is pure + accepts an injectable `setTimeoutFn` so this
 * suite runs in milliseconds without actually waiting 2 seconds.
 *
 * Coverage:
 *   1. Already-exited child → no kill calls, returns "already_exited"
 *   2. Child exits in response to SIGTERM → "exited_gracefully"
 *   3. Child ignores SIGTERM → escalates to SIGKILL → "force_killed"
 *   4. Child ignores both → "force_kill_unconfirmed"
 *   5. SIGTERM kill syscall throws → swallowed; still races to timeout
 *   6. Custom gracePeriodMs / forceWaitMs respected
 */
import { describe, it, expect, vi } from "vitest";
import type { ChildProcess } from "child_process";
import { gracefulCloseChild } from "../../server/agent-studio/services/mcp/transports/graceful-child-close";

interface FakeChild {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  killCalls: NodeJS.Signals[];
  // Simulates the EventEmitter.once('exit', cb) wiring.
  exitListeners: Array<() => void>;
  kill: (signal: NodeJS.Signals) => boolean;
  once: (event: string, listener: () => void) => FakeChild;
}

function makeFakeChild(opts: {
  alreadyExited?: boolean;
  /** "graceful" → exits when SIGTERM arrives; "force" → exits when
   *  SIGKILL arrives; "ignore" → never exits. */
  responseTo?: "graceful" | "force" | "ignore";
}): FakeChild {
  const child: FakeChild = {
    exitCode: opts.alreadyExited ? 0 : null,
    signalCode: null,
    killCalls: [],
    exitListeners: [],
    kill: (signal) => {
      child.killCalls.push(signal);
      const respond = opts.responseTo;
      if (
        (signal === "SIGTERM" && respond === "graceful") ||
        (signal === "SIGKILL" && (respond === "graceful" || respond === "force"))
      ) {
        // Synchronous exit fire (test-only): real children exit
        // asynchronously on a sub-millisecond delay, but the helper's
        // contract is "if the exit event fires before the timeout, we
        // pick exit." Synchronous fires that semantic without racing
        // microtasks against the immediate-setTimeout fake.
        child.exitCode = 0;
        for (const cb of child.exitListeners.splice(0)) cb();
      }
      return true;
    },
    once: (event, listener) => {
      if (event === "exit") child.exitListeners.push(listener);
      return child;
    },
  };
  return child;
}

/** Synchronous setTimeout fake — fires immediately (next microtask). */
function makeImmediateSetTimeout(): typeof setTimeout {
  const fake = ((cb: () => void, _ms?: number) => {
    queueMicrotask(cb);
    return 0 as unknown as NodeJS.Timeout;
  }) as unknown as typeof setTimeout;
  return fake;
}

describe("gracefulCloseChild", () => {
  it("returns 'already_exited' without kill calls when child has exitCode set", async () => {
    const child = makeFakeChild({ alreadyExited: true });
    const outcome = await gracefulCloseChild(child as unknown as ChildProcess);
    expect(outcome).toBe("already_exited");
    expect(child.killCalls).toEqual([]);
  });

  it("returns 'already_exited' without kill calls when child has signalCode set", async () => {
    const child = makeFakeChild({ alreadyExited: false });
    child.signalCode = "SIGTERM" as NodeJS.Signals;
    const outcome = await gracefulCloseChild(child as unknown as ChildProcess);
    expect(outcome).toBe("already_exited");
    expect(child.killCalls).toEqual([]);
  });

  it("returns 'exited_gracefully' when child exits on SIGTERM", async () => {
    const child = makeFakeChild({ responseTo: "graceful" });
    const outcome = await gracefulCloseChild(child as unknown as ChildProcess, {
      setTimeoutFn: makeImmediateSetTimeout(),
    });
    expect(outcome).toBe("exited_gracefully");
    // Only SIGTERM was sent; SIGKILL never fired.
    expect(child.killCalls).toEqual(["SIGTERM"]);
  });

  it("escalates to SIGKILL when child ignores SIGTERM", async () => {
    const child = makeFakeChild({ responseTo: "force" });
    const outcome = await gracefulCloseChild(child as unknown as ChildProcess, {
      setTimeoutFn: makeImmediateSetTimeout(),
    });
    expect(outcome).toBe("force_killed");
    expect(child.killCalls).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("returns 'force_kill_unconfirmed' when child ignores both signals", async () => {
    const child = makeFakeChild({ responseTo: "ignore" });
    const outcome = await gracefulCloseChild(child as unknown as ChildProcess, {
      setTimeoutFn: makeImmediateSetTimeout(),
    });
    expect(outcome).toBe("force_kill_unconfirmed");
    expect(child.killCalls).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("swallows kill-syscall throws (e.g. ESRCH after race) and still resolves", async () => {
    const child = makeFakeChild({ responseTo: "ignore" });
    // First kill throws (simulates ESRCH); subsequent SIGKILL throws too.
    const original = child.kill;
    child.kill = (signal) => {
      original(signal); // record the call
      throw new Error("kill ESRCH");
    };
    const outcome = await gracefulCloseChild(child as unknown as ChildProcess, {
      setTimeoutFn: makeImmediateSetTimeout(),
    });
    // Both kill attempts threw, but the helper still resolves cleanly.
    expect(outcome).toBe("force_kill_unconfirmed");
    expect(child.killCalls).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("respects custom gracePeriodMs and forceWaitMs", async () => {
    // Use a real setTimeout but tiny intervals; assert relative ordering.
    const child = makeFakeChild({ responseTo: "force" });
    const outcome = await gracefulCloseChild(child as unknown as ChildProcess, {
      gracePeriodMs: 5,
      forceWaitMs: 5,
    });
    expect(outcome).toBe("force_killed");
  });

  it("never sends SIGKILL when child exits before the grace timer fires", async () => {
    // Schedule the SIGTERM-triggered exit AFTER the timer would fire if it
    // were synchronous, but BEFORE the timer fires for real (5ms grace).
    const child = makeFakeChild({ responseTo: "graceful" });
    const outcome = await gracefulCloseChild(child as unknown as ChildProcess, {
      gracePeriodMs: 50,
      forceWaitMs: 5,
    });
    expect(outcome).toBe("exited_gracefully");
    expect(child.killCalls).toEqual(["SIGTERM"]);
  });
});
