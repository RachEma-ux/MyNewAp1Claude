/**
 * Plan v3 Phase 25 — `registerCatalogEntry` tests.
 *
 * Covers the three register paths:
 *   - no existing row → created
 *   - existing modern row at (sourceType, sourceId) → updated
 *   - existing legacy_imported row → throws RegisterDuplicateError
 *   - existing unresolved row → throws (must use Reconcile)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI Types DB layer BEFORE importing the module under test.
const createCatalogEntryMock = vi.fn();
const updateCatalogEntryMock = vi.fn();
const getCatalogEntryByIdMock = vi.fn();

vi.mock("./db", () => ({
  createCatalogEntry: (...args: any[]) => createCatalogEntryMock(...args),
  updateCatalogEntry: (...args: any[]) => updateCatalogEntryMock(...args),
  getCatalogEntryById: (...args: any[]) => getCatalogEntryByIdMock(...args),
}));

import { registerCatalogEntry, RegisterDuplicateError } from "./register";

function makeFakeDb(rows: Array<{ id: number; legacyImportState: string | null }>) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve() }),
    }),
  };
}

const baseInput = {
  entryType: "agent",
  sourceType: "agent",
  sourceId: 42,
  fields: {
    name: "test-agent",
    displayName: "Test Agent",
    description: "fixture",
    scope: "app",
    status: "draft",
    origin: "admin",
    reviewState: "needs_review",
    config: {},
    tags: [],
    createdBy: 1,
  },
  registeredBy: 1,
};

describe("registerCatalogEntry — Phase 25", () => {
  beforeEach(() => {
    createCatalogEntryMock.mockReset();
    updateCatalogEntryMock.mockReset();
    getCatalogEntryByIdMock.mockReset();
  });

  it("creates a new catalog entry when no row exists", async () => {
    createCatalogEntryMock.mockResolvedValue({ id: 999 });

    const r = await registerCatalogEntry(makeFakeDb([]), baseInput);

    expect(r.action).toBe("created");
    expect(r.entryId).toBe(999);
    expect(r.legacyImportState).toBeNull();
    expect(r.guardReason).toBe("no_existing_row");
    expect(createCatalogEntryMock).toHaveBeenCalledTimes(1);
    const passed = createCatalogEntryMock.mock.calls[0][0];
    expect(passed.entryType).toBe("agent");
    expect(passed.sourceType).toBe("agent");
    expect(passed.sourceId).toBe(42);
    expect(updateCatalogEntryMock).not.toHaveBeenCalled();
  });

  it("updates an existing modern row (legacy_import_state IS NULL)", async () => {
    getCatalogEntryByIdMock.mockResolvedValue({
      id: 100,
      legacyImportState: null,
    });

    const r = await registerCatalogEntry(
      makeFakeDb([{ id: 100, legacyImportState: null }]),
      baseInput,
    );

    expect(r.action).toBe("updated");
    expect(r.entryId).toBe(100);
    expect(r.legacyImportState).toBeNull();
    expect(r.guardReason).toBe("modern_row_update_path");
    expect(updateCatalogEntryMock).toHaveBeenCalledTimes(1);
    expect(createCatalogEntryMock).not.toHaveBeenCalled();
    const updateArgs = updateCatalogEntryMock.mock.calls[0];
    expect(updateArgs[0]).toBe(100); // entry id
    expect(updateArgs[2]).toBe(1); // registeredBy passed through
  });

  it("throws RegisterDuplicateError when a legacy_imported row exists", async () => {
    await expect(
      registerCatalogEntry(
        makeFakeDb([{ id: 200, legacyImportState: "legacy_imported" }]),
        baseInput,
      ),
    ).rejects.toBeInstanceOf(RegisterDuplicateError);
    expect(createCatalogEntryMock).not.toHaveBeenCalled();
    expect(updateCatalogEntryMock).not.toHaveBeenCalled();
  });

  it("throws RegisterDuplicateError when a manually_reconciled row exists", async () => {
    await expect(
      registerCatalogEntry(
        makeFakeDb([{ id: 200, legacyImportState: "manually_reconciled" }]),
        baseInput,
      ),
    ).rejects.toBeInstanceOf(RegisterDuplicateError);
  });

  it("throws RegisterDuplicateError on legacy_imported_unresolved (must use Reconcile)", async () => {
    try {
      await registerCatalogEntry(
        makeFakeDb([
          { id: 300, legacyImportState: "legacy_imported_unresolved" },
        ]),
        baseInput,
      );
      throw new Error("expected throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RegisterDuplicateError);
      expect(e.message).toContain("reconcileLegacyImport");
      expect(e.guardResult.reason).toBe("blocked_unresolved_use_reconcile");
    }
  });

  it("RegisterDuplicateError carries the existing entry id", async () => {
    try {
      await registerCatalogEntry(
        makeFakeDb([{ id: 555, legacyImportState: "legacy_imported" }]),
        baseInput,
      );
      throw new Error("expected throw");
    } catch (e: any) {
      expect(e.existingEntryId).toBe(555);
    }
  });
});
