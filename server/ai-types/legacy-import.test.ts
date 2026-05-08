/**
 * Plan v3 Phase 24 — legacy import classifier + duplicate guard tests.
 *
 * These are pure-function tests against the classifier and the
 * duplicate-prevention guard that Phase 25's `aiTypes.catalog.register`
 * will call. The classifier takes a `SourceLookups` interface so the
 * test wires an in-memory fake; no real DB is required.
 */

import { describe, it, expect } from "vitest";
import {
  classifyLegacyImport,
  checkDuplicateLegacyImport,
  reconcileLegacyImport,
  type CatalogRowSourceLink,
  type SourceLookups,
} from "./legacy-import";

function makeLookups(opts: {
  agsAgents?: Record<number, number | null>; // agentId -> releaseId | null
  fkRows?: Partial<
    Record<"llm_authority" | "models" | "providers" | "bots", Set<number>>
  >;
}): SourceLookups {
  return {
    async resolveAgsAgentPublishedRelease(agentId: number) {
      if (!opts.agsAgents) return null;
      return opts.agsAgents[agentId] ?? null;
    },
    async rowExists(table, id) {
      return Boolean(opts.fkRows?.[table]?.has(id));
    },
  };
}

const baseRow = (
  override: Partial<CatalogRowSourceLink> = {},
): CatalogRowSourceLink => ({
  id: 1,
  sourceType: null,
  sourceId: null,
  legacyImportState: null,
  activeSourceVersionId: null,
  ...override,
});

describe("classifyLegacyImport — Phase 24 rules", () => {
  it("idempotent: already-classified rows pass through unchanged", async () => {
    const r = await classifyLegacyImport(
      baseRow({ legacyImportState: "legacy_imported", activeSourceVersionId: 99 }),
      makeLookups({}),
    );
    expect(r.legacyImportState).toBe("legacy_imported");
    expect(r.activeSourceVersionId).toBe(99);
    expect(r.reason).toBe("already_classified");
  });

  it("admin-created row (sourceType null) is not a legacy import", async () => {
    const r = await classifyLegacyImport(
      baseRow({ sourceType: null, sourceId: null }),
      makeLookups({}),
    );
    expect(r.legacyImportState).toBeNull();
    expect(r.reason).toBe("no_source_linkage");
  });

  it("ags_agent with a published release → legacy_imported + version pointer", async () => {
    const r = await classifyLegacyImport(
      baseRow({ sourceType: "ags_agent", sourceId: 42 }),
      makeLookups({ agsAgents: { 42: 7777 } }),
    );
    expect(r.legacyImportState).toBe("legacy_imported");
    expect(r.activeSourceVersionId).toBe(7777);
    expect(r.reason).toBe("ags_agent_resolved_to_published_release");
  });

  it("ags_agent without a published release → legacy_imported_unresolved", async () => {
    const r = await classifyLegacyImport(
      baseRow({ sourceType: "ags_agent", sourceId: 42 }),
      makeLookups({ agsAgents: { 42: null } }),
    );
    expect(r.legacyImportState).toBe("legacy_imported_unresolved");
    expect(r.activeSourceVersionId).toBeNull();
    expect(r.reason).toBe("ags_agent_missing_or_no_published_release");
  });

  it("ags_agent pointing at a deleted agent → legacy_imported_unresolved", async () => {
    const r = await classifyLegacyImport(
      baseRow({ sourceType: "ags_agent", sourceId: 99 }),
      makeLookups({ agsAgents: {} }),
    );
    expect(r.legacyImportState).toBe("legacy_imported_unresolved");
  });

  it("llm with FK target present → legacy_imported", async () => {
    const r = await classifyLegacyImport(
      baseRow({ sourceType: "llm", sourceId: 5 }),
      makeLookups({ fkRows: { llm_authority: new Set([5]) } }),
    );
    expect(r.legacyImportState).toBe("legacy_imported");
    expect(r.activeSourceVersionId).toBeNull();
    expect(r.reason).toBe("llm_fk_target_exists");
  });

  it("provider/model/bot with FK target missing → legacy_imported_unresolved", async () => {
    for (const sourceType of ["provider", "model", "bot"] as const) {
      const r = await classifyLegacyImport(
        baseRow({ sourceType, sourceId: 100 }),
        makeLookups({ fkRows: {} }),
      );
      expect(r.legacyImportState).toBe("legacy_imported_unresolved");
      expect(r.reason).toBe(`${sourceType}_fk_target_missing`);
    }
  });

  it("sourceType set but sourceId null → legacy_imported_unresolved", async () => {
    const r = await classifyLegacyImport(
      baseRow({ sourceType: "ags_agent", sourceId: null }),
      makeLookups({}),
    );
    expect(r.legacyImportState).toBe("legacy_imported_unresolved");
    expect(r.reason).toBe("source_type_set_but_source_id_null");
  });

  it("unknown sourceType (e.g. ai_type) falls through to legacy_imported", async () => {
    const r = await classifyLegacyImport(
      baseRow({ sourceType: "ai_type", sourceId: 1 }),
      makeLookups({}),
    );
    expect(r.legacyImportState).toBe("legacy_imported");
    expect(r.reason).toBe("unknown_source_type_assumed_legacy");
  });
});

// ───────────────────────────────────────────────────────────────────
// Duplicate guard tests
// ───────────────────────────────────────────────────────────────────

function makeFakeDb(rows: Array<{ id: number; legacyImportState: string | null }>) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  };
}

describe("checkDuplicateLegacyImport — Phase 24 duplicate prevention", () => {
  it("no existing row → ok=true", async () => {
    const r = await checkDuplicateLegacyImport(makeFakeDb([]), {
      sourceType: "ags_agent",
      sourceId: 1,
    });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("no_existing_row");
  });

  it("existing modern row (legacyImportState null) → ok=true (update path)", async () => {
    const r = await checkDuplicateLegacyImport(
      makeFakeDb([{ id: 100, legacyImportState: null }]),
      { sourceType: "ags_agent", sourceId: 1 },
    );
    expect(r.ok).toBe(true);
    expect(r.existingEntryId).toBe(100);
    expect(r.reason).toBe("modern_row_update_path");
  });

  it("existing legacy_imported row → ok=false (would_duplicate_legacy)", async () => {
    const r = await checkDuplicateLegacyImport(
      makeFakeDb([{ id: 200, legacyImportState: "legacy_imported" }]),
      { sourceType: "ags_agent", sourceId: 1 },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("would_duplicate_legacy");
  });

  it("existing manually_reconciled row → ok=false (would_duplicate_legacy)", async () => {
    const r = await checkDuplicateLegacyImport(
      makeFakeDb([{ id: 200, legacyImportState: "manually_reconciled" }]),
      { sourceType: "ags_agent", sourceId: 1 },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("would_duplicate_legacy");
  });

  it("unresolved row + reconcileMode=false → blocked (auto-reimport prevented)", async () => {
    const r = await checkDuplicateLegacyImport(
      makeFakeDb([{ id: 300, legacyImportState: "legacy_imported_unresolved" }]),
      { sourceType: "ags_agent", sourceId: 1 },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("blocked_unresolved_use_reconcile");
  });

  it("unresolved row + reconcileMode=true → ok=true (admin reconciliation)", async () => {
    const r = await checkDuplicateLegacyImport(
      makeFakeDb([{ id: 300, legacyImportState: "legacy_imported_unresolved" }]),
      { sourceType: "ags_agent", sourceId: 1, reconcileMode: true },
    );
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("reconciling_unresolved_row");
  });

  // ── Phase 37 — name-path tests ──────────────────────────────────────
  // ADR: docs/architecture/ai-types/PMT_NAME_BASED_IDENTITY.md

  it("name-path: no existing row → ok=true", async () => {
    const r = await checkDuplicateLegacyImport(makeFakeDb([]), {
      sourceType: "self_registered_agent",
      sourceName: "ps.agent.context_translator",
    });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("no_existing_row");
    expect(r.existingEntryId).toBeNull();
  });

  it("name-path: existing row → ok=true with modern_row_update_path (legacy classification skipped)", async () => {
    // Even if the row had a legacyImportState set, the name-path treats
    // it as a modern row (self-registered agents have no legacy concept).
    const r = await checkDuplicateLegacyImport(
      makeFakeDb([{ id: 700, legacyImportState: null }]),
      {
        sourceType: "self_registered_agent",
        sourceName: "ps.agent.context_translator",
      },
    );
    expect(r.ok).toBe(true);
    expect(r.existingEntryId).toBe(700);
    expect(r.reason).toBe("modern_row_update_path");
  });

  it("rejects when both sourceId and sourceName are provided", async () => {
    await expect(
      checkDuplicateLegacyImport(makeFakeDb([]), {
        sourceType: "agent",
        sourceId: 42,
        sourceName: "ps.agent.context_translator",
      }),
    ).rejects.toThrow("exactly one of sourceId or sourceName");
  });

  it("rejects when neither sourceId nor sourceName is provided", async () => {
    await expect(
      checkDuplicateLegacyImport(makeFakeDb([]), {
        sourceType: "agent",
      } as any),
    ).rejects.toThrow("exactly one of sourceId or sourceName");
  });
});

// ───────────────────────────────────────────────────────────────────
// reconcileLegacyImport tests
// ───────────────────────────────────────────────────────────────────

function makeUpdateCapturingDb(rows: Array<{ id: number; legacyImportState: string | null }>) {
  const captured: { setArgs: any; whereCalled: boolean } = {
    setArgs: null,
    whereCalled: false,
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
    update: () => ({
      set: (args: any) => {
        captured.setArgs = args;
        return {
          where: () => {
            captured.whereCalled = true;
            return Promise.resolve();
          },
        };
      },
    }),
  };
  return { db, captured };
}

describe("reconcileLegacyImport — admin override flow", () => {
  it("flips legacy_imported_unresolved to manually_reconciled with version pin", async () => {
    const { db, captured } = makeUpdateCapturingDb([
      { id: 42, legacyImportState: "legacy_imported_unresolved" },
    ]);
    const r = await reconcileLegacyImport(db as any, {
      catalogEntryId: 42,
      activeSourceVersionId: 555,
      reconciledBy: 1,
    });
    expect(r.ok).toBe(true);
    expect(r.previousState).toBe("legacy_imported_unresolved");
    expect(r.newState).toBe("manually_reconciled");
    expect(captured.whereCalled).toBe(true);
    expect(captured.setArgs.legacyImportState).toBe("manually_reconciled");
    expect(captured.setArgs.activeSourceVersionId).toBe(555);
  });

  it("refuses to touch already-resolved rows", async () => {
    const { db } = makeUpdateCapturingDb([
      { id: 42, legacyImportState: "legacy_imported" },
    ]);
    const r = await reconcileLegacyImport(db as any, {
      catalogEntryId: 42,
      activeSourceVersionId: 555,
      reconciledBy: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("row_not_in_unresolved_state");
  });

  it("refuses to touch modern (null state) rows — those use catalog.register update path", async () => {
    const { db } = makeUpdateCapturingDb([
      { id: 42, legacyImportState: null },
    ]);
    const r = await reconcileLegacyImport(db as any, {
      catalogEntryId: 42,
      activeSourceVersionId: 555,
      reconciledBy: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("row_not_in_unresolved_state");
  });

  it("missing catalog entry id → ok=false", async () => {
    const { db } = makeUpdateCapturingDb([]);
    const r = await reconcileLegacyImport(db as any, {
      catalogEntryId: 99,
      activeSourceVersionId: 555,
      reconciledBy: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("catalog_entry_not_found");
  });
});
