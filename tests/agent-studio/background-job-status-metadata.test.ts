/**
 * Background-job status metadata — source-scan + behavioral tests.
 *
 * Slice 28 of the no-deferral continuation catalogue (2026-05-19).
 * Closes `services/workspace-observability/background-jobs.ts:62`
 * (`"metadata table itself is deferred"`) by ginning up
 * `ags_background_job_status_metadata` + the service surface that
 * reseeds + caches it.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BACKGROUND_JOB_STATUSES,
  TERMINAL_BACKGROUND_JOB_STATUSES,
  type JobStatus,
} from "../../server/agent-studio/services/workspace-observability/background-jobs.js";
import {
  DEFAULT_BACKGROUND_JOB_STATUS_METADATA,
  getBackgroundJobStatusMetadata,
  getMetadataForStatus,
  getTerminalBackgroundJobStatuses,
  loadBackgroundJobStatusMetadataFromDb,
  seedBackgroundJobStatusMetadata,
  __resetBackgroundJobStatusMetadataCacheForTests,
} from "../../server/agent-studio/services/workspace-observability/background-job-status-metadata.js";

const REPO_ROOT = join(__dirname, "..", "..");
const BG_JOBS_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/workspace-observability/background-jobs.ts",
);
const METADATA_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/workspace-observability/background-job-status-metadata.ts",
);
const SCHEMA_PATH = join(
  REPO_ROOT,
  "drizzle/tables/agent-studio-graph-quality.ts",
);

describe("background-job status metadata — slice 28 source-scan", () => {
  it("drizzle table is declared with primary-key + 5 fields", () => {
    const schema = readFileSync(SCHEMA_PATH, "utf8");
    expect(schema).toContain("agsBackgroundJobStatusMetadata");
    expect(schema).toContain('"ags_background_job_status_metadata"');
    expect(schema).toMatch(/status:\s*varchar\("status".*\)\.primaryKey\(\)/);
    expect(schema).toContain('terminal: boolean("terminal")');
    expect(schema).toContain('retryable: boolean("retryable")');
    expect(schema).toContain('label: varchar("label"');
    expect(schema).toContain('severity: varchar("severity"');
  });

  it("background-jobs.ts no longer claims the metadata table is deferred", () => {
    const bg = readFileSync(BG_JOBS_PATH, "utf8");
    expect(bg).not.toContain("metadata table itself is deferred");
    // The set literal is retained as a frozen baseline so callers that
    // import it synchronously at module load (sweeper start-up + tests
    // pre-boot) still receive a usable value.
    expect(bg).toContain("TERMINAL_BACKGROUND_JOB_STATUSES");
  });

  it("metadata module declares the seed + load + cache surfaces", () => {
    const md = readFileSync(METADATA_PATH, "utf8");
    expect(md).toContain("seedBackgroundJobStatusMetadata");
    expect(md).toContain("loadBackgroundJobStatusMetadataFromDb");
    expect(md).toContain("getTerminalBackgroundJobStatuses");
    expect(md).toContain("onConflictDoUpdate");
    expect(md).toContain("DEFAULT_BACKGROUND_JOB_STATUS_METADATA");
  });
});

describe("background-job status metadata — behavioral", () => {
  beforeEach(() => {
    __resetBackgroundJobStatusMetadataCacheForTests();
  });

  it("DEFAULT_BACKGROUND_JOB_STATUS_METADATA covers every BACKGROUND_JOB_STATUSES value", () => {
    const seeded = new Set(
      DEFAULT_BACKGROUND_JOB_STATUS_METADATA.map((m) => m.status),
    );
    for (const status of BACKGROUND_JOB_STATUSES) {
      expect(seeded.has(status)).toBe(true);
    }
    expect(seeded.size).toBe(BACKGROUND_JOB_STATUSES.length);
  });

  it("terminal flag in defaults matches the frozen baseline set", () => {
    const derived = new Set(
      DEFAULT_BACKGROUND_JOB_STATUS_METADATA.filter((m) => m.terminal).map(
        (m) => m.status,
      ),
    );
    for (const s of TERMINAL_BACKGROUND_JOB_STATUSES) {
      expect(derived.has(s)).toBe(true);
    }
    expect(derived.size).toBe(TERMINAL_BACKGROUND_JOB_STATUSES.size);
  });

  it("severity field is one of info|warn|error for every status", () => {
    for (const m of DEFAULT_BACKGROUND_JOB_STATUS_METADATA) {
      expect(["info", "warn", "error"]).toContain(m.severity);
    }
  });

  it("getMetadataForStatus returns the matching row", () => {
    const failed = getMetadataForStatus("failed");
    expect(failed).not.toBeNull();
    expect(failed?.severity).toBe("error");
    expect(failed?.retryable).toBe(true);
  });

  it("getTerminalBackgroundJobStatuses derives from current metadata", () => {
    const set = getTerminalBackgroundJobStatuses();
    expect(set.has("completed")).toBe(true);
    expect(set.has("failed")).toBe(true);
    expect(set.has("cancelled")).toBe(true);
    expect(set.has("pending")).toBe(false);
    expect(set.has("running")).toBe(false);
  });

  it("loadBackgroundJobStatusMetadataFromDb falls back to defaults on DB error", async () => {
    const md = await loadBackgroundJobStatusMetadataFromDb({
      getDb: (() => {
        throw new Error("simulated ASDB unavailable");
      }) as never,
    });
    expect(md.length).toBe(DEFAULT_BACKGROUND_JOB_STATUS_METADATA.length);
  });

  it("loadBackgroundJobStatusMetadataFromDb falls back to defaults on empty result", async () => {
    const fakeDb = {
      select: () => ({
        from: async () => [] as Array<{ status: string }>,
      }),
    };
    // The drizzle .select().from() chain returns a thenable. Inject a
    // tiny thenable.
    const fakeDbAsThenable = {
      select: () => ({
        from: () => Promise.resolve([]),
      }),
    };
    const md = await loadBackgroundJobStatusMetadataFromDb({
      getDb: (() => fakeDbAsThenable) as never,
    });
    expect(md.length).toBe(DEFAULT_BACKGROUND_JOB_STATUS_METADATA.length);
    void fakeDb;
  });

  it("loadBackgroundJobStatusMetadataFromDb takes rows over defaults", async () => {
    const rows: Array<{
      status: string;
      terminal: boolean;
      retryable: boolean;
      label: string;
      severity: string;
      description: string | null;
    }> = [
      {
        status: "completed",
        terminal: true,
        retryable: false,
        label: "Operator-edited",
        severity: "warn", // different from default 'info'
        description: "custom",
      },
    ];
    const fakeDb = {
      select: () => ({ from: () => Promise.resolve(rows) }),
    };
    const md = await loadBackgroundJobStatusMetadataFromDb({
      getDb: (() => fakeDb) as never,
    });
    expect(md.length).toBe(1);
    expect(md[0]?.severity).toBe("warn");
    expect(md[0]?.label).toBe("Operator-edited");
  });

  it("getBackgroundJobStatusMetadata ignores unknown statuses from DB", async () => {
    // A future operator manual-INSERTs a stale status that doesn't
    // match BACKGROUND_JOB_STATUSES. The loader filters it out so
    // type-safety downstream isn't broken.
    const rows = [
      ...DEFAULT_BACKGROUND_JOB_STATUS_METADATA.map((m) => ({
        status: m.status,
        terminal: m.terminal,
        retryable: m.retryable,
        label: m.label,
        severity: m.severity,
        description: m.description,
      })),
      {
        status: "ghost_status_from_old_release",
        terminal: true,
        retryable: false,
        label: "Ghost",
        severity: "info",
        description: null,
      },
    ];
    const fakeDb = {
      select: () => ({ from: () => Promise.resolve(rows) }),
    };
    const md = await loadBackgroundJobStatusMetadataFromDb({
      getDb: (() => fakeDb) as never,
    });
    const slugs = md.map((m) => m.status);
    expect(slugs).not.toContain("ghost_status_from_old_release");
    expect(slugs.length).toBe(DEFAULT_BACKGROUND_JOB_STATUS_METADATA.length);
  });

  it("seedBackgroundJobStatusMetadata writes 5 rows via onConflictDoUpdate", async () => {
    const captured: Array<{
      values: Record<string, unknown>;
      conflictTarget: unknown;
    }> = [];
    const fakeDb = {
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          onConflictDoUpdate: (cfg: Record<string, unknown>) => {
            captured.push({ values: v, conflictTarget: cfg.target });
            return Promise.resolve();
          },
        }),
      }),
      // The seed's read-back uses .select().from().
      select: () => ({
        from: () =>
          Promise.resolve(
            DEFAULT_BACKGROUND_JOB_STATUS_METADATA.map((m) => ({
              status: m.status,
              terminal: m.terminal,
              retryable: m.retryable,
              label: m.label,
              severity: m.severity,
              description: m.description,
            })),
          ),
      }),
    };
    const seeded = await seedBackgroundJobStatusMetadata({
      getDb: (() => fakeDb) as never,
    });
    expect(captured.length).toBe(5);
    expect(seeded.length).toBe(5);
    const seededStatuses = captured.map((c) => c.values.status as string);
    for (const status of BACKGROUND_JOB_STATUSES) {
      expect(seededStatuses).toContain(status);
    }
  });

  it("public-api re-exports the surface", async () => {
    const mod = await import(
      "../../server/agent-studio/services/workspace-observability/public-api.js"
    );
    expect(mod.DEFAULT_BACKGROUND_JOB_STATUS_METADATA).toBeDefined();
    expect(mod.getBackgroundJobStatusMetadata).toBeDefined();
    expect(mod.getTerminalBackgroundJobStatuses).toBeDefined();
    expect(mod.seedBackgroundJobStatusMetadata).toBeDefined();
    expect(mod.loadBackgroundJobStatusMetadataFromDb).toBeDefined();
  });

  it("frozen baseline + derived terminal set stay in sync across the codebase", () => {
    // Lockstep guard: if a developer changes one but not the other,
    // this assertion fails — the source-of-truth migration would
    // require both updates.
    const baseline = new Set<JobStatus>(TERMINAL_BACKGROUND_JOB_STATUSES);
    const derived = new Set<JobStatus>(
      DEFAULT_BACKGROUND_JOB_STATUS_METADATA.filter((m) => m.terminal).map(
        (m) => m.status,
      ),
    );
    expect(derived.size).toBe(baseline.size);
    for (const s of baseline) expect(derived.has(s)).toBe(true);
  });
});
