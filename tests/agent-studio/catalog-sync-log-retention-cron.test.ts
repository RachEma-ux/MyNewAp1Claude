/**
 * Phase 22 follow-up #634 — catalog-sync-log retention cron.
 * Mirrors mcp-transitions-retention-cron.test.ts (#630).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/catalog-sync-log-retention.js",
  () => ({ pruneOldCatalogSyncLog: sweepMock }),
);

import {
  DEFAULT_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR,
  DEFAULT_CATALOG_SYNC_LOG_RETENTION_DAYS,
  tickCatalogSyncLogRetentionCron,
  getCatalogSyncLogRetentionCronStatus,
  _resetCatalogSyncLogRetentionCronForTests,
  ensureCatalogSyncLogRetentionCronStarted,
} from "../../server/agent-studio/services/catalog-sync-log-retention-cron";

const STATE = () => ({
  lastRunMinuteKey: null as string | null,
  lastRunAt: null as Date | null,
  lastResult: null as any,
  lastError: null as string | null,
});

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({ deletedCount: 0 });
  delete process.env.AGS_CATALOG_SYNC_LOG_RETENTION_CRON_DISABLED;
  delete process.env.AGS_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR;
  delete process.env.AGS_CATALOG_SYNC_LOG_RETENTION_DAYS;
  _resetCatalogSyncLogRetentionCronForTests();
});

afterEach(() => {
  delete process.env.AGS_CATALOG_SYNC_LOG_RETENTION_CRON_DISABLED;
  delete process.env.AGS_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR;
  delete process.env.AGS_CATALOG_SYNC_LOG_RETENTION_DAYS;
  _resetCatalogSyncLogRetentionCronForTests();
});

describe("module defaults", () => {
  it("default cron is daily 07:00 UTC", () => {
    expect(DEFAULT_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR).toBe("0 7 * * *");
  });
  it("default retention is 30 days", () => {
    expect(DEFAULT_CATALOG_SYNC_LOG_RETENTION_DAYS).toBe(30);
  });
});

describe("tickCatalogSyncLogRetentionCron — cron matching", () => {
  it("fires at 07:00 UTC default", async () => {
    const state = STATE();
    const result = await tickCatalogSyncLogRetentionCron({
      now: new Date("2026-05-12T07:00:00Z"),
      state,
      log: () => {},
    });
    expect(result.fired).toBe(true);
  });

  it("skips the 03-06:00 slots used by sister crons", async () => {
    const state = STATE();
    for (const hr of [3, 4, 5, 6]) {
      const result = await tickCatalogSyncLogRetentionCron({
        now: new Date(`2026-05-12T0${hr}:00:00Z`),
        state,
      });
      expect(result.skippedReason).toBe("no_match");
    }
  });
});

describe("tickCatalogSyncLogRetentionCron — env disable + override", () => {
  it("returns disabled when env var = 1", async () => {
    process.env.AGS_CATALOG_SYNC_LOG_RETENTION_CRON_DISABLED = "1";
    const result = await tickCatalogSyncLogRetentionCron({
      now: new Date("2026-05-12T07:00:00Z"),
    });
    expect(result.skippedReason).toBe("disabled");
  });

  it("honors AGS_CATALOG_SYNC_LOG_RETENTION_DAYS env override", async () => {
    process.env.AGS_CATALOG_SYNC_LOG_RETENTION_DAYS = "7";
    const state = STATE();
    await tickCatalogSyncLogRetentionCron({
      now: new Date("2026-05-12T07:00:00Z"),
      state,
      log: () => {},
    });
    const arg = sweepMock.mock.calls[0][0];
    expect(arg.olderThan.toISOString()).toBe("2026-05-05T07:00:00.000Z");
  });
});

describe("tickCatalogSyncLogRetentionCron — sweepInput passthrough", () => {
  it("forwards sweepInput.eventTypes", async () => {
    const state = STATE();
    await tickCatalogSyncLogRetentionCron({
      now: new Date("2026-05-12T07:00:00Z"),
      state,
      sweepInput: {
        eventTypes: [
          "aiTypes.catalog.registered",
          "aiTypes.catalog.published",
        ],
      },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].eventTypes).toEqual([
      "aiTypes.catalog.registered",
      "aiTypes.catalog.published",
    ]);
  });

  it("forwards sweepInput.sourceModule + catalogEntryId", async () => {
    const state = STATE();
    await tickCatalogSyncLogRetentionCron({
      now: new Date("2026-05-12T07:00:00Z"),
      state,
      sweepInput: { sourceModule: "agentStudio", catalogEntryId: 42 },
      log: () => {},
    });
    expect(sweepMock.mock.calls[0][0].sourceModule).toBe("agentStudio");
    expect(sweepMock.mock.calls[0][0].catalogEntryId).toBe(42);
  });
});

describe("tickCatalogSyncLogRetentionCron — dedup + failure", () => {
  it("dedupes same-minute re-tick", async () => {
    const state = STATE();
    const now = new Date("2026-05-12T07:00:00Z");
    const a = await tickCatalogSyncLogRetentionCron({ now, state, log: () => {} });
    const b = await tickCatalogSyncLogRetentionCron({ now, state, log: () => {} });
    expect(a.fired).toBe(true);
    expect(b.skippedReason).toBe("deduped");
  });

  it("swallows sweep failures and surfaces lastError via getter", async () => {
    sweepMock.mockRejectedValueOnce(new Error("ASDB unreachable"));
    const state = STATE();
    await tickCatalogSyncLogRetentionCron({
      now: new Date("2026-05-12T07:00:00Z"),
      state,
      warn: () => {},
    });
    expect(getCatalogSyncLogRetentionCronStatus(state).lastError).toBe(
      "ASDB unreachable",
    );
  });
});

describe("getCatalogSyncLogRetentionCronStatus + ensureStarted", () => {
  it("returns lastRunAt + lastResult after success", async () => {
    sweepMock.mockResolvedValueOnce({ deletedCount: 88 });
    const state = STATE();
    await tickCatalogSyncLogRetentionCron({
      now: new Date("2026-05-12T07:00:00Z"),
      state,
      log: () => {},
    });
    const s = getCatalogSyncLogRetentionCronStatus(state);
    expect(s.lastRunAt?.toISOString()).toBe("2026-05-12T07:00:00.000Z");
    expect(s.lastResult?.deletedCount).toBe(88);
  });

  it("boot helper is idempotent", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (m: string) => {
      logs.push(m);
    };
    try {
      ensureCatalogSyncLogRetentionCronStarted();
      ensureCatalogSyncLogRetentionCronStarted();
      expect(logs.filter((m) => m.includes("started"))).toHaveLength(1);
    } finally {
      console.log = origLog;
    }
  });
});
