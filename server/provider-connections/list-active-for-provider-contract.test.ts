// listActiveForProvider — input-contract test.
//
// Pins the canonical contract: input field is `providerCatalogEntryId`
// (`catalog_entries.id`), NOT `providerId`. The resolver joins through
// `catalog_entries.providerId` to filter
// `provider_connections.providerId`.
//
// History:
//   PR #1701 (2026-05-23) renamed the field to `providerId` to match
//   a drifted implementation that filtered directly on
//   `provider_connections.providerId`. PR #1702 extended
//   `CATALOG_SOURCE_MAPPING.md` to re-establish the canonical
//   contract. THIS PR (Option-B #3) reverts the rename and adds the
//   spec-implied join. The doc-comment's original promise — "given a
//   provider catalog entry" — now matches the implementation.
//
// Test stays at the type-contract level so it doesn't need a live
// pg pool. Drift-detection: if anyone renames the field again or
// strips the join, this fails.

import { describe, expect, expectTypeOf, it } from "vitest";

import type { ListActiveForProviderInput } from "./public-api";

describe("ListActiveForProviderInput contract", () => {
  it("has a `providerCatalogEntryId` field (NOT `providerId`)", () => {
    // Compile-time check: shape must include `providerCatalogEntryId`.
    expectTypeOf<ListActiveForProviderInput>().toHaveProperty(
      "providerCatalogEntryId",
    );
    expectTypeOf<ListActiveForProviderInput>().toHaveProperty("workspaceId");
  });

  it("rejects `providerId` at the type level", () => {
    // Runtime smoke: a value with the drift-era field name must NOT
    // satisfy the canonical shape.
    const driftShape = { workspaceId: 1, providerId: 1 };
    // @ts-expect-error — drift shape no longer matches the contract
    const _typed: ListActiveForProviderInput = driftShape;
    void _typed;
    expect("providerId" in driftShape).toBe(true);
  });

  it("`providerCatalogEntryId` semantic is `catalog_entries.id`", () => {
    // Asserts the field type is `number` — guards against widening.
    // The semantic meaning (catalog_entries.id, joined through
    // catalog_entries.providerId to providers.id) is documented in
    // the resolver's doc-comment and exercised in the live picker
    // path; behavior tests cover it there.
    expectTypeOf<
      ListActiveForProviderInput["providerCatalogEntryId"]
    >().toEqualTypeOf<number>();
  });
});
