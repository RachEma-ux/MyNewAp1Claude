import { describe, expect, it } from "vitest";

import {
  listLifecycleHoldsForEntity,
  releaseLifecycleHold,
  setLifecycleHold,
} from "./lifecycle-holds-management";

describe("setLifecycleHold — input validation", () => {
  it("throws when entityType is empty", async () => {
    await expect(
      setLifecycleHold({
        entityType: "",
        entityId: 1,
        holdType: "legal_hold",
        reason: "test",
        setBy: 1,
      }),
    ).rejects.toThrow(/entityType is required/);
  });

  it("throws when entityType is whitespace-only", async () => {
    await expect(
      setLifecycleHold({
        entityType: "   ",
        entityId: 1,
        holdType: "legal_hold",
        reason: "test",
        setBy: 1,
      }),
    ).rejects.toThrow(/entityType is required/);
  });

  it("throws when holdType is empty", async () => {
    await expect(
      setLifecycleHold({
        entityType: "ags_publish_requests",
        entityId: 1,
        holdType: "",
        reason: "test",
        setBy: 1,
      }),
    ).rejects.toThrow(/holdType is required/);
  });

  it("throws when reason is empty (no anonymous holds)", async () => {
    await expect(
      setLifecycleHold({
        entityType: "ags_publish_requests",
        entityId: 1,
        holdType: "legal_hold",
        reason: "",
        setBy: 1,
      }),
    ).rejects.toThrow(/reason is required/);
  });

  it("throws when holdUntil is in the past relative to now", async () => {
    const now = new Date("2026-05-13T00:00:00Z");
    await expect(
      setLifecycleHold(
        {
          entityType: "ags_publish_requests",
          entityId: 1,
          holdType: "legal_hold",
          reason: "test",
          setBy: 1,
          holdUntil: new Date("2026-01-01T00:00:00Z"),
        },
        { now },
      ),
    ).rejects.toThrow(/holdUntil .* must be in the future/);
  });

  it("throws when holdUntil equals now (must be strictly future)", async () => {
    const now = new Date("2026-05-13T00:00:00Z");
    await expect(
      setLifecycleHold(
        {
          entityType: "ags_publish_requests",
          entityId: 1,
          holdType: "legal_hold",
          reason: "test",
          setBy: 1,
          holdUntil: now,
        },
        { now },
      ),
    ).rejects.toThrow(/holdUntil .* must be in the future/);
  });

  it("returns set:false when ASDB is null but inputs are valid", async () => {
    const result = await setLifecycleHold(
      {
        entityType: "ags_publish_requests",
        entityId: 1,
        holdType: "legal_hold",
        reason: "test",
        setBy: 1,
      },
      { getDb: () => null as unknown as ReturnType<typeof import("../../db/connection").getAsDb> },
    );
    expect(result).toEqual({ set: false, holdId: null });
  });

  it("accepts holdUntil in the future", async () => {
    const now = new Date("2026-05-13T00:00:00Z");
    const future = new Date("2026-12-31T00:00:00Z");
    // ASDB null — but validation should pass (no throw)
    const result = await setLifecycleHold(
      {
        entityType: "ags_publish_requests",
        entityId: 1,
        holdType: "legal_hold",
        reason: "test",
        setBy: 1,
        holdUntil: future,
      },
      {
        now,
        getDb: () => null as unknown as ReturnType<typeof import("../../db/connection").getAsDb>,
      },
    );
    expect(result.set).toBe(false);
  });
});

describe("releaseLifecycleHold — input validation", () => {
  it("throws when releaseNote is empty", async () => {
    await expect(
      releaseLifecycleHold({ holdId: 1, releasedBy: 1, releaseNote: "" }),
    ).rejects.toThrow(/releaseNote is required/);
  });

  it("throws when releaseNote is whitespace-only", async () => {
    await expect(
      releaseLifecycleHold({ holdId: 1, releasedBy: 1, releaseNote: "   " }),
    ).rejects.toThrow(/releaseNote is required/);
  });

  it("returns released:false when ASDB is null", async () => {
    const result = await releaseLifecycleHold(
      { holdId: 1, releasedBy: 1, releaseNote: "test release" },
      { getDb: () => null as unknown as ReturnType<typeof import("../../db/connection").getAsDb> },
    );
    expect(result).toEqual({ released: false, holdId: 1, releasedAt: null });
  });
});

describe("listLifecycleHoldsForEntity — fail-soft", () => {
  it("returns empty array when ASDB is null", async () => {
    const result = await listLifecycleHoldsForEntity(
      { entityType: "ags_publish_requests", entityId: 1 },
      { getDb: () => null as unknown as ReturnType<typeof import("../../db/connection").getAsDb> },
    );
    expect(result).toEqual([]);
  });
});
