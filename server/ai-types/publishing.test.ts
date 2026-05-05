/**
 * Direction B B2b — `publishCatalogEntry` event emitter tests.
 *
 * Decision doc: docs/architecture/ai-types/CATALOG_LIFECYCLE_EVENT_DECISION.md
 *   D-LC-1: emits post-write, best-effort
 *   D-LC-2: payload populates every CatalogPublishedPayload field
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getCatalogEntryByIdMock = vi.fn();
const getPublishBundlesMock = vi.fn();
const createPublishBundleMock = vi.fn();
const createCatalogAuditEventMock = vi.fn();
const updateCatalogEntryMock = vi.fn();

vi.mock("./db", () => ({
  getCatalogEntryById: (...args: any[]) => getCatalogEntryByIdMock(...args),
  getPublishBundles: (...args: any[]) => getPublishBundlesMock(...args),
  createPublishBundle: (...args: any[]) => createPublishBundleMock(...args),
  createCatalogAuditEvent: (...args: any[]) =>
    createCatalogAuditEventMock(...args),
  updateCatalogEntry: (...args: any[]) => updateCatalogEntryMock(...args),
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
    correlationId: input.correlationId ?? "corr-test",
    payload: input.payload,
    createdAt: "2026-05-05T00:00:00.000Z",
  }),
}));

import { publishCatalogEntry } from "./publishing";

const baseEntry = {
  id: 100,
  name: "ent",
  displayName: "Ent",
  description: "fixture",
  entryType: "agent",
  sourceType: "ags_agent",
  sourceId: 42,
  category: null,
  subCategory: null,
  capabilities: null,
  scope: "app",
  status: "active",
  origin: "admin",
  providerId: null,
  config: {},
  tags: [] as string[],
};

describe("publishCatalogEntry — Direction B B2b emitter", () => {
  beforeEach(() => {
    getCatalogEntryByIdMock.mockReset();
    getPublishBundlesMock.mockReset();
    createPublishBundleMock.mockReset();
    createCatalogAuditEventMock.mockReset();
    updateCatalogEntryMock.mockReset();
    publishEventMock.mockReset();

    getPublishBundlesMock.mockResolvedValue([]);
    createPublishBundleMock.mockResolvedValue({ id: 9001 });
    createCatalogAuditEventMock.mockResolvedValue({ id: 1 });
    updateCatalogEntryMock.mockResolvedValue(undefined);
    publishEventMock.mockResolvedValue(undefined);
  });

  it("emit-on-success: emits aiTypes.catalog.published with full envelope", async () => {
    getCatalogEntryByIdMock.mockResolvedValue(baseEntry);

    await publishCatalogEntry({ catalogEntryId: 100, publishedBy: 7 });

    expect(publishEventMock).toHaveBeenCalledTimes(1);
    const env = publishEventMock.mock.calls[0][0];
    expect(env.eventType).toBe("aiTypes.catalog.published");
    expect(env.sourceModule).toBe("aiTypes");
    expect(env.actorId).toBe(7);
    expect(env.workspaceId).toBeNull();

    const p = env.payload;
    expect(p.catalogEntryId).toBe(100);
    expect(p.publishBundleId).toBe(9001);
    expect(p.versionLabel).toBe("v1");
    expect(p.sourceRefId).toBe(42);
  });

  it("payload: sourceModule derives from sourceType=agent → agentStudio", async () => {
    getCatalogEntryByIdMock.mockResolvedValue({ ...baseEntry, sourceType: "agent" });
    await publishCatalogEntry({ catalogEntryId: 100, publishedBy: 7 });
    const p = publishEventMock.mock.calls[0][0].payload;
    expect(p.sourceModule).toBe("agentStudio");
    expect(p.sourceRefId).toBe(42);
    expect(p.performedByActorId).toBe(7);
    expect(p.performedByActorType).toBe("user");
    expect(typeof p.publishedAt).toBe("string");
    expect(p.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("payload: sourceModule derives from sourceType=provider → providerConnections", async () => {
    getCatalogEntryByIdMock.mockResolvedValue({ ...baseEntry, sourceType: "provider" });
    await publishCatalogEntry({ catalogEntryId: 100, publishedBy: 7 });
    expect(publishEventMock.mock.calls[0][0].payload.sourceModule).toBe(
      "providerConnections",
    );
  });

  it("no-emit-on-row-failure: throws when entry missing, no event", async () => {
    getCatalogEntryByIdMock.mockResolvedValue(null);

    await expect(
      publishCatalogEntry({ catalogEntryId: 999, publishedBy: 7 }),
    ).rejects.toThrow("Catalog entry 999 not found");

    expect(publishEventMock).not.toHaveBeenCalled();
  });

  it("emit-survives-bus-failure: bus throw does NOT roll back the publish", async () => {
    getCatalogEntryByIdMock.mockResolvedValue(baseEntry);
    publishEventMock.mockRejectedValue(new Error("bus down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await publishCatalogEntry({ catalogEntryId: 100, publishedBy: 7 });

    expect(r.bundle.id).toBe(9001);
    expect(r.versionLabel).toBe("v1");
    expect(createPublishBundleMock).toHaveBeenCalledTimes(1);
    expect(createCatalogAuditEventMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain("aiTypes.catalog.published");

    warnSpy.mockRestore();
  });

  it("idempotent-emit: a second publish call still emits (decision D-LC-1)", async () => {
    getCatalogEntryByIdMock.mockResolvedValue({ ...baseEntry, status: "published" });
    getPublishBundlesMock.mockResolvedValue([{ id: 1 }]);
    createPublishBundleMock.mockResolvedValue({ id: 9002 });

    await publishCatalogEntry({ catalogEntryId: 100, publishedBy: 7 });

    expect(publishEventMock).toHaveBeenCalledTimes(1);
    expect(publishEventMock.mock.calls[0][0].payload.versionLabel).toBe("v2");
    expect(updateCatalogEntryMock).not.toHaveBeenCalled(); // status already published
  });

  it("workspaceId is null on the envelope and payload (catalog rows are app-scoped)", async () => {
    getCatalogEntryByIdMock.mockResolvedValue(baseEntry);
    await publishCatalogEntry({ catalogEntryId: 100, publishedBy: 7 });
    const env = publishEventMock.mock.calls[0][0];
    expect(env.workspaceId).toBeNull();
    expect(env.payload.workspaceId).toBeNull();
  });
});
