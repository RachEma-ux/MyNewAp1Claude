/**
 * Phase L §T-L.4 — `summarizeApprovalSteps` lockstep.
 *
 * Generic-accessor row-state aggregator over the agsApprovalSteps
 * surface. 10th instantiation of the lesson-30 aggregator-pair
 * pattern in the post-compaction resume window.
 */

import { describe, expect, it } from "vitest";
import {
  APPROVAL_STEP_OUTCOMES,
  summarizeApprovalSteps,
} from "../../server/agent-studio/services/retention/approval-step-summary.js";
import {
  APPROVAL_STEP_STATES,
  APPROVAL_STEP_STATE_METADATA,
} from "../../server/agent-studio/services/retention/lifecycle-state-vocab.js";

interface FakeRow {
  state: string;
}

const getState = (r: FakeRow) => r.state;

describe("summarizeApprovalSteps — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeApprovalSteps<FakeRow>([], getState);
    expect(s.total).toBe(0);
    expect(s.terminalCount).toBe(0);
    expect(s.inFlightCount).toBe(0);
    expect(s.unknownStateCount).toBe(0);
    expect(s.acceptanceRate).toBeNull();
  });

  it("byState carries every closed state at 0 (stable shape)", () => {
    const s = summarizeApprovalSteps<FakeRow>([], getState);
    for (const state of APPROVAL_STEP_STATES) {
      expect(s.byState[state]).toBe(0);
    }
  });

  it("byOutcome carries every closed outcome at 0 (stable shape)", () => {
    const s = summarizeApprovalSteps<FakeRow>([], getState);
    for (const outcome of APPROVAL_STEP_OUTCOMES) {
      expect(s.byOutcome[outcome]).toBe(0);
    }
  });
});

describe("summarizeApprovalSteps — state partition", () => {
  it("counts each state correctly", () => {
    const s = summarizeApprovalSteps<FakeRow>(
      APPROVAL_STEP_STATES.map((state) => ({ state }) as FakeRow),
      getState,
    );
    for (const state of APPROVAL_STEP_STATES) {
      expect(s.byState[state]).toBe(1);
    }
    expect(s.total).toBe(APPROVAL_STEP_STATES.length);
  });

  it("terminal + inFlight + unknown sums to total", () => {
    const s = summarizeApprovalSteps<FakeRow>(
      [
        { state: "pending" },
        { state: "approved" },
        { state: "rejected" },
        { state: "garbage" },
      ] as FakeRow[],
      getState,
    );
    expect(s.terminalCount).toBe(2); // approved + rejected
    expect(s.inFlightCount).toBe(1); // pending
    expect(s.unknownStateCount).toBe(1);
    expect(
      s.terminalCount + s.inFlightCount + s.unknownStateCount,
    ).toBe(s.total);
  });
});

describe("summarizeApprovalSteps — outcome partition", () => {
  it("byOutcome mirrors state mapping via APPROVAL_STEP_STATE_METADATA", () => {
    const s = summarizeApprovalSteps<FakeRow>(
      APPROVAL_STEP_STATES.map((state) => ({ state }) as FakeRow),
      getState,
    );
    // Each state contributes exactly 1 to its declared outcome.
    for (const state of APPROVAL_STEP_STATES) {
      const expectedOutcome = APPROVAL_STEP_STATE_METADATA[state].outcome;
      // pending → awaiting, approved → accepted, rejected → declined, ...
      // Each row goes through getState → state in closed set → outcome bucket.
      expect(s.byOutcome[expectedOutcome]).toBeGreaterThan(0);
    }
  });

  it("byOutcome sums to total - unknownStateCount", () => {
    const s = summarizeApprovalSteps<FakeRow>(
      [
        { state: "pending" },
        { state: "approved" },
        { state: "skipped" },
        { state: "unknown_state" },
      ] as FakeRow[],
      getState,
    );
    let sum = 0;
    for (const o of APPROVAL_STEP_OUTCOMES) sum += s.byOutcome[o];
    expect(sum).toBe(s.total - s.unknownStateCount);
  });
});

describe("summarizeApprovalSteps — acceptance rate", () => {
  it("null when no decision-recorded rows", () => {
    const s = summarizeApprovalSteps<FakeRow>(
      [
        { state: "pending" },
        { state: "skipped" },
        { state: "expired" },
        { state: "cancelled" },
      ] as FakeRow[],
      getState,
    );
    expect(s.acceptanceRate).toBeNull();
  });

  it("100% when all decisions accepted", () => {
    const s = summarizeApprovalSteps<FakeRow>(
      [{ state: "approved" }, { state: "approved" }] as FakeRow[],
      getState,
    );
    expect(s.acceptanceRate).toBe(100);
  });

  it("0% when all decisions declined", () => {
    const s = summarizeApprovalSteps<FakeRow>(
      [{ state: "rejected" }, { state: "rejected" }] as FakeRow[],
      getState,
    );
    expect(s.acceptanceRate).toBe(0);
  });

  it("excludes skipped/expired/cancelled/obsolete from rate denominator", () => {
    const s = summarizeApprovalSteps<FakeRow>(
      [
        { state: "approved" },
        { state: "approved" },
        { state: "rejected" },
        { state: "skipped" }, // excluded
        { state: "expired" }, // excluded
        { state: "cancelled" }, // excluded
        { state: "superseded" }, // excluded (maps to obsolete outcome)
      ] as FakeRow[],
      getState,
    );
    // 2 / (2 + 1) = 66.7
    expect(s.acceptanceRate).toBe(66.7);
  });

  it("excludes pending from rate denominator", () => {
    const s = summarizeApprovalSteps<FakeRow>(
      [
        { state: "approved" },
        { state: "rejected" },
        { state: "pending" }, // excluded
      ] as FakeRow[],
      getState,
    );
    expect(s.acceptanceRate).toBe(50);
  });
});

describe("summarizeApprovalSteps — schema-drift detection", () => {
  it("partitions unknown states out of byState and byOutcome", () => {
    const s = summarizeApprovalSteps<FakeRow>(
      [
        { state: "approved" },
        { state: "future_state_we_dont_know" },
      ] as FakeRow[],
      getState,
    );
    expect(s.unknownStateCount).toBe(1);
    expect(s.byState.approved).toBe(1);
    let stateSum = 0;
    for (const state of APPROVAL_STEP_STATES) stateSum += s.byState[state];
    expect(stateSum).toBe(1); // approved only; unknown didn't bucket
    let outcomeSum = 0;
    for (const o of APPROVAL_STEP_OUTCOMES) outcomeSum += s.byOutcome[o];
    expect(outcomeSum).toBe(1);
  });
});

describe("APPROVAL_STEP_OUTCOMES — closed-taxonomy invariant", () => {
  it("contains exactly 7 outcome values", () => {
    expect(APPROVAL_STEP_OUTCOMES.length).toBe(7);
  });

  it("matches the outcome values appearing in APPROVAL_STEP_STATE_METADATA", () => {
    const outcomesFromMetadata = new Set(
      APPROVAL_STEP_STATES.map(
        (s) => APPROVAL_STEP_STATE_METADATA[s].outcome,
      ),
    );
    expect(new Set(APPROVAL_STEP_OUTCOMES)).toEqual(outcomesFromMetadata);
  });
});
