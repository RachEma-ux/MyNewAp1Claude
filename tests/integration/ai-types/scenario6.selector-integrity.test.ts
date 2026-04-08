/**
 * Agent 6 — Scenario 6: Selector Integrity
 *
 * Tests that app-usage selectors return ONLY catalog-available entries,
 * with no raw domain leakage and correct filtering.
 *
 * Invariants validated: I4, I5
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  assertI4_OnlyCatalogApprovedActive,
  assertI5_NoRawDomainLeakage,
} from "../../helpers/governance-harness";
import {
  getCatalogEntries,
} from "../../../server/db/catalog";
import {
  isCatalogEntryAvailableForAppUse,
  CATALOG_AVAILABILITY_FILTERS,
} from "../../../server/ai-types/availability";

describe.runIf(hasDb)("Scenario 6 — Selector Integrity", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("I5: availability query returns ONLY active+approved entries", async () => {
    // Create a comprehensive mix of states
    const available = await createTestEntry({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
    });

    const states = [
      { status: "draft", reviewState: "needs_review" },
      { status: "draft", reviewState: "approved" },
      { status: "draft", reviewState: "rejected" },
      { status: "active", reviewState: "needs_review" },
      { status: "active", reviewState: "rejected" },
      { status: "deprecated", reviewState: "approved" },
      { status: "disabled", reviewState: "approved" },
    ];

    const unavailable: number[] = [];
    for (const s of states) {
      const e = await createTestEntry({ entryType: "agent", ...s });
      unavailable.push(e.id);
    }

    // Selector query
    const results = await getCatalogEntries({
      entryType: "agent",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    const resultIds = results.map((r) => r.id);

    // Available entry present
    expect(resultIds).toContain(available.id);

    // None of the unavailable entries present
    for (const id of unavailable) {
      expect(resultIds).not.toContain(id);
    }

    // I5: all returned entries have proper catalog metadata
    assertI5_NoRawDomainLeakage(results.filter((r) => r.id === available.id));
  });

  it("I5: cross-type selector returns correct entries per type", async () => {
    const agentAvail = await createTestEntry({ entryType: "agent", status: "active", reviewState: "approved" });
    const modelAvail = await createTestEntry({ entryType: "model", status: "active", reviewState: "approved" });
    const botDraft = await createTestEntry({ entryType: "bot", status: "draft", reviewState: "needs_review" });

    // Agent selector
    const agents = await getCatalogEntries({ entryType: "agent", ...CATALOG_AVAILABILITY_FILTERS });
    expect(agents.map((a) => a.id)).toContain(agentAvail.id);
    expect(agents.map((a) => a.id)).not.toContain(modelAvail.id);

    // Model selector
    const models = await getCatalogEntries({ entryType: "model", ...CATALOG_AVAILABILITY_FILTERS });
    expect(models.map((m) => m.id)).toContain(modelAvail.id);

    // Bot selector — draft not returned
    const bots = await getCatalogEntries({ entryType: "bot", ...CATALOG_AVAILABILITY_FILTERS });
    expect(bots.map((b) => b.id)).not.toContain(botDraft.id);
  });

  it("I5: unfiltered query includes all states (selector MUST use filters)", async () => {
    const draft = await createTestEntry({ entryType: "llm", status: "draft", reviewState: "needs_review" });
    const active = await createTestEntry({ entryType: "llm", status: "active", reviewState: "approved" });

    // Unfiltered — includes everything
    const all = await getCatalogEntries({ entryType: "llm" });
    const allIds = all.map((a) => a.id);
    expect(allIds).toContain(draft.id);
    expect(allIds).toContain(active.id);

    // Filtered — only available
    const filtered = await getCatalogEntries({ entryType: "llm", ...CATALOG_AVAILABILITY_FILTERS });
    const filteredIds = filtered.map((f) => f.id);
    expect(filteredIds).toContain(active.id);
    expect(filteredIds).not.toContain(draft.id);
  });
});
