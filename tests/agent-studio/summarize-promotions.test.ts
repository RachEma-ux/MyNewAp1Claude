/**
 * Phase G §T-G.62 — `summarizePromotions` lockstep.
 *
 * Generic-accessor row-state aggregator over an opaque promotion-row
 * list. 9th instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import {
  summarizePromotions,
} from "../../server/agent-studio/services/promotion/promotion-summary.js";
import {
  PROMOTION_STATUSES,
  type PromotionStatus,
} from "../../server/agent-studio/services/promotion/lifecycle.js";

interface FakeRow {
  status: string;
  createdAt?: Date | null;
}

const getStatus = (r: FakeRow) => r.status;
const getCreatedAt = (r: FakeRow) => r.createdAt ?? null;

describe("summarizePromotions — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizePromotions<FakeRow>([], getStatus);
    expect(s.total).toBe(0);
    expect(s.unknownStatusCount).toBe(0);
    expect(s.terminalCount).toBe(0);
    expect(s.inFlightCount).toBe(0);
    expect(s.producedActiveVersionCount).toBe(0);
    expect(s.successRate).toBeNull();
    expect(s.ageStats).toBeNull();
  });

  it("byStatus carries every closed status at 0 (stable shape)", () => {
    const s = summarizePromotions<FakeRow>([], getStatus);
    for (const status of PROMOTION_STATUSES) {
      expect(s.byStatus[status]).toBe(0);
    }
  });
});

describe("summarizePromotions — status partition", () => {
  it("counts each status correctly", () => {
    const s = summarizePromotions<FakeRow>(
      PROMOTION_STATUSES.map((status) => ({ status }) as FakeRow),
      getStatus,
    );
    for (const status of PROMOTION_STATUSES) {
      expect(s.byStatus[status]).toBe(1);
    }
    expect(s.total).toBe(PROMOTION_STATUSES.length);
  });

  it("terminal + inFlight + unknown sums to total", () => {
    const s = summarizePromotions<FakeRow>(
      [
        { status: "pending" },
        { status: "validating" },
        { status: "in_review" },
        { status: "approved" },
        { status: "rejected" },
        { status: "rolled_back" },
        { status: "garbage" },
      ] as FakeRow[],
      getStatus,
    );
    expect(s.terminalCount).toBe(3); // approved / rejected / rolled_back
    expect(s.inFlightCount).toBe(3); // pending / validating / in_review
    expect(s.unknownStatusCount).toBe(1);
    expect(s.terminalCount + s.inFlightCount + s.unknownStatusCount).toBe(
      s.total,
    );
  });

  it("producedActiveVersionCount tracks approved only", () => {
    const s = summarizePromotions<FakeRow>(
      [
        { status: "approved" },
        { status: "approved" },
        { status: "rejected" },
        { status: "rolled_back" },
        { status: "in_review" },
      ] as FakeRow[],
      getStatus,
    );
    expect(s.producedActiveVersionCount).toBe(2);
  });
});

describe("summarizePromotions — success rate", () => {
  it("null when no decisions yet", () => {
    const s = summarizePromotions<FakeRow>(
      [
        { status: "pending" },
        { status: "validating" },
        { status: "in_review" },
      ] as FakeRow[],
      getStatus,
    );
    expect(s.successRate).toBeNull();
  });

  it("100% when all decisions approved", () => {
    const s = summarizePromotions<FakeRow>(
      [{ status: "approved" }, { status: "approved" }] as FakeRow[],
      getStatus,
    );
    expect(s.successRate).toBe(100);
  });

  it("0% when all decisions rejected", () => {
    const s = summarizePromotions<FakeRow>(
      [{ status: "rejected" }, { status: "rejected" }] as FakeRow[],
      getStatus,
    );
    expect(s.successRate).toBe(0);
  });

  it("excludes rolled_back from rate denominator (post-decision distinct)", () => {
    const s = summarizePromotions<FakeRow>(
      [
        { status: "approved" },
        { status: "approved" },
        { status: "rejected" },
        { status: "rolled_back" }, // excluded
        { status: "rolled_back" }, // excluded
      ] as FakeRow[],
      getStatus,
    );
    // 2 / (2 + 1) = 66.7
    expect(s.successRate).toBe(66.7);
  });

  it("excludes in-flight statuses from rate denominator", () => {
    const s = summarizePromotions<FakeRow>(
      [
        { status: "approved" },
        { status: "rejected" },
        { status: "pending" }, // excluded
        { status: "validating" }, // excluded
      ] as FakeRow[],
      getStatus,
    );
    expect(s.successRate).toBe(50);
  });
});

describe("summarizePromotions — age stats (optional)", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  it("ageStats null when no createdAt accessor", () => {
    const s = summarizePromotions<FakeRow>(
      [{ status: "approved", createdAt: new Date() }] as FakeRow[],
      getStatus,
    );
    expect(s.ageStats).toBeNull();
  });

  it("ageStats computed when accessor provided", () => {
    const s = summarizePromotions<FakeRow>(
      [
        {
          status: "approved",
          createdAt: new Date("2026-05-16T11:59:55Z"),
        },
        {
          status: "approved",
          createdAt: new Date("2026-05-16T11:59:50Z"),
        },
      ] as FakeRow[],
      getStatus,
      { getCreatedAt, now: NOW },
    );
    expect(s.ageStats).not.toBeNull();
    expect(s.ageStats!.count).toBe(2);
    expect(s.ageStats!.minMs).toBe(5_000);
    expect(s.ageStats!.maxMs).toBe(10_000);
    expect(s.ageStats!.meanMs).toBe(7_500);
  });

  it("ageStats skips rows where createdAt is null/undefined", () => {
    const s = summarizePromotions<FakeRow>(
      [
        {
          status: "approved",
          createdAt: new Date("2026-05-16T11:59:55Z"),
        },
        { status: "approved", createdAt: null },
        { status: "approved", createdAt: undefined },
      ] as FakeRow[],
      getStatus,
      { getCreatedAt, now: NOW },
    );
    expect(s.ageStats!.count).toBe(1);
    expect(s.ageStats!.sumMs).toBe(5_000);
  });

  it("ageStats null when all rows lack createdAt", () => {
    const s = summarizePromotions<FakeRow>(
      [
        { status: "approved", createdAt: null },
        { status: "approved", createdAt: null },
      ] as FakeRow[],
      getStatus,
      { getCreatedAt, now: NOW },
    );
    expect(s.ageStats).toBeNull();
  });
});

describe("summarizePromotions — unknown-status drift detector", () => {
  it("partitions unknown statuses out of byStatus", () => {
    const s = summarizePromotions<FakeRow>(
      [
        { status: "approved" },
        { status: "future_status_that_doesnt_exist" },
      ] as FakeRow[],
      getStatus,
    );
    expect(s.unknownStatusCount).toBe(1);
    expect(s.byStatus.approved).toBe(1);
    // The unknown row didn't bucket anywhere in byStatus.
    let sum = 0;
    for (const status of PROMOTION_STATUSES) sum += s.byStatus[status];
    expect(sum).toBe(1); // approved only
  });
});
