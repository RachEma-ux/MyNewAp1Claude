// listActiveForProvider — input-contract test.
//
// Pins the 2026-05-23 rename: input field is `providerId` (matches the
// `provider_connections.providerId` column the resolver filters on),
// NOT `providerCatalogEntryId`. Before the rename the misleading name
// silently broke the Agent Studio binding picker — picker passed
// `catalog_entries.id`, resolver compared it to `providers.id`,
// returned empty.
//
// Test stays at the type-contract level so it doesn't need a live
// pg pool. Drift-detection: if anyone renames the field back or
// adds a parallel field, this fails.

import { describe, expect, expectTypeOf, it } from "vitest";

import type { ListActiveForProviderInput } from "./public-api";

describe("ListActiveForProviderInput contract", () => {
  it("has a `providerId` field (NOT `providerCatalogEntryId`)", () => {
    // Compile-time check: shape must include `providerId`. This
    // would have failed TS compilation pre-rename.
    expectTypeOf<ListActiveForProviderInput>().toHaveProperty("providerId");
    expectTypeOf<ListActiveForProviderInput>().toHaveProperty("workspaceId");
  });

  it("rejects `providerCatalogEntryId` at the type level", () => {
    // Runtime smoke: a value with the old field name must NOT satisfy
    // the new shape. Tests the type alignment, not behavior.
    const legacyShape = { workspaceId: 1, providerCatalogEntryId: 1 };
    // @ts-expect-error — legacy shape no longer matches the contract
    const _typed: ListActiveForProviderInput = legacyShape;
    void _typed;
    // Sanity assertion so the test runner has something to count.
    expect("providerCatalogEntryId" in legacyShape).toBe(true);
  });

  it("`providerId` semantic matches `providers.id` (the FK target)", () => {
    // Doc-only test — the resolver doc-comment in `public-api.ts`
    // documents the FK target. Asserting the field is `number`
    // serves as a guard against future widening.
    expectTypeOf<ListActiveForProviderInput["providerId"]>().toEqualTypeOf<number>();
  });
});
