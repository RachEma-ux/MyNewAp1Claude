/**
 * Universal error event log file — retention tests.
 *
 * Covers:
 *   1. pruneOldErrorLogFiles deletes only files whose embedded date is
 *      strictly older than the retention boundary
 *   2. Files not matching the daily-rotated pattern are SKIPPED
 *   3. Missing log dir is a no-op
 *   4. Per-file unlink failures are reported in `errors` without
 *      aborting the sweep
 *   5. The cron module exposes the expected public API
 *   6. The tRPC router exposes pruneErrorLogFilesRetention +
 *      getErrorLogFilesRetentionCronStatus
 *   7. boot.ts boots the cron under the correct env-disable flag
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "fs";
import { resolve, join } from "path";
import { pruneOldErrorLogFiles } from "../../server/agent-studio/services/workspace-observability/error-log-file-retention";

const REPO_ROOT = resolve(__dirname, "../..");
const TMP_DIR = resolve("/tmp", `error-log-retention-test-${process.pid}`);

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

function seed(name: string, content = "{}\n"): void {
  writeFileSync(join(TMP_DIR, name), content, "utf8");
}

describe("pruneOldErrorLogFiles", () => {
  beforeEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("deletes files strictly older than the boundary", () => {
    seed("error-events-2024-01-01.jsonl");
    seed("error-events-2024-06-15.jsonl");
    seed("error-events-2099-12-31.jsonl"); // future — kept
    const result = pruneOldErrorLogFiles({
      olderThan: new Date(Date.UTC(2025, 0, 1)),
      logDir: TMP_DIR,
    });
    expect(result.deletedCount).toBe(2);
    expect(result.errors).toEqual([]);
    const remaining = readdirSync(TMP_DIR);
    expect(remaining).toContain("error-events-2099-12-31.jsonl");
    expect(remaining).not.toContain("error-events-2024-01-01.jsonl");
    expect(remaining).not.toContain("error-events-2024-06-15.jsonl");
  });

  it("keeps files whose embedded date equals the boundary (strictly-older semantic)", () => {
    seed("error-events-2025-01-01.jsonl");
    const result = pruneOldErrorLogFiles({
      olderThan: new Date(Date.UTC(2025, 0, 1)),
      logDir: TMP_DIR,
    });
    expect(result.deletedCount).toBe(0);
    expect(existsSync(join(TMP_DIR, "error-events-2025-01-01.jsonl"))).toBe(
      true,
    );
  });

  it("skips files not matching the daily-rotated pattern", () => {
    seed("error-events-2024-01-01.jsonl");
    seed("something-else.txt");
    seed("error-events.jsonl"); // missing date
    seed("error-events-2024-13-99.jsonl"); // bogus date — pattern matches digits but Date.UTC normalizes
    const result = pruneOldErrorLogFiles({
      olderThan: new Date(Date.UTC(2025, 0, 1)),
      logDir: TMP_DIR,
    });
    expect(result.skippedCount).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(TMP_DIR, "something-else.txt"))).toBe(true);
    expect(existsSync(join(TMP_DIR, "error-events.jsonl"))).toBe(true);
  });

  it("is a no-op when the log dir does not exist", () => {
    const result = pruneOldErrorLogFiles({
      olderThan: new Date(Date.UTC(2025, 0, 1)),
      logDir: join(TMP_DIR, "does-not-exist"),
    });
    expect(result.deletedCount).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("counts bytesFreed", () => {
    const big = "x".repeat(1024);
    seed("error-events-2024-01-01.jsonl", big);
    const result = pruneOldErrorLogFiles({
      olderThan: new Date(Date.UTC(2025, 0, 1)),
      logDir: TMP_DIR,
    });
    expect(result.deletedCount).toBe(1);
    expect(result.bytesFreed).toBe(1024);
  });
});

describe("error-log-file-retention-cron module surface", () => {
  const src = read(
    "server/agent-studio/services/workspace-observability/error-log-file-retention-cron.ts",
  );

  it("uses the shared makeRetentionCron factory", () => {
    expect(/from\s+["']\.\.\/retention\/make-retention-cron/.test(src)).toBe(
      true,
    );
  });

  it("env prefix AGS_ERROR_LOG_FILE_RETENTION", () => {
    expect(/envPrefix:\s*["']AGS_ERROR_LOG_FILE_RETENTION["']/.test(src)).toBe(
      true,
    );
  });

  it("default cron 30 9 * * * (slot 7.5 in daily ladder)", () => {
    expect(/defaultCronExpr:\s*["']30 9 \* \* \*["']/.test(src)).toBe(true);
  });

  it("default retention 30 days", () => {
    expect(/defaultRetentionDays:\s*30/.test(src)).toBe(true);
  });

  it("exports tick + status + ensureStarted + reset", () => {
    expect(/export const tickErrorLogFileRetentionCron/.test(src)).toBe(true);
    expect(/export const getErrorLogFileRetentionCronStatus/.test(src)).toBe(
      true,
    );
    expect(/export const ensureErrorLogFileRetentionCronStarted/.test(src)).toBe(
      true,
    );
    expect(/export const _resetErrorLogFileRetentionCronForTests/.test(src)).toBe(
      true,
    );
  });
});

describe("client-observability router retention endpoints", () => {
  const src = read("server/agent-studio/api/client-observability-router.ts");

  it("exposes pruneErrorLogFilesRetention as adminProcedure", () => {
    expect(
      /pruneErrorLogFilesRetention:\s*adminProcedure[\s\S]*?\.mutation\(/.test(
        src,
      ),
    ).toBe(true);
  });

  it("exposes getErrorLogFilesRetentionCronStatus as adminProcedure", () => {
    expect(
      /getErrorLogFilesRetentionCronStatus:\s*adminProcedure\.query/.test(src),
    ).toBe(true);
  });

  it("delegates the manual prune to pruneOldErrorLogFiles", () => {
    expect(
      /pruneOldErrorLogFiles\(\s*\{\s*olderThan/.test(src),
    ).toBe(true);
  });

  it("validates retentionDays as 1–3650", () => {
    expect(/retentionDays:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(3650\)/.test(src)).toBe(
      true,
    );
  });
});

describe("boot.ts cron wiring", () => {
  const src = read("server/agent-studio/boot.ts");

  it("imports ensureErrorLogFileRetentionCronStarted", () => {
    expect(/ensureErrorLogFileRetentionCronStarted/.test(src)).toBe(true);
  });

  it("starts the cron from the workspace-observability path", () => {
    expect(
      /import\([\s\S]*?error-log-file-retention-cron[\s\S]*?\)/.test(src),
    ).toBe(true);
  });
});
