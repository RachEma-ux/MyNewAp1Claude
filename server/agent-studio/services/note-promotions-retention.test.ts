import { describe, expect, it } from "vitest";

import { pruneNotePromotionsRetention } from "./note-promotions-retention";

describe("pruneNotePromotionsRetention — fail-soft + short-circuit", () => {
  const RETENTION_CUTOFF = new Date("2026-04-13T00:00:00Z");

  it("returns zero-counts when ASDB is null", async () => {
    const result = await pruneNotePromotionsRetention(
      { olderThan: RETENTION_CUTOFF },
      { getDb: () => null as unknown as ReturnType<typeof import("../db/connection").getAsDb> },
    );
    expect(result.deletedCount).toBe(0);
    expect(result.preservedCount).toBe(0);
    expect(result.blockerCounts).toEqual({});
    expect(result.cascadeDeletedCounts).toEqual({ versions: 0, decisions: 0, auditEvents: 0 });
  });

  it("short-circuits BEFORE the ASDB probe on empty promotionKind array", async () => {
    let dbProbed = false;
    const result = await pruneNotePromotionsRetention(
      { olderThan: RETENTION_CUTOFF, promotionKind: [] },
      {
        getDb: () => {
          dbProbed = true;
          return null as unknown as ReturnType<typeof import("../db/connection").getAsDb>;
        },
      },
    );
    expect(result.deletedCount).toBe(0);
    expect(dbProbed).toBe(false);
  });

  it("scalar promotionKind reaches the ASDB probe", async () => {
    let dbProbed = false;
    await pruneNotePromotionsRetention(
      { olderThan: RETENTION_CUTOFF, promotionKind: "knowledge_unit" },
      {
        getDb: () => {
          dbProbed = true;
          return null as unknown as ReturnType<typeof import("../db/connection").getAsDb>;
        },
      },
    );
    expect(dbProbed).toBe(true);
  });

  it("non-empty promotionKind array reaches the ASDB probe", async () => {
    let dbProbed = false;
    await pruneNotePromotionsRetention(
      { olderThan: RETENTION_CUTOFF, promotionKind: ["knowledge_unit", "graph_skill_pack"] },
      {
        getDb: () => {
          dbProbed = true;
          return null as unknown as ReturnType<typeof import("../db/connection").getAsDb>;
        },
      },
    );
    expect(dbProbed).toBe(true);
  });
});
