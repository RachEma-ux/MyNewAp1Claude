/**
 * Direction B B2b — `deprecateCatalogEntry` formal transition tests.
 *
 * Decision doc: docs/architecture/ai-types/CATALOG_LIFECYCLE_EVENT_DECISION.md
 *   D-LC-3: new transition function with already-deprecated short-circuit
 *   D-LC-4: payload populates every CatalogDeprecatedPayload field
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getCatalogEntryByIdMock = vi.fn();
const updateCatalogEntryMock = vi.fn();
const createCatalogAuditEventMock = vi.fn();

vi.mock("./db", () => ({
  getCatalogEntryById: (...args: any[]) => getCatalogEntryByIdMock(...args),
  updateCatalogEntry: (...args: any[]) => updateCatalogEntryMock(...args),
  createCatalogAuditEvent: (...args: any[]) =>
    createCatalogAuditEventMock(...args),
}));

const publishEventMock = vi.fn();
vi.mock("../platform/events", () => ({
  publishEvent: (...args: any[]) => publishEventMock(...args),
  makeEnvelope: (input: any) => ({
    eventId: "evt-test",
    eventType: input.eventType,
    sourceModule: input.sourceModule,
    workspaceId: input.workspaceId ?? null,
    actorId: input.actorId ?? null,
    payload: input.payload,
    createdAt: "2026-05-05T00:00:00.000Z",
  }),
}));

import { deprecateCatalogEntry } from "./deprecate";

const activeEntry = {
  id: 100,
  status: "active",
  sourceType: "agent",
  sourceId: 42,
};

describe("deprecateCatalogEntry — Direction B B2b", () => {
  beforeEach(() => {
    getCatalogEntryByIdMock.mockReset();
    updateCatalogEntryMock.mockReset();
    createCatalogAuditEventMock.mockReset();
    publishEventMock.mockReset();

    updateCatalogEntryMock.mockResolvedValue(undefined);
    createCatalogAuditEventMock.mockResolvedValue({ id: 1 });
    publishEventMock.mockResolvedValue(undefined);
  });

  it("happy path: writes row, audit, and emits aiTypes.catalog.deprecated", async () => {
    getCatalogEntryByIdMock.mockResolvedValue(activeEntry);

    const r = await deprecateCatalogEntry({
      catalogEntryId: 100,
      deprecatedBy: 7,
      reason: "rotation",
    });

    expect(r.transitioned).toBe(true);
    expect(r.priorStatus).toBe("active");

    expect(updateCatalogEntryMock).toHaveBeenCalledTimes(1);
    const updateArgs = updateCatalogEntryMock.mock.calls[0];
    expect(updateArgs[0]).toBe(100);
    expect(updateArgs[1]).toEqual({ status: "deprecated" });
    expect(updateArgs[2]).toBe(7);

    expect(createCatalogAuditEventMock).toHaveBeenCalledTimes(1);
    const audit = createCatalogAuditEventMock.mock.calls[0][0];
    expect(audit.eventType).toBe("catalog.deprecate");
    expect(audit.catalogEntryId).toBe(100);
    expect(audit.actor).toBe(7);
    expect(audit.actorType).toBe("user");
    expect(audit.payload.reason).toBe("rotation");
    expect(audit.payload.priorStatus).toBe("active");

    expect(publishEventMock).toHaveBeenCalledTimes(1);
    const env = publishEventMock.mock.calls[0][0];
    expect(env.eventType).toBe("aiTypes.catalog.deprecated");
    expect(env.sourceModule).toBe("aiTypes");
    expect(env.actorId).toBe(7);
    expect(env.workspaceId).toBeNull();

    const p = env.payload;
    expect(p.catalogEntryId).toBe(100);
    expect(p.reason).toBe("rotation");
    expect(p.sourceModule).toBe("agentStudio");
    expect(p.sourceRefId).toBe(42);
    expect(p.performedByActorId).toBe(7);
    expect(p.performedByActorType).toBe("user");
    expect(p.workspaceId).toBeNull();
    expect(typeof p.deprecatedAt).toBe("string");
  });

  it("payload reason defaults to null when caller omits it", async () => {
    getCatalogEntryByIdMock.mockResolvedValue(activeEntry);
    await deprecateCatalogEntry({ catalogEntryId: 100, deprecatedBy: 7 });
    expect(publishEventMock.mock.calls[0][0].payload.reason).toBeNull();
    expect(createCatalogAuditEventMock.mock.calls[0][0].payload.reason).toBeNull();
  });

  it("already-deprecated: short-circuits, no DB write, no audit, no event", async () => {
    getCatalogEntryByIdMock.mockResolvedValue({
      ...activeEntry,
      status: "deprecated",
    });

    const r = await deprecateCatalogEntry({
      catalogEntryId: 100,
      deprecatedBy: 7,
      reason: "retry",
    });

    expect(r.transitioned).toBe(false);
    expect(r.priorStatus).toBe("deprecated");
    expect(updateCatalogEntryMock).not.toHaveBeenCalled();
    expect(createCatalogAuditEventMock).not.toHaveBeenCalled();
    expect(publishEventMock).not.toHaveBeenCalled();
  });

  it("missing-entry: throws with the canonical message", async () => {
    getCatalogEntryByIdMock.mockResolvedValue(null);

    await expect(
      deprecateCatalogEntry({ catalogEntryId: 999, deprecatedBy: 7 }),
    ).rejects.toThrow("Catalog entry 999 not found");

    expect(updateCatalogEntryMock).not.toHaveBeenCalled();
    expect(publishEventMock).not.toHaveBeenCalled();
  });

  it("emit-survives-bus-failure: DB write + audit committed, console.warn observed", async () => {
    getCatalogEntryByIdMock.mockResolvedValue(activeEntry);
    publishEventMock.mockRejectedValue(new Error("bus down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await deprecateCatalogEntry({
      catalogEntryId: 100,
      deprecatedBy: 7,
    });

    expect(r.transitioned).toBe(true);
    expect(updateCatalogEntryMock).toHaveBeenCalledTimes(1);
    expect(createCatalogAuditEventMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain("aiTypes.catalog.deprecated");

    warnSpy.mockRestore();
  });

  it("priorStatus is preserved on the audit row even when status is unusual", async () => {
    getCatalogEntryByIdMock.mockResolvedValue({ ...activeEntry, status: "draft" });
    await deprecateCatalogEntry({ catalogEntryId: 100, deprecatedBy: 7 });
    expect(createCatalogAuditEventMock.mock.calls[0][0].payload.priorStatus).toBe(
      "draft",
    );
  });
});
