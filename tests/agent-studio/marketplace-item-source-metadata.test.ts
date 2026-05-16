/**
 * Phase G §T-G.52 — Marketplace-item-source metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  MARKETPLACE_ITEM_SOURCES,
  MARKETPLACE_ITEM_SOURCE_METADATA,
  getMarketplaceItemSourceMetadata,
} from "../../server/agent-studio/services/marketplace.js";

describe("MARKETPLACE_ITEM_SOURCE_METADATA (T-G.52)", () => {
  it("has metadata for every closed-taxonomy source", () => {
    for (const s of MARKETPLACE_ITEM_SOURCES) {
      expect(MARKETPLACE_ITEM_SOURCE_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(MARKETPLACE_ITEM_SOURCE_METADATA).length).toBe(
      MARKETPLACE_ITEM_SOURCES.length,
    );
  });

  it.each(MARKETPLACE_ITEM_SOURCES)(
    "%s has non-empty label + description + boolean isFirstParty + boolean isAdvertised",
    (s) => {
      const md = MARKETPLACE_ITEM_SOURCE_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.isFirstParty).toBe("boolean");
      expect(typeof md.isAdvertised).toBe("boolean");
    },
  );

  it.each(MARKETPLACE_ITEM_SOURCES)(
    "getMarketplaceItemSourceMetadata(%s) returns table entry",
    (s) => {
      expect(getMarketplaceItemSourceMetadata(s)).toBe(
        MARKETPLACE_ITEM_SOURCE_METADATA[s],
      );
    },
  );

  it("local + published are exactly the first-party sources", () => {
    const fp = new Set(
      MARKETPLACE_ITEM_SOURCES.filter(
        (s) => MARKETPLACE_ITEM_SOURCE_METADATA[s].isFirstParty,
      ),
    );
    expect(fp).toEqual(new Set(["local", "published"]));
  });

  it("published is the only advertised source", () => {
    const adv = MARKETPLACE_ITEM_SOURCES.filter(
      (s) => MARKETPLACE_ITEM_SOURCE_METADATA[s].isAdvertised,
    );
    expect(adv).toEqual(["published"]);
  });

  it("isAdvertised implies isFirstParty", () => {
    for (const s of MARKETPLACE_ITEM_SOURCES) {
      const md = MARKETPLACE_ITEM_SOURCE_METADATA[s];
      if (md.isAdvertised) {
        expect(md.isFirstParty).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of MARKETPLACE_ITEM_SOURCES) {
      labels.add(MARKETPLACE_ITEM_SOURCE_METADATA[s].label);
    }
    expect(labels.size).toBe(MARKETPLACE_ITEM_SOURCES.length);
  });
});
