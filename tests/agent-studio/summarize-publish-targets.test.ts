/**
 * Phase X §T-X.7 — `summarizePublishTargets` lockstep.
 *
 * Stable-shape row-state aggregator over `PublishTargetRecord[]`.
 * 7th instantiation of the lesson-30 aggregator-pair pattern in the
 * post-compaction resume window.
 */

import { describe, expect, it } from "vitest";
import { summarizePublishTargets } from "../../server/agent-studio/services/publish-targets/publish-target-summary.js";
import {
  PUBLISH_TARGET_TYPES,
  type PublishTargetRecord,
  type PublishTargetType,
} from "../../server/agent-studio/services/publish-targets/types.js";

function makeTarget(
  overrides: Partial<PublishTargetRecord> = {},
): PublishTargetRecord {
  return {
    id: 1,
    targetKey: "test",
    targetType: PUBLISH_TARGET_TYPES[0] as PublishTargetType,
    endpoint: "https://example.invalid",
    providerConnectionId: null,
    config: null,
    enabled: true,
    ...overrides,
  };
}

describe("summarizePublishTargets — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizePublishTargets([]);
    expect(s.total).toBe(0);
    expect(s.enabledCount).toBe(0);
    expect(s.disabledCount).toBe(0);
    expect(s.enabledPercent).toBe(0);
    expect(s.withProviderConnectionCount).toBe(0);
    expect(s.withProviderConnectionPercent).toBe(0);
    expect(s.withConfigCount).toBe(0);
  });

  it("byTargetType carries every closed type at 0 (stable shape)", () => {
    const s = summarizePublishTargets([]);
    for (const t of PUBLISH_TARGET_TYPES) {
      expect(s.byTargetType[t]).toBe(0);
    }
  });

  it("never returns NaN on empty (defensive)", () => {
    const s = summarizePublishTargets([]);
    expect(Number.isNaN(s.enabledPercent)).toBe(false);
    expect(Number.isNaN(s.withProviderConnectionPercent)).toBe(false);
  });
});

describe("summarizePublishTargets — single record", () => {
  it("counts a single enabled target on the correct axes", () => {
    const s = summarizePublishTargets([
      makeTarget({
        targetType: PUBLISH_TARGET_TYPES[0] as PublishTargetType,
        enabled: true,
        providerConnectionId: 7,
        config: { setting: "value" },
      }),
    ]);
    expect(s.total).toBe(1);
    expect(s.byTargetType[PUBLISH_TARGET_TYPES[0]]).toBe(1);
    expect(s.enabledCount).toBe(1);
    expect(s.disabledCount).toBe(0);
    expect(s.enabledPercent).toBe(100);
    expect(s.withProviderConnectionCount).toBe(1);
    expect(s.withConfigCount).toBe(1);
  });
});

describe("summarizePublishTargets — mixed batch", () => {
  it("partitions enabled vs disabled correctly", () => {
    const s = summarizePublishTargets([
      makeTarget({ enabled: true }),
      makeTarget({ enabled: true }),
      makeTarget({ enabled: false }),
      makeTarget({ enabled: false }),
    ]);
    expect(s.enabledCount).toBe(2);
    expect(s.disabledCount).toBe(2);
    expect(s.enabledPercent).toBe(50);
  });

  it("withProviderConnection gauge counts non-null only", () => {
    const s = summarizePublishTargets([
      makeTarget({ providerConnectionId: null }),
      makeTarget({ providerConnectionId: 0 }),
      makeTarget({ providerConnectionId: 1 }),
    ]);
    // providerConnectionId === 0 is non-null (0 is a valid id).
    expect(s.withProviderConnectionCount).toBe(2);
  });

  it("withConfig gauge counts non-null only", () => {
    const s = summarizePublishTargets([
      makeTarget({ config: null }),
      makeTarget({ config: {} }),
      makeTarget({ config: { x: 1 } }),
    ]);
    expect(s.withConfigCount).toBe(2);
  });

  it("byTargetType counts each type bucket correctly", () => {
    const s = summarizePublishTargets(
      PUBLISH_TARGET_TYPES.map(
        (t) =>
          makeTarget({ targetType: t as PublishTargetType }) as PublishTargetRecord,
      ),
    );
    expect(s.total).toBe(PUBLISH_TARGET_TYPES.length);
    for (const t of PUBLISH_TARGET_TYPES) {
      expect(s.byTargetType[t]).toBe(1);
    }
  });
});

describe("summarizePublishTargets — invariants", () => {
  it("enabledCount + disabledCount sums to total", () => {
    const s = summarizePublishTargets([
      makeTarget({ enabled: true }),
      makeTarget({ enabled: false }),
      makeTarget({ enabled: false }),
    ]);
    expect(s.enabledCount + s.disabledCount).toBe(s.total);
  });

  it("byTargetType sums to total", () => {
    const records = PUBLISH_TARGET_TYPES.slice(0, 2).flatMap((t) => [
      makeTarget({ targetType: t as PublishTargetType }),
      makeTarget({ targetType: t as PublishTargetType }),
    ]) as PublishTargetRecord[];
    const s = summarizePublishTargets(records);
    let sum = 0;
    for (const t of PUBLISH_TARGET_TYPES) sum += s.byTargetType[t];
    expect(sum).toBe(s.total);
  });
});

describe("summarizePublishTargets — percent precision", () => {
  it("1/3 → 33.3", () => {
    const s = summarizePublishTargets([
      makeTarget({ enabled: true }),
      makeTarget({ enabled: false }),
      makeTarget({ enabled: false }),
    ]);
    expect(s.enabledPercent).toBe(33.3);
  });

  it("2/3 → 66.7", () => {
    const s = summarizePublishTargets([
      makeTarget({ enabled: true }),
      makeTarget({ enabled: true }),
      makeTarget({ enabled: false }),
    ]);
    expect(s.enabledPercent).toBe(66.7);
  });
});
