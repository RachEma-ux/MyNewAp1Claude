/**
 * Phase L §T-L.5 — `summarizePublishRequests` lockstep.
 *
 * Parallel to T-L.4 `summarizeApprovalSteps` (#1191) — second
 * instantiation in the T-L sibling-trio aggregator series.
 * 11th instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import {
  PUBLISH_REQUEST_OUTCOMES,
  summarizePublishRequests,
} from "../../server/agent-studio/services/retention/publish-request-summary.js";
import {
  PUBLISH_REQUEST_STATES,
  PUBLISH_REQUEST_STATE_METADATA,
} from "../../server/agent-studio/services/retention/lifecycle-state-vocab.js";

interface FakeRow {
  state: string;
}

const getState = (r: FakeRow) => r.state;

describe("summarizePublishRequests — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizePublishRequests<FakeRow>([], getState);
    expect(s.total).toBe(0);
    expect(s.terminalCount).toBe(0);
    expect(s.inFlightCount).toBe(0);
    expect(s.unknownStateCount).toBe(0);
    expect(s.acceptanceRate).toBeNull();
  });

  it("byState carries every closed state at 0 (stable shape)", () => {
    const s = summarizePublishRequests<FakeRow>([], getState);
    for (const state of PUBLISH_REQUEST_STATES) {
      expect(s.byState[state]).toBe(0);
    }
  });

  it("byOutcome carries every closed outcome at 0 (stable shape)", () => {
    const s = summarizePublishRequests<FakeRow>([], getState);
    for (const outcome of PUBLISH_REQUEST_OUTCOMES) {
      expect(s.byOutcome[outcome]).toBe(0);
    }
  });
});

describe("summarizePublishRequests — state partition", () => {
  it("counts each state correctly", () => {
    const s = summarizePublishRequests<FakeRow>(
      PUBLISH_REQUEST_STATES.map((state) => ({ state }) as FakeRow),
      getState,
    );
    for (const state of PUBLISH_REQUEST_STATES) {
      expect(s.byState[state]).toBe(1);
    }
    expect(s.total).toBe(PUBLISH_REQUEST_STATES.length);
  });

  it("terminal + inFlight + unknown sums to total", () => {
    const s = summarizePublishRequests<FakeRow>(
      [
        { state: "pending" },
        { state: "approved" },
        { state: "rejected" },
        { state: "withdrawn" },
        { state: "drift_state" },
      ] as FakeRow[],
      getState,
    );
    expect(s.terminalCount).toBe(3); // approved + rejected + withdrawn
    expect(s.inFlightCount).toBe(1); // pending
    expect(s.unknownStateCount).toBe(1);
    expect(
      s.terminalCount + s.inFlightCount + s.unknownStateCount,
    ).toBe(s.total);
  });
});

describe("summarizePublishRequests — outcome collapse", () => {
  it("cancelled and withdrawn both bucket to the withdrawn outcome", () => {
    const s = summarizePublishRequests<FakeRow>(
      [
        { state: "withdrawn" },
        { state: "cancelled" },
      ] as FakeRow[],
      getState,
    );
    expect(s.byOutcome.withdrawn).toBe(2);
  });

  it("byOutcome sums to total - unknownStateCount", () => {
    const s = summarizePublishRequests<FakeRow>(
      [
        { state: "pending" },
        { state: "approved" },
        { state: "rejected" },
        { state: "drift_state" },
      ] as FakeRow[],
      getState,
    );
    let sum = 0;
    for (const o of PUBLISH_REQUEST_OUTCOMES) sum += s.byOutcome[o];
    expect(sum).toBe(s.total - s.unknownStateCount);
  });
});

describe("summarizePublishRequests — acceptance rate", () => {
  it("null when no decision-recorded rows", () => {
    const s = summarizePublishRequests<FakeRow>(
      [
        { state: "pending" },
        { state: "withdrawn" },
        { state: "superseded" },
        { state: "failed_terminal" },
      ] as FakeRow[],
      getState,
    );
    expect(s.acceptanceRate).toBeNull();
  });

  it("100% when all decisions accepted", () => {
    const s = summarizePublishRequests<FakeRow>(
      [{ state: "approved" }, { state: "approved" }] as FakeRow[],
      getState,
    );
    expect(s.acceptanceRate).toBe(100);
  });

  it("0% when all decisions declined", () => {
    const s = summarizePublishRequests<FakeRow>(
      [{ state: "rejected" }, { state: "rejected" }] as FakeRow[],
      getState,
    );
    expect(s.acceptanceRate).toBe(0);
  });

  it("excludes withdrawn/cancelled/superseded/failed_terminal from rate denominator", () => {
    const s = summarizePublishRequests<FakeRow>(
      [
        { state: "approved" },
        { state: "approved" },
        { state: "rejected" },
        { state: "withdrawn" }, // excluded
        { state: "cancelled" }, // excluded
        { state: "superseded" }, // excluded
        { state: "failed_terminal" }, // excluded
      ] as FakeRow[],
      getState,
    );
    // 2 / (2 + 1) = 66.7
    expect(s.acceptanceRate).toBe(66.7);
  });
});

describe("summarizePublishRequests — schema-drift detection", () => {
  it("partitions unknown states out of byState and byOutcome", () => {
    const s = summarizePublishRequests<FakeRow>(
      [
        { state: "approved" },
        { state: "future_state_we_dont_know" },
      ] as FakeRow[],
      getState,
    );
    expect(s.unknownStateCount).toBe(1);
    expect(s.byState.approved).toBe(1);
    let stateSum = 0;
    for (const state of PUBLISH_REQUEST_STATES)
      stateSum += s.byState[state];
    expect(stateSum).toBe(1);
  });
});

describe("PUBLISH_REQUEST_OUTCOMES — closed-taxonomy invariant", () => {
  it("contains exactly 6 outcome values", () => {
    expect(PUBLISH_REQUEST_OUTCOMES.length).toBe(6);
  });

  it("matches the outcome values appearing in PUBLISH_REQUEST_STATE_METADATA", () => {
    const outcomesFromMetadata = new Set(
      PUBLISH_REQUEST_STATES.map(
        (s) => PUBLISH_REQUEST_STATE_METADATA[s].outcome,
      ),
    );
    expect(new Set(PUBLISH_REQUEST_OUTCOMES)).toEqual(outcomesFromMetadata);
  });
});
