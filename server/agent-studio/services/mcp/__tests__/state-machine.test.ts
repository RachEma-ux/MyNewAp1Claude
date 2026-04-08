/**
 * Phase 19b — Connection State Machine tests.
 *
 * Pure FSM, no I/O. Tests cover:
 *
 *  Legal transitions (one per cell of the transition matrix):
 *   - pending → connecting (connect_requested)
 *   - pending → disabled   (disable_requested)
 *   - connecting → connected     (connect_succeeded)
 *   - connecting → failed        (connect_failed)
 *   - connecting → needs_auth    (auth_required)
 *   - connecting → pending       (disconnect_requested)
 *   - connecting → failed        (mid_session_disconnect)
 *   - connecting → disabled      (disable_requested)
 *   - connected → failed         (mid_session_disconnect)
 *   - connected → pending        (disconnect_requested)
 *   - connected → needs_auth     (auth_required)
 *   - connected → disabled       (disable_requested)
 *   - connected → connected (idempotent connect_succeeded)
 *   - needs_auth → connecting    (auth_provided)
 *   - needs_auth → pending       (disconnect_requested)
 *   - needs_auth → disabled      (disable_requested)
 *   - failed → connecting        (connect_requested)
 *   - failed → disabled          (disable_requested)
 *   - disabled → pending         (enable_requested)
 *
 *  Additional behavior:
 *   - Backoff math: failed.attemptCount + nextRetryAt
 *   - Connecting state carries attemptCount across failed → connecting
 *   - Illegal transitions throw in dev (default mode)
 *   - Illegal transitions stay-at-state in prod mode
 *   - Disabled blocks every event except enable_requested
 *   - Persistence projection maps every state.kind to a string
 *   - computeBackoff matches the expected exponential pattern
 */

import { describe, it, expect } from "vitest";
import {
  transition,
  applyTransition,
  computeBackoff,
  projectStateToColumn,
} from "../state-machine";
import type { ConnectionState, ConnectionEvent } from "../types";

const NOW = 1_700_000_000_000;

// ── Transition matrix — every legal transition ─────────────────────────────

describe("transition: pending →", () => {
  it("connecting on connect_requested", () => {
    const r = transition(
      { kind: "pending" },
      { type: "connect_requested" },
      NOW
    );
    expect(r.illegal).toBeUndefined();
    expect(r.next).toEqual({
      kind: "connecting",
      startedAt: NOW,
      attemptCount: 0,
    });
  });

  it("disabled on disable_requested", () => {
    const r = transition(
      { kind: "pending" },
      { type: "disable_requested" },
      NOW
    );
    expect(r.next).toEqual({ kind: "disabled", disabledAt: NOW });
  });
});

describe("transition: connecting →", () => {
  const cur: ConnectionState = {
    kind: "connecting",
    startedAt: NOW - 100,
    attemptCount: 0,
  };

  it("connected on connect_succeeded", () => {
    const r = transition(
      cur,
      {
        type: "connect_succeeded",
        toolCount: 5,
        promptCount: 2,
        resourceCount: 3,
      },
      NOW
    );
    expect(r.next).toEqual({
      kind: "connected",
      connectedAt: NOW,
      toolCount: 5,
      promptCount: 2,
      resourceCount: 3,
    });
  });

  it("failed on connect_failed (with backoff)", () => {
    const r = transition(
      cur,
      { type: "connect_failed", reason: "ECONNREFUSED" },
      NOW
    );
    expect(r.next.kind).toBe("failed");
    if (r.next.kind === "failed") {
      expect(r.next.reason).toBe("ECONNREFUSED");
      expect(r.next.attemptCount).toBe(1);
      expect(r.next.lastAttemptAt).toBe(NOW);
      expect(r.next.nextRetryAt).toBe(NOW + computeBackoff(1));
    }
  });

  it("needs_auth on auth_required", () => {
    const r = transition(
      cur,
      {
        type: "auth_required",
        reason: "401 unauthorized",
        authUrl: "https://example.com/oauth",
      },
      NOW
    );
    expect(r.next).toEqual({
      kind: "needs_auth",
      reason: "401 unauthorized",
      authUrl: "https://example.com/oauth",
      challengeReceivedAt: NOW,
    });
  });

  it("pending on disconnect_requested", () => {
    const r = transition(cur, { type: "disconnect_requested" }, NOW);
    expect(r.next).toEqual({ kind: "pending" });
  });

  it("failed on mid_session_disconnect (treated as connect failure)", () => {
    const r = transition(
      cur,
      { type: "mid_session_disconnect", reason: "socket closed" },
      NOW
    );
    expect(r.next.kind).toBe("failed");
    if (r.next.kind === "failed") {
      expect(r.next.attemptCount).toBe(1);
    }
  });

  it("disabled on disable_requested", () => {
    const r = transition(cur, { type: "disable_requested" }, NOW);
    expect(r.next).toEqual({ kind: "disabled", disabledAt: NOW });
  });
});

describe("transition: connected →", () => {
  const cur: ConnectionState = {
    kind: "connected",
    connectedAt: NOW - 5_000,
    toolCount: 3,
    promptCount: 1,
    resourceCount: 0,
  };

  it("failed on mid_session_disconnect (with backoff)", () => {
    const r = transition(
      cur,
      { type: "mid_session_disconnect", reason: "EPIPE" },
      NOW
    );
    expect(r.next.kind).toBe("failed");
    if (r.next.kind === "failed") {
      expect(r.next.attemptCount).toBe(1);
      expect(r.next.nextRetryAt).toBe(NOW + computeBackoff(1));
    }
  });

  it("pending on disconnect_requested", () => {
    const r = transition(cur, { type: "disconnect_requested" }, NOW);
    expect(r.next).toEqual({ kind: "pending" });
  });

  it("needs_auth on auth_required (mid-session token expired)", () => {
    const r = transition(
      cur,
      { type: "auth_required", reason: "token expired" },
      NOW
    );
    expect(r.next.kind).toBe("needs_auth");
  });

  it("disabled on disable_requested", () => {
    const r = transition(cur, { type: "disable_requested" }, NOW);
    expect(r.next.kind).toBe("disabled");
  });

  it("idempotent connect_succeeded updates the counts", () => {
    const r = transition(
      cur,
      {
        type: "connect_succeeded",
        toolCount: 10,
        promptCount: 5,
        resourceCount: 2,
      },
      NOW
    );
    expect(r.next.kind).toBe("connected");
    if (r.next.kind === "connected") {
      expect(r.next.toolCount).toBe(10);
      expect(r.next.connectedAt).toBe(cur.connectedAt); // preserved
    }
  });
});

describe("transition: needs_auth →", () => {
  const cur: ConnectionState = {
    kind: "needs_auth",
    reason: "challenge",
    challengeReceivedAt: NOW - 1_000,
  };

  it("connecting on auth_provided", () => {
    const r = transition(cur, { type: "auth_provided" }, NOW);
    expect(r.next).toEqual({
      kind: "connecting",
      startedAt: NOW,
      attemptCount: 0,
    });
  });

  it("pending on disconnect_requested", () => {
    const r = transition(cur, { type: "disconnect_requested" }, NOW);
    expect(r.next.kind).toBe("pending");
  });

  it("disabled on disable_requested", () => {
    const r = transition(cur, { type: "disable_requested" }, NOW);
    expect(r.next.kind).toBe("disabled");
  });
});

describe("transition: failed →", () => {
  const cur: ConnectionState = {
    kind: "failed",
    reason: "ECONNREFUSED",
    lastAttemptAt: NOW - 60_000,
    attemptCount: 2,
    nextRetryAt: NOW - 1_000,
  };

  it("connecting on connect_requested (carries attemptCount)", () => {
    const r = transition(cur, { type: "connect_requested" }, NOW);
    expect(r.next.kind).toBe("connecting");
    if (r.next.kind === "connecting") {
      expect(r.next.attemptCount).toBe(2); // carried forward
      expect(r.next.startedAt).toBe(NOW);
    }
  });

  it("disabled on disable_requested", () => {
    const r = transition(cur, { type: "disable_requested" }, NOW);
    expect(r.next.kind).toBe("disabled");
  });
});

describe("transition: disabled →", () => {
  const cur: ConnectionState = { kind: "disabled", disabledAt: NOW - 10_000 };

  it("pending on enable_requested", () => {
    const r = transition(cur, { type: "enable_requested" }, NOW);
    expect(r.next).toEqual({ kind: "pending" });
  });

  it("blocks every other event as illegal", () => {
    const events: ConnectionEvent[] = [
      { type: "connect_requested" },
      {
        type: "connect_succeeded",
        toolCount: 1,
        promptCount: 0,
        resourceCount: 0,
      },
      { type: "connect_failed", reason: "x" },
      { type: "auth_required", reason: "x" },
      { type: "auth_provided" },
      { type: "disconnect_requested" },
      { type: "mid_session_disconnect", reason: "x" },
      { type: "disable_requested" },
    ];
    for (const ev of events) {
      const r = transition(cur, ev, NOW);
      expect(r.illegal).toBe(true);
      expect(r.next).toEqual(cur); // stay at current
    }
  });
});

// ── Backoff math ───────────────────────────────────────────────────────────

describe("computeBackoff", () => {
  it("returns 2^N seconds for low attempt counts", () => {
    expect(computeBackoff(1)).toBe(2_000); // 2^1 * 1000
    expect(computeBackoff(2)).toBe(4_000);
    expect(computeBackoff(3)).toBe(8_000);
    expect(computeBackoff(4)).toBe(16_000);
  });

  it("caps at 5 minutes", () => {
    expect(computeBackoff(20)).toBe(5 * 60 * 1000);
    expect(computeBackoff(100)).toBe(5 * 60 * 1000);
  });

  it("handles 0 attempts gracefully", () => {
    expect(computeBackoff(0)).toBe(1_000); // 2^0 * 1000 = 1s
  });
});

describe("backoff escalation across multiple failures", () => {
  it("attemptCount increments on each connecting → failed cycle", () => {
    let state: ConnectionState = { kind: "pending" };

    // First failure
    state = transition(state, { type: "connect_requested" }, NOW).next;
    state = transition(
      state,
      { type: "connect_failed", reason: "fail 1" },
      NOW + 100
    ).next;
    expect(state.kind).toBe("failed");
    if (state.kind === "failed") expect(state.attemptCount).toBe(1);

    // Retry → fail again
    state = transition(state, { type: "connect_requested" }, NOW + 200).next;
    state = transition(
      state,
      { type: "connect_failed", reason: "fail 2" },
      NOW + 300
    ).next;
    if (state.kind === "failed") expect(state.attemptCount).toBe(2);

    // Retry → fail again
    state = transition(state, { type: "connect_requested" }, NOW + 400).next;
    state = transition(
      state,
      { type: "connect_failed", reason: "fail 3" },
      NOW + 500
    ).next;
    if (state.kind === "failed") expect(state.attemptCount).toBe(3);
  });
});

// ── Illegal transitions ────────────────────────────────────────────────────

describe("illegal transitions", () => {
  it("transition() returns illegal:true and stays at current state", () => {
    const r = transition(
      { kind: "pending" },
      { type: "connect_succeeded", toolCount: 1, promptCount: 0, resourceCount: 0 },
      NOW
    );
    expect(r.illegal).toBe(true);
    expect(r.next).toEqual({ kind: "pending" });
  });

  it("applyTransition throws in dev mode", () => {
    expect(() =>
      applyTransition(
        { kind: "pending" },
        {
          type: "connect_succeeded",
          toolCount: 1,
          promptCount: 0,
          resourceCount: 0,
        },
        { devMode: true }
      )
    ).toThrow(/Illegal MCP transition/);
  });

  it("applyTransition stays at current state in prod mode", () => {
    const result = applyTransition(
      { kind: "pending" },
      {
        type: "connect_succeeded",
        toolCount: 1,
        promptCount: 0,
        resourceCount: 0,
      },
      { devMode: false }
    );
    expect(result).toEqual({ kind: "pending" });
  });

  it("applyTransition calls onIllegal callback", () => {
    const reasons: string[] = [];
    applyTransition(
      { kind: "pending" },
      {
        type: "connect_succeeded",
        toolCount: 1,
        promptCount: 0,
        resourceCount: 0,
      },
      {
        devMode: false,
        onIllegal: (r) => reasons.push(r),
      }
    );
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/Illegal MCP transition/);
  });
});

// ── Persistence projection ─────────────────────────────────────────────────

describe("projectStateToColumn", () => {
  it("maps every state.kind to a column-acceptable string", () => {
    expect(projectStateToColumn({ kind: "pending" })).toBe("pending");
    expect(
      projectStateToColumn({
        kind: "connecting",
        startedAt: NOW,
        attemptCount: 0,
      })
    ).toBe("connecting");
    expect(
      projectStateToColumn({
        kind: "connected",
        connectedAt: NOW,
        toolCount: 0,
        promptCount: 0,
        resourceCount: 0,
      })
    ).toBe("connected");
    expect(
      projectStateToColumn({
        kind: "needs_auth",
        reason: "x",
        challengeReceivedAt: NOW,
      })
    ).toBe("needs_auth");
    expect(
      projectStateToColumn({
        kind: "failed",
        reason: "x",
        lastAttemptAt: NOW,
        attemptCount: 1,
      })
    ).toBe("error"); // backward compat with auto-reconnect loop
    expect(projectStateToColumn({ kind: "disabled", disabledAt: NOW })).toBe(
      "disabled"
    );
  });
});
