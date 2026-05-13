// formatRelative — branch coverage tests.
//
// Locks the contract: null/undefined → "never"; future → ISO;
// elapsed buckets (sec/min/hr/day) all rounded down.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatRelative } from "../../client/src/modules/agent-studio/components/format-relative";

describe("formatRelative", () => {
  // Pin Date.now() so the boundary assertions are deterministic.
  const NOW_ISO = "2026-05-13T12:00:00.000Z";
  const NOW_MS = new Date(NOW_ISO).getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'never' for null", () => {
    expect(formatRelative(null)).toBe("never");
  });

  it("returns 'never' for undefined", () => {
    expect(formatRelative(undefined)).toBe("never");
  });

  it("returns ISO string for a future date (negative elapsed)", () => {
    const future = new Date(NOW_MS + 60_000);
    expect(formatRelative(future)).toBe(future.toISOString());
  });

  it("formats seconds (<60s)", () => {
    expect(formatRelative(new Date(NOW_MS - 5_000))).toBe("5s ago");
    expect(formatRelative(new Date(NOW_MS - 59_999))).toBe("59s ago");
  });

  it("formats minutes (60s..3599s)", () => {
    expect(formatRelative(new Date(NOW_MS - 60_000))).toBe("1m ago");
    expect(formatRelative(new Date(NOW_MS - 30 * 60_000))).toBe("30m ago");
  });

  it("formats hours (60m..23h59m)", () => {
    expect(formatRelative(new Date(NOW_MS - 60 * 60_000))).toBe("1h ago");
    expect(formatRelative(new Date(NOW_MS - 23 * 60 * 60_000))).toBe("23h ago");
  });

  it("formats days (≥24h)", () => {
    expect(formatRelative(new Date(NOW_MS - 24 * 60 * 60_000))).toBe("1d ago");
    expect(formatRelative(new Date(NOW_MS - 7 * 24 * 60 * 60_000))).toBe("7d ago");
  });

  it("accepts ISO string input", () => {
    const fiveMinAgo = new Date(NOW_MS - 5 * 60_000).toISOString();
    expect(formatRelative(fiveMinAgo)).toBe("5m ago");
  });

  it("rounds down at each boundary (no off-by-one)", () => {
    // 59s → seconds bucket
    expect(formatRelative(new Date(NOW_MS - 59_000))).toBe("59s ago");
    // 60s exactly → minutes bucket
    expect(formatRelative(new Date(NOW_MS - 60_000))).toBe("1m ago");
    // 59m exactly → minutes bucket (3540s)
    expect(formatRelative(new Date(NOW_MS - 59 * 60_000))).toBe("59m ago");
    // 60m exactly → hours bucket
    expect(formatRelative(new Date(NOW_MS - 60 * 60_000))).toBe("1h ago");
  });
});
