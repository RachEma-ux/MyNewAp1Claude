/**
 * Canvas projection events drain — env-flag-gated default forwarder
 * installer. V1+ 17-γ follow-up (PR-V1-79).
 *
 * Closes the "operator-supplied forwarder" gap surfaced in #812: the
 * scheduler from #811 ticks the drain on a fixed interval, but a tick
 * with no installed forwarder is a no-op + WARN. This installer wires
 * a default forwarder when an operator opts in via env flag.
 *
 * Supported modes (closed taxonomy):
 *
 *   `AGS_CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER=log`
 *     → installs a log-only forwarder that emits each projected event
 *       to the console (one structured line per event). Useful for
 *       phased rollouts + smoke-tests: operators can flip the flag,
 *       observe events flow end-to-end (sink → DB → drain → forwarder),
 *       and then graduate to a real downstream consumer.
 *
 *   Anything else / unset
 *     → no-op. Preserves the existing "operator-supplied forwarder"
 *       semantics. Ticks with no forwarder remain WARN no-ops per
 *       #810. This is the safe default.
 *
 * The log-only forwarder uses the existing
 * `createProjectingCanvasProjectionEventForwarder({dispatch})` factory
 * from #818, with a `dispatch` closure that logs the in-memory
 * `CanvasProjectionEvent`. The projector + forwarder pair handle
 * unprojectable rows + cursor-advance + halt-on-throw per #818
 * semantics; this file is just the boot-time installer.
 *
 * Future modes (NOT shipped in this PR):
 *
 *   `AGS_CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER=sync-worker`
 *     → would construct a `ProjectionSyncWorker` + `GraphRepository`
 *       and dispatch to `worker.handle()`. Requires the Phase-7 graph
 *       backend decision factory in scope. Separate sub-arc.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - No `ProjectionSyncWorker` import — the log mode does not need
 *     it. Future `sync-worker` mode will live in a sibling installer
 *     under `server/agent-studio/services/graph/projection/` so the
 *     canvas/** module stays clean.
 */

import { createProjectingCanvasProjectionEventForwarder } from "./projection-events-drain-projecting-forwarder.js";
import type { CanvasProjectionEventForwarder } from "./projection-events-drain.js";

export const CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER_MODES = [
  "log",
] as const;

export type CanvasProjectionEventsDrainForwarderMode =
  (typeof CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER_MODES)[number];

export interface MaybeInstallDefaultCanvasProjectionEventsDrainForwarderOptions {
  /** Override the env source. Tests inject `{}`. */
  readonly env?: Record<string, string | undefined>;
  /** Test seam — override the installer hook. Production uses
   *  `installCanvasProjectionEventsDrainForwarder` from #810. */
  readonly install?: (forwarder: CanvasProjectionEventForwarder) => void;
}

export interface MaybeInstallDefaultCanvasProjectionEventsDrainForwarderResult {
  readonly mode: CanvasProjectionEventsDrainForwarderMode | null;
  readonly installed: boolean;
}

const ENV_KEY = "AGS_CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER";

export async function maybeInstallDefaultCanvasProjectionEventsDrainForwarder(
  options: MaybeInstallDefaultCanvasProjectionEventsDrainForwarderOptions = {},
): Promise<MaybeInstallDefaultCanvasProjectionEventsDrainForwarderResult> {
  const env = options.env ?? process.env;
  const raw = env[ENV_KEY];

  if (!isKnownMode(raw)) {
    return { mode: null, installed: false };
  }

  const forwarder = buildForwarderForMode(raw);
  const install =
    options.install ??
    (await loadDefaultInstaller());
  install(forwarder);
  return { mode: raw, installed: true };
}

function isKnownMode(
  raw: string | undefined,
): raw is CanvasProjectionEventsDrainForwarderMode {
  return (
    raw !== undefined &&
    (CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER_MODES as readonly string[]).includes(
      raw,
    )
  );
}

function buildForwarderForMode(
  mode: CanvasProjectionEventsDrainForwarderMode,
): CanvasProjectionEventForwarder {
  switch (mode) {
    case "log":
      return createProjectingCanvasProjectionEventForwarder({
        dispatch: (event) => {
          console.log(
            `[ags-canvas-projection-events-drain] event kind=${event.kind} payload=${JSON.stringify(event.payload)}`,
          );
        },
      });
  }
}

async function loadDefaultInstaller(): Promise<
  (forwarder: CanvasProjectionEventForwarder) => void
> {
  const mod = await import("./projection-events-drain-tick.js");
  return mod.installCanvasProjectionEventsDrainForwarder;
}
