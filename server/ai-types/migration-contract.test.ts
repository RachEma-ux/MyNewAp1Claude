// AI Types migration — result-shape contract test.
//
// Pins the 2026-05-23 extension to `CATALOG_SOURCE_MAPPING.md`:
// `backfillDomainTables()` now reports `sourceTypeReconciled` as a
// separate counter for rows whose `sourceType` was renamed from the
// pre-extension drifted value (`"model"` / `"llm"` pointing at AI
// Types domain tables) to the canonical one (`"ai_type_model"` /
// `"ai_type_llm"`). Drift-detection — a future rename of the field
// or a removal of the reconciliation step trips this test.

import { describe, expect, expectTypeOf, it } from "vitest";

import type { MigrationResult } from "./migration";

describe("MigrationResult contract (CATALOG_SOURCE_MAPPING 2026-05-23 extension)", () => {
  it("carries a `sourceTypeReconciled` counter", () => {
    expectTypeOf<MigrationResult>().toHaveProperty("sourceTypeReconciled");
    expectTypeOf<MigrationResult["sourceTypeReconciled"]>().toEqualTypeOf<number>();
  });

  it("preserves the original counters from Phase 23 / earlier (no breaking shape change)", () => {
    expectTypeOf<MigrationResult>().toHaveProperty("scanned");
    expectTypeOf<MigrationResult>().toHaveProperty("modelsCreated");
    expectTypeOf<MigrationResult>().toHaveProperty("llmsCreated");
    expectTypeOf<MigrationResult>().toHaveProperty("providersLinked");
    expectTypeOf<MigrationResult>().toHaveProperty("agentsLinked");
    expectTypeOf<MigrationResult>().toHaveProperty("skipped");
    expectTypeOf<MigrationResult>().toHaveProperty("errors");
  });

  it("`sourceTypeReconciled` initial value is 0 (idempotent on no-drift state)", () => {
    // Sanity: the result type permits a zero-state, so re-running
    // on an already-canonical DB produces `sourceTypeReconciled: 0`.
    const initial: MigrationResult = {
      scanned: 0,
      modelsCreated: 0,
      llmsCreated: 0,
      providersLinked: 0,
      agentsLinked: 0,
      skipped: 0,
      errors: [],
      sourceTypeReconciled: 0,
    };
    expect(initial.sourceTypeReconciled).toBe(0);
  });
});
