/**
 * Universal error event log file — source-scan integrity test.
 *
 * Covers:
 *
 *   1. Server log-file appender exists and exports the public API.
 *   2. recordErrorEvent + recordErrorEvents call into the file
 *      appender on both ASDB-available and ASDB-null branches.
 *   3. clientObservability router exists, defines recordClientError
 *      mutation, and is mounted in api/router.ts.
 *   4. Client-side error-reporter exists and bootstrap is wired in
 *      main.tsx.
 *   5. Reporter avoids self-recursion by bypassing the reporter
 *      procedure path.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("universal error event log", () => {
  describe("server: error-log-file.ts", () => {
    const path =
      "server/agent-studio/services/workspace-observability/error-log-file.ts";

    it("file exists", () => {
      expect(existsSync(join(REPO_ROOT, path))).toBe(true);
    });

    const src = read(path);

    it("exports appendErrorLog", () => {
      expect(/export function appendErrorLog/.test(src)).toBe(true);
    });

    it("writes JSONL (newline-terminated JSON)", () => {
      expect(
        /JSON\.stringify\([\s\S]*?\)[\s\S]*?\}\n`?/.test(src) ||
          /JSON\.stringify\(safe\)/.test(src),
      ).toBe(true);
      expect(/\\n/.test(src) || /"\\n"/.test(src)).toBe(true);
    });

    it("daily-rotates the log file path", () => {
      expect(/error-events-\$\{yyyy\}-\$\{mm\}-\$\{dd\}/.test(src)).toBe(true);
    });

    it("uses AGS_ERROR_LOG_DIR env override", () => {
      expect(/AGS_ERROR_LOG_DIR/.test(src)).toBe(true);
    });

    it("never throws (fail-soft try/catch around appendFileSync)", () => {
      expect(/try\s*\{[\s\S]*?appendFileSync[\s\S]*?\}\s*catch/.test(src)).toBe(
        true,
      );
    });
  });

  describe("server: error-events.ts integration", () => {
    const src = read(
      "server/agent-studio/services/workspace-observability/error-events.ts",
    );

    it("imports appendErrorLog", () => {
      expect(
        /import\s+\{\s*appendErrorLog\s*\}\s+from\s+["']\.\/error-log-file/.test(
          src,
        ),
      ).toBe(true);
    });

    it("calls appendErrorLog on the ASDB-null fail-soft branch (singular)", () => {
      // The singular recordErrorEvent's `if (!db)` block must mirror to file.
      expect(
        /if\s*\(\s*!db\s*\)\s*\{[\s\S]*?appendErrorLog\([\s\S]*?\)[\s\S]*?return null;/.test(
          src,
        ),
      ).toBe(true);
    });

    it("calls appendErrorLog after successful DB insert (singular)", () => {
      expect(
        /return event;/.test(src) &&
          /appendErrorLog\(\s*\{[\s\S]*?errorEventRowId:\s*event\.id,/.test(
            src,
          ),
      ).toBe(true);
    });

    it("calls appendErrorLog in the bulk recordErrorEvents path", () => {
      // The bulk variant fan-outs the file write across the inserted batch.
      expect(
        /for\s*\(\s*const\s+event\s+of\s+events\s*\)\s*\{[\s\S]*?appendErrorLog\(/.test(
          src,
        ),
      ).toBe(true);
    });
  });

  describe("server: client-observability-router.ts", () => {
    const path = "server/agent-studio/api/client-observability-router.ts";

    it("file exists", () => {
      expect(existsSync(join(REPO_ROOT, path))).toBe(true);
    });

    const src = read(path);

    it("exports clientObservabilityRouter", () => {
      expect(/export const clientObservabilityRouter = router/.test(src)).toBe(
        true,
      );
    });

    it("defines recordClientError mutation", () => {
      expect(
        /recordClientError:\s*publicProcedure[\s\S]*?\.mutation\(/.test(src),
      ).toBe(true);
    });

    it("delegates to recordErrorEvent for unified persistence", () => {
      expect(/recordErrorEvent\(\s*\{/.test(src)).toBe(true);
    });

    it("constrains sourceKind to [a-z][a-z0-9_]* taxonomy", () => {
      expect(/\^\[a-z\]\[a-z0-9_\]\*\$/.test(src)).toBe(true);
    });

    it("never re-throws (fail-soft try/catch in the mutation handler)", () => {
      expect(/try\s*\{[\s\S]*?\}\s*catch[\s\S]*?\{[\s\S]*?ok:\s*false/.test(src)).toBe(true);
    });
  });

  describe("server: router mount", () => {
    const src = read("server/agent-studio/api/router.ts");

    it("imports clientObservabilityRouter", () => {
      expect(
        /import\s+\{\s*clientObservabilityRouter\s*\}\s+from\s+["']\.\/client-observability-router/.test(
          src,
        ),
      ).toBe(true);
    });

    it("mounts under key 'clientObservability'", () => {
      expect(/clientObservability:\s*clientObservabilityRouter,/.test(src)).toBe(
        true,
      );
    });
  });

  describe("client: error-reporter.ts", () => {
    const path = "client/src/lib/error-reporter.ts";

    it("file exists", () => {
      expect(existsSync(join(REPO_ROOT, path))).toBe(true);
    });

    const src = read(path);

    it("exports bootstrapClientErrorReporter", () => {
      expect(/export function bootstrapClientErrorReporter/.test(src)).toBe(
        true,
      );
    });

    it("wires QueryCache + MutationCache subscribers", () => {
      expect(/getMutationCache\(\)\.subscribe/.test(src)).toBe(true);
      expect(/getQueryCache\(\)\.subscribe/.test(src)).toBe(true);
    });

    it("installs window.onerror listener", () => {
      expect(/addEventListener\(\s*["']error["']/.test(src)).toBe(true);
    });

    it("installs unhandledrejection listener", () => {
      expect(/addEventListener\(\s*["']unhandledrejection["']/.test(src)).toBe(
        true,
      );
    });

    it("posts to clientObservability.recordClientError endpoint", () => {
      expect(
        /\/api\/trpc\/agentStudio\.clientObservability\.recordClientError/.test(
          src,
        ),
      ).toBe(true);
    });

    it("bypasses self-recursion when the reporter procedure itself errors", () => {
      expect(/REPORTER_PROC_PATH/.test(src)).toBe(true);
      expect(/sourceId === REPORTER_PROC_PATH/.test(src)).toBe(true);
    });

    it("coalesces identical reports within a window", () => {
      expect(/COALESCE_WINDOW_MS/.test(src)).toBe(true);
      expect(/shouldCoalesce/.test(src)).toBe(true);
    });

    it("classifies TRPCClientError vs raw Error vs unknown", () => {
      expect(/instanceof TRPCClientError/.test(src)).toBe(true);
    });
  });

  describe("client: main.tsx wiring", () => {
    const src = read("client/src/main.tsx");

    it("imports bootstrapClientErrorReporter", () => {
      expect(
        /import\s+\{\s*bootstrapClientErrorReporter\s*\}\s+from/.test(src),
      ).toBe(true);
    });

    it("calls bootstrapClientErrorReporter with the QueryClient", () => {
      expect(/bootstrapClientErrorReporter\(queryClient\)/.test(src)).toBe(
        true,
      );
    });
  });
});
