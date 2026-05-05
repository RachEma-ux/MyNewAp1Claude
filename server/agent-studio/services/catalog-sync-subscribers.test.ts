/**
 * Plan v3 Phase 40 — `processCatalogSyncEvent` unit tests.
 *
 * Drives synthetic envelopes through the handler without booting the
 * Agent Studio module or the platform event bus. The recorder is a
 * stubbed function so we can assert exactly what the handler would
 * write to ags_catalog_sync_log.
 */

import { describe, it, expect, vi } from "vitest";

import {
  processCatalogSyncEvent,
  deriveCatalogStatusFromEventType,
  type CatalogSyncRecorder,
  type CatalogSyncEventType,
} from "./catalog-sync-subscribers";
import type { EventEnvelope } from "../../platform/events";

function makeEnv(
  eventType: string,
  payload: Record<string, unknown>,
  eventId = "evt-1",
): EventEnvelope {
  return {
    eventId,
    eventType,
    sourceModule: "aiTypes",
    priority: "normal",
    workspaceId: null,
    actorId: null,
    correlationId: "corr-1",
    schemaVersion: "1.0.0",
    payload,
    createdAt: "2026-05-04T00:00:00.000Z",
  } as EventEnvelope;
}

function makeQuietLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

describe("processCatalogSyncEvent — Phase 40", () => {
  it("records a registered event for an AS-sourced catalog entry", async () => {
    const recorder: CatalogSyncRecorder = vi.fn().mockResolvedValue(undefined);
    const result = await processCatalogSyncEvent(
      "aiTypes.catalog.registered",
      makeEnv("aiTypes.catalog.registered", {
        catalogEntryId: 999,
        entryType: "agent",
        sourceModule: "agentStudio",
        sourceRefId: 42,
        action: "created",
      }),
      recorder,
      makeQuietLogger(),
    );

    expect(result).toBe("recorded");
    expect(recorder).toHaveBeenCalledTimes(1);
    const args = (recorder as any).mock.calls[0][0];
    expect(args.eventId).toBe("evt-1");
    expect(args.eventType).toBe("aiTypes.catalog.registered");
    expect(args.catalogEntryId).toBe(999);
    expect(args.sourceModule).toBe("agentStudio");
    expect(args.sourceRefId).toBe(42);
    expect(args.action).toBe("created");
  });

  it("records a published event", async () => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    const result = await processCatalogSyncEvent(
      "aiTypes.catalog.published",
      makeEnv("aiTypes.catalog.published", {
        catalogEntryId: 100,
        sourceModule: "agentStudio",
        sourceRefId: 7,
      }),
      recorder,
      makeQuietLogger(),
    );

    expect(result).toBe("recorded");
    expect(recorder.mock.calls[0][0].eventType).toBe(
      "aiTypes.catalog.published",
    );
    // Published has no `action` — recorded as null.
    expect(recorder.mock.calls[0][0].action).toBeNull();
  });

  it("records a deprecated event", async () => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    const result = await processCatalogSyncEvent(
      "aiTypes.catalog.deprecated",
      makeEnv("aiTypes.catalog.deprecated", {
        catalogEntryId: 555,
        sourceModule: "agentStudio",
        sourceRefId: 3,
        reason: "superseded by v2",
      }),
      recorder,
      makeQuietLogger(),
    );

    expect(result).toBe("recorded");
    expect(recorder.mock.calls[0][0].eventType).toBe(
      "aiTypes.catalog.deprecated",
    );
  });

  it("skips events from non-agentStudio sources (filtered)", async () => {
    const recorder = vi.fn();
    const result = await processCatalogSyncEvent(
      "aiTypes.catalog.registered",
      makeEnv("aiTypes.catalog.registered", {
        catalogEntryId: 200,
        entryType: "model",
        sourceModule: "providerConnections",
        sourceRefId: 17,
        action: "created",
      }),
      recorder,
      makeQuietLogger(),
    );

    expect(result).toBe("skipped_filtered");
    expect(recorder).not.toHaveBeenCalled();
  });

  it("falls back to entryType=agent as an AS allowance even when sourceModule is missing", async () => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    const result = await processCatalogSyncEvent(
      "aiTypes.catalog.registered",
      makeEnv("aiTypes.catalog.registered", {
        catalogEntryId: 1234,
        entryType: "agent",
        sourceRefId: 88,
        action: "updated",
      }),
      recorder,
      makeQuietLogger(),
    );

    expect(result).toBe("recorded");
    expect(recorder.mock.calls[0][0].sourceModule).toBe("agentStudio"); // default
    expect(recorder.mock.calls[0][0].sourceRefId).toBe(88);
  });

  it("skips when catalogEntryId is missing (invalid payload)", async () => {
    const recorder = vi.fn();
    const logger = makeQuietLogger();
    const result = await processCatalogSyncEvent(
      "aiTypes.catalog.registered",
      makeEnv("aiTypes.catalog.registered", {
        sourceModule: "agentStudio",
        action: "created",
      }),
      recorder,
      logger,
    );

    expect(result).toBe("skipped_invalid");
    expect(recorder).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("missing catalogEntryId"),
    );
  });

  it("returns 'error' when the recorder throws (best-effort)", async () => {
    const recorder = vi.fn().mockRejectedValue(new Error("ASDB down"));
    const logger = makeQuietLogger();
    const result = await processCatalogSyncEvent(
      "aiTypes.catalog.registered",
      makeEnv("aiTypes.catalog.registered", {
        catalogEntryId: 999,
        entryType: "agent",
        sourceModule: "agentStudio",
        sourceRefId: 42,
        action: "created",
      }),
      recorder,
      logger,
    );

    expect(result).toBe("error");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("ASDB down"),
    );
  });

  it("does not throw when payload is null/undefined", async () => {
    const recorder = vi.fn();
    const result = await processCatalogSyncEvent(
      "aiTypes.catalog.registered",
      makeEnv("aiTypes.catalog.registered", null as any),
      recorder,
      makeQuietLogger(),
    );

    // Null payload doesn't match the agentStudio filter → skipped_filtered.
    expect(result).toBe("skipped_filtered");
    expect(recorder).not.toHaveBeenCalled();
  });

  it("preserves the full payload on the recorder call", async () => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    const fullPayload = {
      catalogEntryId: 999,
      entryType: "agent",
      sourceModule: "agentStudio",
      sourceRefId: 42,
      activeSourceVersionId: 17,
      initiatedByUserId: 1,
      performedByActorId: 1,
      performedByActorType: "user",
      workspaceId: 5,
      correlationId: "corr-abc",
      registeredAt: "2026-05-04T00:00:00.000Z",
      action: "created",
    };
    await processCatalogSyncEvent(
      "aiTypes.catalog.registered",
      makeEnv("aiTypes.catalog.registered", fullPayload),
      recorder,
      makeQuietLogger(),
    );

    expect(recorder.mock.calls[0][0].payload).toEqual(fullPayload);
  });

  it("dedupes via env.eventId — passes the bus event id through to the recorder", async () => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    await processCatalogSyncEvent(
      "aiTypes.catalog.registered",
      makeEnv(
        "aiTypes.catalog.registered",
        {
          catalogEntryId: 999,
          entryType: "agent",
          sourceModule: "agentStudio",
          sourceRefId: 42,
          action: "created",
        },
        "evt-unique-abc",
      ),
      recorder,
      makeQuietLogger(),
    );

    expect(recorder.mock.calls[0][0].eventId).toBe("evt-unique-abc");
  });

  it.each<CatalogSyncEventType>([
    "aiTypes.catalog.registered",
    "aiTypes.catalog.published",
    "aiTypes.catalog.deprecated",
  ])("handles %s without crashing on missing fields", async (eventType) => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    const result = await processCatalogSyncEvent(
      eventType,
      makeEnv(eventType, {
        catalogEntryId: 1,
        sourceModule: "agentStudio",
      }),
      recorder,
      makeQuietLogger(),
    );

    expect(result).toBe("recorded");
  });
});

describe("deriveCatalogStatusFromEventType — Phase 40", () => {
  it("maps each event type to its status", () => {
    expect(deriveCatalogStatusFromEventType("aiTypes.catalog.registered")).toBe(
      "registered",
    );
    expect(deriveCatalogStatusFromEventType("aiTypes.catalog.published")).toBe(
      "published",
    );
    expect(deriveCatalogStatusFromEventType("aiTypes.catalog.deprecated")).toBe(
      "deprecated",
    );
  });

  it("returns 'unknown' for null/unrecognized event types", () => {
    expect(deriveCatalogStatusFromEventType(null)).toBe("unknown");
    expect(deriveCatalogStatusFromEventType("foo")).toBe("unknown");
  });
});
