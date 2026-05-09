/**
 * Graceful → forced child-process shutdown for MCP stdio transport.
 *
 * L2-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md`
 * §L2-c5) — pre-cycle-5 the stdio transport's `close` fired SIGTERM
 * and returned immediately. If the child ignored SIGTERM (broken
 * cleanup handlers, infinite loop on a signal-blocking syscall, etc.)
 * the orphan stayed around indefinitely, holding ports / file
 * descriptors / etc. The audit recommended:
 *
 *   `Promise.race([close, setTimeout(2000)])`; `kill(-9)` after timeout.
 *
 * This helper implements that contract:
 *
 *   1. If the child has already exited, return immediately.
 *   2. Subscribe to the child's `exit` event BEFORE sending any signal
 *      (so a child that dies between SIGTERM and the listener attach
 *      can't strand the promise).
 *   3. Send SIGTERM. Race against a `gracePeriodMs` timer (default
 *      2000ms).
 *   4. On `exit` arriving first → resolve.
 *   5. On timeout → send SIGKILL. Wait briefly (500ms) for the kill
 *      to land. No further escalation.
 *
 * Pure helper — accepts an injectable `setTimeoutFn` so the unit test
 * doesn't actually wait 2 seconds. Production callers pass the global
 * `setTimeout` (the default).
 */
import type { ChildProcess } from "child_process";

export interface GracefulCloseOptions {
  /** ms to wait for SIGTERM to land before escalating to SIGKILL. */
  gracePeriodMs?: number;
  /** ms to wait for SIGKILL to land before giving up. */
  forceWaitMs?: number;
  /** Injectable for tests. Defaults to global setTimeout. */
  setTimeoutFn?: typeof setTimeout;
}

export type GracefulCloseOutcome =
  | "already_exited"
  | "exited_gracefully"
  | "force_killed"
  | "force_kill_unconfirmed";

/**
 * Close a child process, escalating SIGTERM → SIGKILL on timeout.
 * Always resolves; never throws — kill failures are swallowed (the
 * goal is "the child is dead or we tried our best", not "we
 * confirmed the kill syscall succeeded").
 */
export async function gracefulCloseChild(
  child: ChildProcess,
  opts: GracefulCloseOptions = {},
): Promise<GracefulCloseOutcome> {
  const gracePeriodMs = opts.gracePeriodMs ?? 2_000;
  const forceWaitMs = opts.forceWaitMs ?? 500;
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;

  if (child.exitCode != null || child.signalCode != null) {
    return "already_exited";
  }

  const exitedPromise = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
  });

  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore: kill syscall failure means child is already gone */
  }

  const graceful = await Promise.race([
    exitedPromise.then(() => "exited" as const),
    new Promise<"timeout">((resolve) => {
      setTimeoutFn(() => resolve("timeout"), gracePeriodMs);
    }),
  ]);

  if (graceful === "exited") return "exited_gracefully";

  try {
    child.kill("SIGKILL");
  } catch {
    /* ignore */
  }

  const forced = await Promise.race([
    exitedPromise.then(() => "exited" as const),
    new Promise<"timeout">((resolve) => {
      setTimeoutFn(() => resolve("timeout"), forceWaitMs);
    }),
  ]);

  return forced === "exited" ? "force_killed" : "force_kill_unconfirmed";
}
