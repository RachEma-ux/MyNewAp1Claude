/**
 * AI Agent Studio — MCP Connection Events (Phase 19b)
 *
 * Thin wrapper around node's EventEmitter for FSM transitions. The
 * mcp-manager fires `emitTransition({ serverId, from, to, event })`
 * after every successful state machine transition; subscribers
 * (UI streams, audit log writers, future SSE endpoint) attach via
 * `onTransition(listener)`.
 *
 * Decision #9b: subscribers run ASYNCHRONOUSLY via `setImmediate`. A
 * slow listener (e.g., a DB writer) cannot block the FSM critical
 * path. The FSM transition completes synchronously; listeners fire
 * on the next tick.
 *
 * Process-local — same lifetime as the connections map in
 * mcp-manager. There is no cross-process broadcast (single-instance
 * Studio assumption from CLAUDE.md).
 */

import { EventEmitter } from "node:events";
import type { ConnectionState, ConnectionEvent } from "./types";

export interface ConnectionTransition {
  serverId: number;
  from: ConnectionState;
  to: ConnectionState;
  event: ConnectionEvent;
  ts: number;
}

const emitter = new EventEmitter();
// Reasonably high — UI subscribers + audit + future SSE could all attach
emitter.setMaxListeners(50);

const TRANSITION_EVENT = "transition";

/**
 * Subscribe to FSM transitions. Returns an unsubscribe function.
 *
 * Listeners run asynchronously (decision #9b) so a slow listener
 * doesn't block the FSM. If a listener throws, the error is
 * swallowed (never crash the FSM critical path).
 */
export function onTransition(
  listener: (t: ConnectionTransition) => void
): () => void {
  const wrapped = (t: ConnectionTransition) => {
    try {
      listener(t);
    } catch {
      // Swallow — a misbehaving subscriber shouldn't take down the FSM
    }
  };
  emitter.on(TRANSITION_EVENT, wrapped);
  return () => {
    emitter.off(TRANSITION_EVENT, wrapped);
  };
}

/**
 * Fire a transition event. Called by mcp-manager after every
 * successful FSM transition. Listeners run on the next tick
 * (decision #9b — async dispatch).
 */
export function emitTransition(t: ConnectionTransition): void {
  setImmediate(() => {
    emitter.emit(TRANSITION_EVENT, t);
  });
}

/**
 * For testing only — synchronously flush any pending listeners.
 * Wraps `setImmediate` to wait one tick. Tests use this when they
 * need to assert listener side effects after a transition.
 */
export function __flushForTests(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * For testing only — clear all subscribers between tests.
 */
export function __clearAllListenersForTests(): void {
  emitter.removeAllListeners(TRANSITION_EVENT);
}
