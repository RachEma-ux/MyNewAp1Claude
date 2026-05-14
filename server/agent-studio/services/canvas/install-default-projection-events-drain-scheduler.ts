/**
 * Default canvas projection events drain scheduler boot installer
 * — V1+ 17-γ follow-up (PR-V1-60).
 *
 * Closes the 17-γ persistence sink end-to-end loop: schema (#804)
 * → writer (#805) → boot-install of writer (#806) → drain helpers
 * (#807, #808, #809) → tick wrapper (#810) → this scheduler.
 *
 * Env-flag-gated `setInterval`-based scheduler that calls the
 * module-singleton `tickCanvasProjectionEventsDrain()` from #810
 * on a fixed cadence. Default OFF — opt-in.
 *
 * Env flags:
 *   AGS_CANVAS_PROJECTION_EVENTS_DRAIN=interval
 *     ⇒ installs the scheduler at boot.
 *   AGS_CANVAS_PROJECTION_EVENTS_DRAIN_INTERVAL_MS=<number>
 *     ⇒ overrides the default tick interval (60000 = 60s).
 *
 * Forwarder:
 *   - Caller-supplied via `installCanvasProjectionEventsDrainForwarder`
 *     before / during boot. The scheduler does NOT install one for
 *     you; ticks are no-ops + WARN until a forwarder is installed.
 *   - This keeps the integration boundary explicit: the scheduler
 *     decides WHEN to drain, the operator decides WHERE events go
 *     (ProjectionSyncWorker, external queue, log-only audit, etc.).
 *
 * Mirrors the AS-4 (#786) + 17-γ sink installer (#806) shape: env-
 * flag-gated, test-seamed, returns `{ mode, installed, intervalMs }`
 * for boot-step logging.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - Idempotent within a single boot via `__resetForTests`; in
 *     production the scheduler is installed exactly once.
 */

import { tickCanvasProjectionEventsDrain } from "./projection-events-drain-tick.js";

export const CANVAS_PROJECTION_EVENTS_DRAIN_ENV_VAR =
  "AGS_CANVAS_PROJECTION_EVENTS_DRAIN";

export const CANVAS_PROJECTION_EVENTS_DRAIN_INTERVAL_MS_ENV_VAR =
  "AGS_CANVAS_PROJECTION_EVENTS_DRAIN_INTERVAL_MS";

export const INTERVAL_SCHEDULER_MODE = "interval" as const;

export const DEFAULT_CANVAS_DRAIN_TICK_INTERVAL_MS = 60000;

export type DefaultCanvasProjectionDrainSchedulerMode =
  | typeof INTERVAL_SCHEDULER_MODE
  | "off";

export type IntervalLike = {
  unref?: () => unknown;
};

export interface MaybeInstallDefaultCanvasProjectionEventsDrainSchedulerOptions {
  /** Test seam — override process.env lookup. */
  readonly env?: NodeJS.ProcessEnv;
  /** Test seam — override the setInterval implementation. */
  readonly setInterval?: (
    fn: () => void,
    ms: number,
  ) => IntervalLike | number;
  /** Test seam — override the tick implementation. Defaults to the
   *  module-singleton `tickCanvasProjectionEventsDrain` from #810. */
  readonly tick?: () => Promise<unknown>;
}

export interface MaybeInstallDefaultCanvasProjectionEventsDrainSchedulerResult {
  readonly mode: DefaultCanvasProjectionDrainSchedulerMode;
  readonly installed: boolean;
  readonly intervalMs: number | null;
  /** The handle returned by `setInterval`. Caller can pass to
   *  `clearInterval` for shutdown. Null when not installed. */
  readonly handle: IntervalLike | number | null;
}

function resolveIntervalMs(env: NodeJS.ProcessEnv): number {
  const raw = env[CANVAS_PROJECTION_EVENTS_DRAIN_INTERVAL_MS_ENV_VAR];
  if (typeof raw === "string" && raw.length > 0) {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_CANVAS_DRAIN_TICK_INTERVAL_MS;
}

/**
 * Read the env flag and install (or skip) the setInterval-based
 * drain scheduler. Returns `{ mode, installed, intervalMs, handle }`.
 *
 * The scheduler calls `tickCanvasProjectionEventsDrain()` every
 * `intervalMs`. Each tick swallows its own errors via the wrapper
 * (lastTickError observability), so the interval loop never
 * crashes on a failing tick.
 */
export function maybeInstallDefaultCanvasProjectionEventsDrainScheduler(
  options: MaybeInstallDefaultCanvasProjectionEventsDrainSchedulerOptions = {},
): MaybeInstallDefaultCanvasProjectionEventsDrainSchedulerResult {
  const env = options.env ?? process.env;
  const flag = env[CANVAS_PROJECTION_EVENTS_DRAIN_ENV_VAR];

  if (flag !== INTERVAL_SCHEDULER_MODE) {
    return {
      mode: "off",
      installed: false,
      intervalMs: null,
      handle: null,
    };
  }

  const intervalMs = resolveIntervalMs(env);
  const intervalImpl = options.setInterval ?? globalThis.setInterval;
  const tick = options.tick ?? tickCanvasProjectionEventsDrain;

  // Fire-and-forget — the tick wrapper captures its own errors
  // into the module-singleton state, so we never throw out of the
  // interval callback.
  const handle = intervalImpl(() => {
    void Promise.resolve()
      .then(() => tick())
      .catch((err) => {
        console.warn(
          "[ags-canvas-projection-events-drain-scheduler] tick rejected:",
          err instanceof Error ? err.message : err,
        );
      });
  }, intervalMs);

  // Best-effort: if Node's Timeout supports `unref`, mark this
  // interval as non-blocking-shutdown. Tests pass numbers or
  // plain objects so guard with typeof.
  if (
    handle != null &&
    typeof (handle as IntervalLike).unref === "function"
  ) {
    try {
      (handle as IntervalLike).unref!();
    } catch {
      // Tolerate setups where unref isn't actually invokable.
    }
  }

  return {
    mode: INTERVAL_SCHEDULER_MODE,
    installed: true,
    intervalMs,
    handle,
  };
}
