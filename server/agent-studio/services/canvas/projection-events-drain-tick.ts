/**
 * Canvas projection events drain — module-singleton tick wrapper
 * (PR-V1-59).
 *
 * Wraps the stateless fan-out (#809) with module-local cursor
 * state so a cron / setInterval / setTimeout-based scheduler can
 * invoke a single nullary `tickCanvasProjectionEventsDrain()`
 * without managing the cursor map. Mirrors the AS-2/AS-4 module-
 * singleton + reset-for-tests pattern.
 *
 * Cursor scope:
 *   - Process-local Map. Survives ticks within the same process;
 *     resets on boot.
 *   - First tick after boot scans from `lastSeenId=0` per workspace,
 *     so events written between the prior process's last tick and
 *     this boot are re-forwarded. The forwarder MUST be idempotent.
 *     (`recordCanvasProjectionEvent` writes are append-only by
 *     contract — forwarders that derive state can dedupe on row
 *     id; forwarders that fan-out to external systems should track
 *     their own idempotency keys.)
 *
 * Installation:
 *   - Caller (cron / setInterval / admin trigger) supplies the
 *     forwarder once via `installCanvasProjectionEventsDrainForwarder`.
 *   - Ticks before install are no-ops + WARN.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 */

import {
  drainCanvasProjectionEventsAllWorkspaces,
  type DrainCanvasProjectionEventsAllWorkspacesResult,
} from "./projection-events-drain-fanout.js";
import type { CanvasProjectionEventForwarder } from "./projection-events-drain.js";
import type { ReadCanvasProjectionEventsAfterOptions } from "./projection-events-reader.js";

let _forwarder: CanvasProjectionEventForwarder | null = null;
let _cursorMap: Map<number, number> = new Map();
let _lastTickResult: DrainCanvasProjectionEventsAllWorkspacesResult | null =
  null;
let _lastTickError: { message: string; at: Date } | null = null;
let _ticksRun = 0;

export interface TickCanvasProjectionEventsDrainOptions
  extends ReadCanvasProjectionEventsAfterOptions {
  /** Pass-through to the fan-out — overrides the default `SELECT
   *  DISTINCT workspaceId` discovery. */
  readonly getWorkspaceIds?: () => Promise<readonly number[]>;
  /** Pass-through to the per-workspace drain. */
  readonly limit?: number;
  /** Pass-through to the per-workspace drain. */
  readonly maxBatchesPerWorkspace?: number;
}

export function installCanvasProjectionEventsDrainForwarder(
  forwarder: CanvasProjectionEventForwarder,
): void {
  _forwarder = forwarder;
}

export function hasCanvasProjectionEventsDrainForwarder(): boolean {
  return _forwarder != null;
}

export function getCanvasProjectionEventsDrainLastTickResult(): {
  ticksRun: number;
  lastTickResult: DrainCanvasProjectionEventsAllWorkspacesResult | null;
  lastTickError: { message: string; at: Date } | null;
  cursorMapSize: number;
} {
  return {
    ticksRun: _ticksRun,
    lastTickResult: _lastTickResult,
    lastTickError: _lastTickError,
    cursorMapSize: _cursorMap.size,
  };
}

export function __resetCanvasProjectionEventsDrainForTests(): void {
  _forwarder = null;
  _cursorMap = new Map();
  _lastTickResult = null;
  _lastTickError = null;
  _ticksRun = 0;
}

/**
 * Single tick of the drain loop. No-op + WARN when no forwarder
 * is installed. Stores the result + any error on the module-local
 * state so observability endpoints / tests can introspect.
 */
export async function tickCanvasProjectionEventsDrain(
  options: TickCanvasProjectionEventsDrainOptions = {},
): Promise<DrainCanvasProjectionEventsAllWorkspacesResult | null> {
  const forwarder = _forwarder;
  if (!forwarder) {
    console.warn(
      "[ags-canvas-projection-events-drain-tick] no forwarder installed — tick skipped",
    );
    return null;
  }

  _ticksRun++;
  try {
    const { getDb, ...fanoutOnly } = options;
    const result = await drainCanvasProjectionEventsAllWorkspaces(
      {
        cursorMap: _cursorMap,
        forward: forwarder,
        ...fanoutOnly,
      },
      { getDb },
    );
    _lastTickResult = result;
    _lastTickError = null;
    return result;
  } catch (err) {
    _lastTickError = {
      message: err instanceof Error ? err.message : String(err),
      at: new Date(),
    };
    console.warn(
      "[ags-canvas-projection-events-drain-tick] tick threw — module-singleton state preserved:",
      _lastTickError.message,
    );
    return null;
  }
}
