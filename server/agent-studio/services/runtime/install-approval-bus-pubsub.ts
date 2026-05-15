/**
 * Boot wiring for the approval event bus cross-process pubsub.
 * D-RESUME-5. PR-V1-165.
 *
 * Mirrors `install-region-routing.ts` shape: env-flag-gated opt-in
 * that wires the emit hook + spawns the subscriber. Default OFF.
 *
 * When ON:
 *   1. Set the emit hook on the bus → every local emit triggers
 *      `notifyApprovalDecided` (cross-process NOTIFY).
 *   2. Subscribe to LISTEN; on each inbound notification, re-emit
 *      to the local bus (so chat-stream's local waitFor receives
 *      the cross-process event).
 *
 * Safety: the re-emit path does NOT call the emit hook (otherwise
 * a process would NOTIFY in response to its own LISTENed event,
 * causing a fan-out loop). The bus's emit hook is set once; the
 * subscribe handler bypasses the hook by emitting directly on the
 * EventEmitter via a captured reference. To avoid that complexity,
 * we use a simple guard flag that turns the hook off for the
 * duration of the re-emit.
 */

import { getApprovalEventBus, setApprovalEventEmitHook } from "./approval-event-bus.js";
import {
  maybeSubscribeApprovalBusPubsub,
  notifyApprovalDecided,
} from "./approval-event-bus-pubsub.js";

let _inRelayedEmit = false;

export interface InstallApprovalBusPubsubResult {
  readonly installed: boolean;
  readonly reason?: string;
}

/**
 * Boot-time wiring. Reads `AGS_APPROVAL_BUS_PUBSUB=on` and wires
 * both halves of the cross-process flow. Returns `{ installed:
 * false, reason: "..." }` when the env flag is unset; `{ installed:
 * true }` when wired.
 */
export function maybeInstallApprovalBusPubsub(): InstallApprovalBusPubsubResult {
  if (process.env.AGS_APPROVAL_BUS_PUBSUB !== "on") {
    return { installed: false, reason: "env flag unset" };
  }

  // Outbound: every local emit fires NOTIFY. Guarded so the inbound
  // re-emit path (below) doesn't itself trigger a NOTIFY → infinite
  // fan-out.
  setApprovalEventEmitHook((event) => {
    if (_inRelayedEmit) return;
    void notifyApprovalDecided(event);
  });

  // Inbound: each LISTEN notification re-emits onto the local bus,
  // briefly disabling the outbound hook so the re-emit doesn't
  // NOTIFY again.
  const bus = getApprovalEventBus();
  maybeSubscribeApprovalBusPubsub((event) => {
    _inRelayedEmit = true;
    try {
      bus.emit(event);
    } finally {
      _inRelayedEmit = false;
    }
  });

  return { installed: true };
}

/**
 * Test seam — disconnect both halves so other tests using the
 * singleton bus don't see lingering hooks / subscribers.
 */
export function uninstallApprovalBusPubsubForTests(): void {
  setApprovalEventEmitHook(null);
  _inRelayedEmit = false;
}
