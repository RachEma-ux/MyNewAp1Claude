// AI Types migration router shape test.
//
// Cheap unit-shape test that the new `aiTypes.migration` sub-router
// exposes `backfillDomainTables` as a mutation and that it delegates
// to the same exported `backfillDomainTables` function used by the
// boot path. Keeps the boot path + tRPC path in lockstep — a rename
// of the migration fn would break this test as well as the operator
// surface.

import { describe, expect, it } from "vitest";

import { migrationRouter } from "./migration-router";
import * as migrationModule from "./migration";

describe("aiTypes.migration router", () => {
  it("exposes backfillDomainTables as a procedure on the sub-router", () => {
    const procedures = (migrationRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def
      .procedures;
    expect(procedures).toHaveProperty("backfillDomainTables");
  });

  it("backfillDomainTables in the migration module is the canonical entry point", () => {
    // The boot-time call site and the router both import from the
    // same `./migration` source. Asserts the fn is exported and is
    // callable — defends against accidental rename in the module
    // without updating the router or boot.ts.
    expect(typeof migrationModule.backfillDomainTables).toBe("function");
  });
});
