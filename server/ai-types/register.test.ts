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
const createCatalogAuditEventMock = vi.fn();

vi.mock("./db", () => ({
  createCatalogEntry: (...args: any[]) => createCatalogEntryMock(...args),
  updateCatalogEntry: (...args: any[]) => updateCatalogEntryMock(...args),
  getCatalogEntryById: (...args: any[]) => getCatalogEntryByIdMock(...args),
  createCatalogAuditEvent: (...args: any[]) =>
    createCatalogAuditEventMock(...args),
}));

// Plan v3 Phase 39 — mock the event bus so the catalog.registered emit
// doesn't try to hit a real bus or persistence layer in tests.
const publishEventMock = vi.fn();
vi.mock("../platform/events", () => ({
  publishEvent: (...args: any[]) => publishEventMock(...args),
  makeEnvelope: (input: any) => ({
    eventId: "evt-test",
    eventType: input.eventType,
    sourceModule: input.sourceModule,
    priority: input.priority ?? "normal",
    workspaceId: input.workspaceId ?? null,
    actorId: input.actorId ?? null,
    correlationId: input.correlationId ?? "corr-test",
    schemaVersion: input.schemaVersion ?? "1.0.0",
    payload: input.payload,
    createdAt: "2026-05-04T00:00:00.000Z",
    governanceReceiptId: input.governanceReceiptId,
    idempotencyKey: input.idempotencyKey,
  }),
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
    createCatalogAuditEventMock.mockReset();
    createCatalogAuditEventMock.mockResolvedValue({ id: 1 });
    publishEventMock.mockReset();
    publishEventMock.mockResolvedValue(undefined);
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

  it("Phase 38: emits 'catalog.register.created' audit on create path", async () => {
    createCatalogEntryMock.mockResolvedValue({ id: 999 });
    await registerCatalogEntry(makeFakeDb([]), baseInput);
    expect(createCatalogAuditEventMock).toHaveBeenCalledTimes(1);
    const auditArgs = createCatalogAuditEventMock.mock.calls[0][0];
    expect(auditArgs.eventType).toBe("catalog.register.created");
    expect(auditArgs.catalogEntryId).toBe(999);
    expect(auditArgs.actor).toBe(1);
    expect(auditArgs.actorType).toBe("user");
    expect(auditArgs.payload.sourceType).toBe("agent");
    expect(auditArgs.payload.sourceId).toBe(42);
    expect(auditArgs.payload.guardReason).toBe("no_existing_row");
  });

  it("Phase 38: emits 'catalog.register.updated' audit on update path", async () => {
    getCatalogEntryByIdMock.mockResolvedValue({
      id: 100,
      legacyImportState: null,
    });
    await registerCatalogEntry(
      makeFakeDb([{ id: 100, legacyImportState: null }]),
      baseInput,
    );
    expect(createCatalogAuditEventMock).toHaveBeenCalledTimes(1);
    expect(createCatalogAuditEventMock.mock.calls[0][0].eventType).toBe(
      "catalog.register.updated",
    );
    expect(createCatalogAuditEventMock.mock.calls[0][0].catalogEntryId).toBe(
      100,
    );
  });

  it("Phase 38: audit failure does NOT block the register (best-effort)", async () => {
    createCatalogEntryMock.mockResolvedValue({ id: 999 });
    createCatalogAuditEventMock.mockRejectedValue(new Error("audit DB down"));
    const r = await registerCatalogEntry(makeFakeDb([]), baseInput);
    expect(r.action).toBe("created");
    expect(r.entryId).toBe(999);
  });

  it("Phase 39: emits 'aiTypes.catalog.registered' event on create", async () => {
    createCatalogEntryMock.mockResolvedValue({ id: 999 });
    await registerCatalogEntry(makeFakeDb([]), {
      ...baseInput,
      sourceModule: "agentStudio",
      workspaceId: 7,
      correlationId: "corr-abc",
      fields: { ...baseInput.fields, activeSourceVersionId: 42 } as any,
    });

    expect(publishEventMock).toHaveBeenCalledTimes(1);
    const env = publishEventMock.mock.calls[0][0];
    expect(env.eventType).toBe("aiTypes.catalog.registered");
    expect(env.sourceModule).toBe("aiTypes");
    expect(env.workspaceId).toBe(7);
    expect(env.correlationId).toBe("corr-abc");
    expect(env.actorId).toBe(1);

    const p = env.payload;
    expect(p.catalogEntryId).toBe(999);
    expect(p.entryType).toBe("agent");
    expect(p.sourceModule).toBe("agentStudio");
    expect(p.sourceRefId).toBe(42);
    expect(p.activeSourceVersionId).toBe(42);
    expect(p.initiatedByUserId).toBe(1);
    expect(p.performedByActorId).toBe(1);
    expect(p.performedByActorType).toBe("user");
    expect(p.workspaceId).toBe(7);
    expect(p.correlationId).toBe("corr-abc");
    expect(p.action).toBe("created");
    expect(typeof p.registeredAt).toBe("string");
  });

  it("Phase 39: emits 'aiTypes.catalog.registered' event on update", async () => {
    getCatalogEntryByIdMock.mockResolvedValue({
      id: 100,
      legacyImportState: null,
      activeSourceVersionId: 17,
    });
    await registerCatalogEntry(
      makeFakeDb([{ id: 100, legacyImportState: null }]),
      baseInput,
    );

    expect(publishEventMock).toHaveBeenCalledTimes(1);
    const env = publishEventMock.mock.calls[0][0];
    expect(env.eventType).toBe("aiTypes.catalog.registered");
    expect(env.payload.catalogEntryId).toBe(100);
    expect(env.payload.action).toBe("updated");
    expect(env.payload.activeSourceVersionId).toBe(17);
  });

  it("Phase 39: derives sourceModule when not passed (agent → agentStudio)", async () => {
    createCatalogEntryMock.mockResolvedValue({ id: 999 });
    await registerCatalogEntry(makeFakeDb([]), baseInput);

    const p = publishEventMock.mock.calls[0][0].payload;
    expect(p.sourceModule).toBe("agentStudio");
  });

  it("Phase 39: derives sourceModule for provider/llm/model → providerConnections", async () => {
    createCatalogEntryMock.mockResolvedValue({ id: 999 });
    await registerCatalogEntry(makeFakeDb([]), {
      ...baseInput,
      entryType: "model",
      sourceType: "model",
    });

    const p = publishEventMock.mock.calls[0][0].payload;
    expect(p.sourceModule).toBe("providerConnections");
  });

  it("Phase 39: event publish failure does NOT block the register (best-effort)", async () => {
    createCatalogEntryMock.mockResolvedValue({ id: 999 });
    publishEventMock.mockRejectedValue(new Error("event bus down"));
    const r = await registerCatalogEntry(makeFakeDb([]), baseInput);
    expect(r.action).toBe("created");
    expect(r.entryId).toBe(999);
  });

  it("Phase 39: actorType=system threads through to event payload", async () => {
    createCatalogEntryMock.mockResolvedValue({ id: 999 });
    await registerCatalogEntry(makeFakeDb([]), {
      ...baseInput,
      actorType: "system",
      initiatedByUserId: null,
    });

    const p = publishEventMock.mock.calls[0][0].payload;
    expect(p.performedByActorType).toBe("system");
    expect(p.initiatedByUserId).toBeNull();
  });

  it("Phase 39: no event emitted when register throws RegisterDuplicateError", async () => {
    await expect(
      registerCatalogEntry(
        makeFakeDb([{ id: 200, legacyImportState: "legacy_imported" }]),
        baseInput,
      ),
    ).rejects.toBeInstanceOf(RegisterDuplicateError);
    expect(publishEventMock).not.toHaveBeenCalled();
  });
});
