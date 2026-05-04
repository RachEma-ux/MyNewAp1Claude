/**
 * AI Agent Studio — MCP Connection State Machine (Phase 19b)
 *
 * Pure finite state machine. No I/O, no DB calls, no event emission —
 * just `transition(current, event, now) → { next, error? }`. The
 * mcp-manager.ts orchestrator owns the in-memory map of states, the
 * persistence projection (status column), and the event bus.
 *
 * States (discriminated union by `kind`):
 *   pending     — never tried to connect
 *   connecting  — connect attempt in flight
 *   connected   — live and serving tools
 *   needs_auth  — server requires OAuth and we don't have valid tokens
 *   failed      — last attempt failed; carries backoff data
 *   disabled    — user explicitly turned off; blocks every transition
 *
 * Events:
 *   connect_requested        — user clicked Connect or auto-reconnect ticked
 *   connect_succeeded        — transport handshake completed
 *   connect_failed           — transport handshake failed
 *   auth_required            — server returned 401 / OAuth challenge
 *   auth_provided            — OAuth flow completed; retry connect
 *   disconnect_requested     — user clicked Disconnect
 *   mid_session_disconnect   — connection died after being established
 *   disable_requested        — user toggled the row off
 *   enable_requested         — user toggled the row back on
 *
 * Backoff: each connecting → failed transition increments `attemptCount`
 * and computes `nextRetryAt = lastAttemptAt + min(2^attemptCount, 5min) * 1s`.
 * Matches the existing reconnect math in mcp-manager.ts (Phase 17e).
 *
 * Decision #6: illegal transitions throw in dev mode (catches FSM bugs
 * early) and log + stay-at-current-state in prod mode (never crashes).
 */

import type { ConnectionState, ConnectionEvent } from "./types";

// ── Constants ──────────────────────────────────────────────────────────────

const RECONNECT_MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 min cap
/**
 * MCP hardening Phase 2.2: how many failed attempts before we give up
 * automatically. After this many `connect_failed` events in a row,
 * the FSM moves to `abandoned` instead of staying in `failed`. The
 * auto-reconnect loop ignores abandoned rows; only an explicit user
 * retry brings them back.
 */
export const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Compute the next retry delay for a failed attempt.
 * Mirrors mcp-manager.ts:75 (Phase 17e auto-reconnect math).
 */
export function computeBackoff(attemptCount: number): number {
  return Math.min(
    1000 * Math.pow(2, Math.max(0, attemptCount)),
    RECONNECT_MAX_BACKOFF_MS
  );
}

// ── Transition result ──────────────────────────────────────────────────────

export interface TransitionResult {
  next: ConnectionState;
  /** True when the input event was illegal for the current state */
  illegal?: boolean;
  /** Human-readable reason when illegal */
  reason?: string;
}

// ── Pure transition function ───────────────────────────────────────────────

/**
 * Compute the next state given a current state + event.
 *
 * Pure function — same inputs always produce the same output. Time is
 * passed via `now` so tests can use a fixed clock.
 */
export function transition(
  current: ConnectionState,
  event: ConnectionEvent,
  now: number = Date.now()
): TransitionResult {
  switch (current.kind) {
    // ── pending ──
    case "pending": {
      switch (event.type) {
        case "connect_requested":
          return {
            next: { kind: "connecting", startedAt: now, attemptCount: 0 },
          };
        case "disable_requested":
          return { next: { kind: "disabled", disabledAt: now } };
        default:
          return illegal(current, event);
      }
    }

    // ── connecting ──
    case "connecting": {
      switch (event.type) {
        case "connect_succeeded":
          return {
            next: {
              kind: "connected",
              connectedAt: now,
              toolCount: event.toolCount,
              promptCount: event.promptCount,
              resourceCount: event.resourceCount,
            },
          };
        case "connect_failed": {
          const newAttemptCount = current.attemptCount + 1;
          // Phase 2.2: give up after MAX_RECONNECT_ATTEMPTS in a row
          if (newAttemptCount >= MAX_RECONNECT_ATTEMPTS) {
            return {
              next: {
                kind: "abandoned",
                reason: event.reason,
                lastAttemptAt: now,
                attemptCount: newAttemptCount,
              },
            };
          }
          return {
            next: {
              kind: "failed",
              reason: event.reason,
              lastAttemptAt: now,
              attemptCount: newAttemptCount,
              nextRetryAt: now + computeBackoff(newAttemptCount),
            },
          };
        }
        case "auth_required":
          return {
            next: {
              kind: "needs_auth",
              reason: event.reason,
              authUrl: event.authUrl,
              challengeReceivedAt: now,
            },
          };
        case "disconnect_requested":
          return { next: { kind: "pending" } };
        case "mid_session_disconnect": {
          // Treat a disconnect during the connect handshake as a connect failure
          const newAttemptCount = current.attemptCount + 1;
          if (newAttemptCount >= MAX_RECONNECT_ATTEMPTS) {
            return {
              next: {
                kind: "abandoned",
                reason: event.reason || "disconnected during connect",
                lastAttemptAt: now,
                attemptCount: newAttemptCount,
              },
            };
          }
          return {
            next: {
              kind: "failed",
              reason: event.reason || "disconnected during connect",
              lastAttemptAt: now,
              attemptCount: newAttemptCount,
              nextRetryAt: now + computeBackoff(newAttemptCount),
            },
          };
        }
        case "disable_requested":
          return { next: { kind: "disabled", disabledAt: now } };
        default:
          return illegal(current, event);
      }
    }

    // ── connected ──
    case "connected": {
      switch (event.type) {
        case "mid_session_disconnect":
          return {
            next: {
              kind: "failed",
              reason: event.reason,
              lastAttemptAt: now,
              attemptCount: 1,
              nextRetryAt: now + computeBackoff(1),
            },
          };
        case "disconnect_requested":
          return { next: { kind: "pending" } };
        case "auth_required":
          return {
            next: {
              kind: "needs_auth",
              reason: event.reason,
              authUrl: event.authUrl,
              challengeReceivedAt: now,
            },
          };
        case "disable_requested":
          return { next: { kind: "disabled", disabledAt: now } };
        // Idempotency: connect_succeeded on already-connected updates the counts
        case "connect_succeeded":
          return {
            next: {
              kind: "connected",
              connectedAt: current.connectedAt,
              toolCount: event.toolCount,
              promptCount: event.promptCount,
              resourceCount: event.resourceCount,
            },
          };
        default:
          return illegal(current, event);
      }
    }

    // ── needs_auth ──
    case "needs_auth": {
      switch (event.type) {
        case "auth_provided":
          return {
            next: { kind: "connecting", startedAt: now, attemptCount: 0 },
          };
        case "disconnect_requested":
          return { next: { kind: "pending" } };
        case "disable_requested":
          return { next: { kind: "disabled", disabledAt: now } };
        default:
          return illegal(current, event);
      }
    }

    // ── failed ──
    case "failed": {
      switch (event.type) {
        case "connect_requested":
          // Manual or auto-reconnect retry. Carry forward the attemptCount —
          // it gets incremented again on the next failure.
          return {
            next: {
              kind: "connecting",
              startedAt: now,
              attemptCount: current.attemptCount,
            },
          };
        case "disable_requested":
          return { next: { kind: "disabled", disabledAt: now } };
        default:
          return illegal(current, event);
      }
    }

    // ── abandoned (Phase 2.2) ──
    // Reached after MAX_RECONNECT_ATTEMPTS consecutive failures. Auto-
    // reconnect skips this state; only an explicit user action moves out.
    case "abandoned": {
      switch (event.type) {
        case "connect_requested":
          // Manual retry — reset attemptCount so the user gets a fresh
          // budget rather than failing immediately on the next slip.
          return {
            next: {
              kind: "connecting",
              startedAt: now,
              attemptCount: 0,
            },
          };
        case "disable_requested":
          return { next: { kind: "disabled", disabledAt: now } };
        default:
          return illegal(current, event);
      }
    }

    // ── disabled ──
    case "disabled": {
      switch (event.type) {
        case "enable_requested":
          return { next: { kind: "pending" } };
        default:
          return illegal(current, event);
      }
    }
  }
}

// ── Illegal-transition handling ────────────────────────────────────────────

function illegal(
  current: ConnectionState,
  event: ConnectionEvent
): TransitionResult {
  return {
    next: current,
    illegal: true,
    reason: `Illegal MCP transition: ${event.type} from ${current.kind}`,
  };
}

/**
 * Apply a transition with the dev/prod policy from decision #6:
 *  - dev:  illegal transitions throw (catches bugs early in development)
 *  - prod: illegal transitions log + stay at current state (never crashes)
 *
 * Wraps `transition()` so callers don't have to repeat the policy.
 */
export function applyTransition(
  current: ConnectionState,
  event: ConnectionEvent,
  options: {
    now?: number;
    devMode?: boolean;
    onIllegal?: (reason: string) => void;
  } = {}
): ConnectionState {
  const result = transition(current, event, options.now);
  if (result.illegal) {
    const isDev =
      options.devMode ?? process.env.NODE_ENV !== "production";
    options.onIllegal?.(result.reason ?? "illegal transition");
    if (isDev) {
      throw new Error(result.reason ?? "Illegal MCP state transition");
    }
    // Prod: stay at current state, swallow the error
    return current;
  }
  return result.next;
}

// ── Persistence projection ─────────────────────────────────────────────────

/**
 * Project the rich `ConnectionState` to the string value persisted in
 * `agsDraftMcpServers.status`. Backward-compatible with the existing
 * column values used by Phase 7-17:
 *
 *   pending    → "pending"     (existing)
 *   connecting → "connecting"  (NEW — additive, no schema change)
 *   connected  → "connected"   (existing)
 *   needs_auth → "needs_auth"  (NEW — additive)
 *   failed     → "error"       (mapped to existing value to avoid breaking
 *                              the auto-reconnect loop check at mcp-manager
 *                              .ts line 67)
 *   disabled   → "disabled"    (NEW — additive)
 *
 * Decision #2a: backward compat. Decision #6: column constraint isn't
 * a CHECK so the new values are accepted as-is.
 */
export function projectStateToColumn(
  state: ConnectionState
):
  | "pending"
  | "connecting"
  | "connected"
  | "needs_auth"
  | "error"
  | "abandoned"
  | "disabled" {
  switch (state.kind) {
    case "pending":
      return "pending";
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "needs_auth":
      return "needs_auth";
    case "failed":
      return "error";
    case "abandoned":
      return "abandoned";
    case "disabled":
      return "disabled";
  }
}
