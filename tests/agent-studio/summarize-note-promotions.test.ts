/**
 * Phase L §T-L.6 — `summarizeNotePromotions` lockstep.
 *
 * Completes the T-L sibling-trio aggregator series. 12th
 * instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import {
  NOTE_PROMOTION_OUTCOMES,
  summarizeNotePromotions,
} from "../../server/agent-studio/services/retention/note-promotion-summary.js";
import {
  NOTE_PROMOTION_STATES,
  NOTE_PROMOTION_STATE_METADATA,
} from "../../server/agent-studio/services/retention/lifecycle-state-vocab.js";

interface FakeRow {
  state: string;
}

const getState = (r: FakeRow) => r.state;

describe("summarizeNotePromotions — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeNotePromotions<FakeRow>([], getState);
    expect(s.total).toBe(0);
    expect(s.terminalCount).toBe(0);
    expect(s.inFlightCount).toBe(0);
    expect(s.unknownStateCount).toBe(0);
    expect(s.acceptanceRate).toBeNull();
    expect(s.revertRate).toBeNull();
  });

  it("byState carries every closed state at 0", () => {
    const s = summarizeNotePromotions<FakeRow>([], getState);
    for (const state of NOTE_PROMOTION_STATES) {
      expect(s.byState[state]).toBe(0);
    }
  });

  it("byOutcome carries every closed outcome at 0", () => {
    const s = summarizeNotePromotions<FakeRow>([], getState);
    for (const outcome of NOTE_PROMOTION_OUTCOMES) {
      expect(s.byOutcome[outcome]).toBe(0);
    }
  });
});

describe("summarizeNotePromotions — state partition", () => {
  it("counts each state correctly across the 8-state ladder", () => {
    const s = summarizeNotePromotions<FakeRow>(
      NOTE_PROMOTION_STATES.map((state) => ({ state }) as FakeRow),
      getState,
    );
    for (const state of NOTE_PROMOTION_STATES) {
      expect(s.byState[state]).toBe(1);
    }
    expect(s.total).toBe(NOTE_PROMOTION_STATES.length);
  });

  it("3 non-terminal states map to in_progress (many-to-one collapse)", () => {
    const s = summarizeNotePromotions<FakeRow>(
      [
        { state: "pending" },
        { state: "validating" },
        { state: "in_review" },
      ] as FakeRow[],
      getState,
    );
    // All 3 map to in_progress outcome.
    expect(s.byOutcome.in_progress).toBe(3);
    expect(s.inFlightCount).toBe(3);
  });

  it("terminal + inFlight + unknown sums to total", () => {
    const s = summarizeNotePromotions<FakeRow>(
      [
        { state: "pending" },
        { state: "approved" },
        { state: "rejected" },
        { state: "rolled_back" },
        { state: "garbage" },
      ] as FakeRow[],
      getState,
    );
    expect(s.terminalCount).toBe(3); // approved + rejected + rolled_back
    expect(s.inFlightCount).toBe(1); // pending
    expect(s.unknownStateCount).toBe(1);
    expect(
      s.terminalCount + s.inFlightCount + s.unknownStateCount,
    ).toBe(s.total);
  });
});

describe("summarizeNotePromotions — acceptance rate", () => {
  it("null when no decisions yet", () => {
    const s = summarizeNotePromotions<FakeRow>(
      [
        { state: "pending" },
        { state: "cancelled" },
      ] as FakeRow[],
      getState,
    );
    expect(s.acceptanceRate).toBeNull();
  });

  it("excludes rolled_back / cancelled / superseded from rate denominator", () => {
    const s = summarizeNotePromotions<FakeRow>(
      [
        { state: "approved" },
        { state: "approved" },
        { state: "rejected" },
        { state: "rolled_back" }, // excluded
        { state: "cancelled" }, // excluded
        { state: "superseded" }, // excluded
      ] as FakeRow[],
      getState,
    );
    // 2 / (2 + 1) = 66.7
    expect(s.acceptanceRate).toBe(66.7);
  });
});

describe("summarizeNotePromotions — revert rate", () => {
  it("null when no accepted/reverted rows", () => {
    const s = summarizeNotePromotions<FakeRow>(
      [
        { state: "rejected" },
        { state: "cancelled" },
      ] as FakeRow[],
      getState,
    );
    expect(s.revertRate).toBeNull();
  });

  it("0% when accepted but none reverted", () => {
    const s = summarizeNotePromotions<FakeRow>(
      [{ state: "approved" }, { state: "approved" }] as FakeRow[],
      getState,
    );
    expect(s.revertRate).toBe(0);
  });

  it("100% when all approved were later reverted (extreme case)", () => {
    const s = summarizeNotePromotions<FakeRow>(
      [
        { state: "rolled_back" },
        { state: "rolled_back" },
      ] as FakeRow[],
      getState,
    );
    expect(s.revertRate).toBe(100);
  });

  it("25% when 1 reverted out of 4 (3 still-accepted + 1 reverted)", () => {
    const s = summarizeNotePromotions<FakeRow>(
      [
        { state: "approved" },
        { state: "approved" },
        { state: "approved" },
        { state: "rolled_back" },
      ] as FakeRow[],
      getState,
    );
    // 1 / (3 + 1) = 25.0
    expect(s.revertRate).toBe(25);
  });
});

describe("summarizeNotePromotions — schema-drift detection", () => {
  it("partitions unknown states out of byState and byOutcome", () => {
    const s = summarizeNotePromotions<FakeRow>(
      [
        { state: "approved" },
        { state: "future_state_we_dont_know" },
      ] as FakeRow[],
      getState,
    );
    expect(s.unknownStateCount).toBe(1);
    expect(s.byState.approved).toBe(1);
    let stateSum = 0;
    for (const state of NOTE_PROMOTION_STATES)
      stateSum += s.byState[state];
    expect(stateSum).toBe(1);
  });
});

describe("NOTE_PROMOTION_OUTCOMES — closed-taxonomy invariant", () => {
  it("contains exactly 6 outcome values", () => {
    expect(NOTE_PROMOTION_OUTCOMES.length).toBe(6);
  });

  it("matches the outcome values appearing in NOTE_PROMOTION_STATE_METADATA", () => {
    const outcomesFromMetadata = new Set(
      NOTE_PROMOTION_STATES.map(
        (s) => NOTE_PROMOTION_STATE_METADATA[s].outcome,
      ),
    );
    expect(new Set(NOTE_PROMOTION_OUTCOMES)).toEqual(outcomesFromMetadata);
  });
});
