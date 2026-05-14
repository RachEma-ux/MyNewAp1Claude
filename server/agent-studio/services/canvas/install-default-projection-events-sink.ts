/**
 * Default canvas projection events sink boot installer — V1+ 17-γ
 * follow-up (PR-V1-55).
 *
 * Composes the 17-γ ASDB-backed sink (`createAsdbCanvasProjectionEventSink`
 * from #805) with the 17-γ sink registry (#792) so operators can
 * flip persistence on with a single env flag instead of writing the
 * registration wiring themselves.
 *
 * Default OFF — opt-in via env flag.
 *
 * Why opt-in:
 *   Installing this sink as the production default would start
 *   writing rows to `ags_canvas_projection_events` immediately —
 *   including for environments that don't yet have the table
 *   provisioned (the seed runs at boot but a stale boot order or
 *   a partial migration could trip up). The env flag lets
 *   operators flip the sink on after confirming the table is
 *   present, without changing the no-op default behavior on first
 *   install.
 *
 * Mirrors AS-4 (`install-default-governance-gate.ts` from #786)
 * one-for-one: env-flag-gated, test-seamed installer, returns
 * `{ mode, installed }` for boot-step logging.
 *
 * Env flag (read once at boot):
 *
 *   AGS_CANVAS_PROJECTION_EVENTS_SINK=asdb
 *     ⇒ installs the ASDB-backed sink.
 *   AGS_CANVAS_PROJECTION_EVENTS_SINK  (any other value, or unset)
 *     ⇒ no-op (preserves the no-op default sink — events are
 *        silently swallowed by `recordCanvasProjectionEvent`).
 *
 * Hard-rule compliance:
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - Idempotent: re-calling overwrites the prior install via the
 *     registry's `registerCanvasProjectionEventSink` semantics.
 */

import { createAsdbCanvasProjectionEventSink } from "./projection-events-sink-asdb.js";
import {
  registerCanvasProjectionEventSink,
  type CanvasProjectionEventSink,
} from "./projection-events-sink.js";

export const CANVAS_PROJECTION_EVENTS_SINK_ENV_VAR =
  "AGS_CANVAS_PROJECTION_EVENTS_SINK";

export const ASDB_SINK_MODE = "asdb" as const;

export type DefaultCanvasProjectionSinkMode =
  | typeof ASDB_SINK_MODE
  | "off";

export interface MaybeInstallDefaultCanvasProjectionEventsSinkOptions {
  /** Test seam — override process.env lookup. */
  readonly env?: NodeJS.ProcessEnv;
  /** Test seam — override the installer (defaults to the registry's
   *  `registerCanvasProjectionEventSink`). */
  readonly install?: (sink: CanvasProjectionEventSink) => void;
  /** Test seam — override the sink factory (defaults to the ASDB
   *  sink from #805). */
  readonly makeSink?: () => CanvasProjectionEventSink;
}

export interface MaybeInstallDefaultCanvasProjectionEventsSinkResult {
  readonly mode: DefaultCanvasProjectionSinkMode;
  readonly installed: boolean;
}

/**
 * Read the env flag and install (or skip) the default canvas
 * projection events sink. Returns `{ mode, installed }` so callers
 * (boot step) can log the decision.
 */
export function maybeInstallDefaultCanvasProjectionEventsSink(
  options: MaybeInstallDefaultCanvasProjectionEventsSinkOptions = {},
): MaybeInstallDefaultCanvasProjectionEventsSinkResult {
  const env = options.env ?? process.env;
  const flag = env[CANVAS_PROJECTION_EVENTS_SINK_ENV_VAR];

  if (flag !== ASDB_SINK_MODE) {
    return { mode: "off", installed: false };
  }

  const makeSink =
    options.makeSink ?? (() => createAsdbCanvasProjectionEventSink());
  const install = options.install ?? registerCanvasProjectionEventSink;

  install(makeSink());
  return { mode: ASDB_SINK_MODE, installed: true };
}
