/**
 * Agent 5 — State Constraints Tests
 *
 * Validates DB-level state constraints on catalog entries.
 * Ensures the state machine works correctly at the persistence layer.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  makeEntryAvailable,
} from "../../helpers/governance-harness";
import {
  getCatalogEntryById,
  updateCatalogEntry,
} from "../../../server/db/catalog";
import { isCatalogEntryAvailableForAppUse } from "../../../server/ai-types/availability";
import { getCatalogState } from "../../../shared/catalog-state";

describe.runIf(hasDb)("State Constraints — DB Level", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("all valid lifecycle states are persistable", async () => {
    const states = ["draft", "active", "deprecated", "disabled"] as const;

    for (const status of states) {
      const entry = await createTestEntry({ status });
      const dbEntry = await getCatalogEntryById(entry.id);
      expect(dbEntry!.status).toBe(status);
    }
  });

  it("all valid review states are persistable", async () => {
    const reviewStates = ["needs_review", "approved", "rejected"] as const;

    for (const reviewState of reviewStates) {
      const entry = await createTestEntry({ reviewState });
      const dbEntry = await getCatalogEntryById(entry.id);
      expect(dbEntry!.reviewState).toBe(reviewState);
    }
  });

  it("tags are persisted as array and retrievable", async () => {
    const tags = ["candidate", "registered", "published", "custom-tag"];
    const entry = await createTestEntry({ tags });

    const dbEntry = await getCatalogEntryById(entry.id);
    const dbTags = dbEntry!.tags as string[];
    expect(dbTags).toEqual(tags);
  });

  it("frozen field defaults to false", async () => {
    const entry = await createTestEntry({ entryType: "agent" });
    const dbEntry = await getCatalogEntryById(entry.id);
    expect(dbEntry!.frozen).toBe(false);
  });

  it("state transitions preserve other fields", async () => {
    const entry = await createTestEntry({
      entryType: "bot",
      status: "draft",
      reviewState: "needs_review",
      config: { key: "preserved" },
      tags: ["candidate", "important"],
    });

    // Change status
    const updated = await updateCatalogEntry(entry.id, { status: "active" }, 1);
    expect(updated.status).toBe("active");

    // Other fields preserved
    const dbEntry = await getCatalogEntryById(entry.id);
    expect(dbEntry!.entryType).toBe("bot");
    expect(dbEntry!.reviewState).toBe("needs_review");
    expect((dbEntry!.config as any).key).toBe("preserved");
  });

  it("getCatalogState labels match DB state at every lifecycle point", async () => {
    const entry = await createTestEntry({
      entryType: "llm",
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
    });

    // candidate
    let state = getCatalogState({ status: "draft", reviewState: "needs_review", tags: ["candidate"] });
    expect(state.label).toBe("candidate");

    // approved
    state = getCatalogState({ status: "draft", reviewState: "approved", tags: ["candidate"] });
    expect(state.label).toBe("approved");

    // published
    state = getCatalogState({ status: "draft", reviewState: "approved", tags: ["candidate", "published"] });
    expect(state.label).toBe("published");

    // available
    state = getCatalogState({ status: "active", reviewState: "approved", tags: ["candidate", "published"] });
    expect(state.label).toBe("available");

    // rejected
    state = getCatalogState({ status: "draft", reviewState: "rejected", tags: ["candidate"] });
    expect(state.label).toBe("rejected");

    // deprecated
    state = getCatalogState({ status: "deprecated", reviewState: "approved", tags: ["candidate"] });
    expect(state.label).toBe("deprecated");

    // disabled
    state = getCatalogState({ status: "disabled", reviewState: "approved", tags: ["candidate"] });
    expect(state.label).toBe("disabled");
  });
});
