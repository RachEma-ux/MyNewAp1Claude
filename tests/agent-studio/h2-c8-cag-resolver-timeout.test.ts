/**
 * H2-c8 (cycle-8 audit `/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`
 * §H2-c8) — CAG resolver timeout envelope.
 *
 * Pre-cycle-8 the CAG resolver chain (`buildCapabilityPack` →
 * `createPack` → `markPackUsed`) had no per-operation timeout. A
 * hung MCP `listTools()` (during the snapshot enumeration) or a
 * stalled ASDB write would block the orchestrator indefinitely —
 * the chat turn never returned, the user's connection hung until
 * the SSE timeout, and there was no operator signal until the
 * pile-up was visible.
 *
 * Cycle-7 H1-c7 added the same surface at the dispatcher's
 * `conn.callTool()` layer. H2-c8 lifts the pattern one level up
 * to the CAG-resolve chain via the new shared
 * `services/runtime/with-timeout.ts` helper (so PR-D's H3-c8
 * retrieval-planner timeout reuses the same primitive).
 *
 * Pinned invariants:
 *   1. `withTimeout` + `isTimeoutError` exported from the shared
 *      `runtime/with-timeout.ts` module (pure helper).
 *   2. `withTimeout` wins → throws sentinel-tagged Error;
 *      `isTimeoutError` recognizes it; the inner promise's
 *      cleanup path (clearTimeout) is exercised.
 *   3. CAG resolver imports + calls `withTimeout` on
 *      `buildFromCurrentSources` AND `createPack` AND `markPackUsed`.
 *   4. CAG resolver declares `CAG_BUILD_TIMEOUT_MS` (default 10000)
 *      + `CAG_PERSIST_TIMEOUT_MS` (default 5000) with env override
 *      + warn-on-out-of-range (cycle-7 standing pattern).
 *   5. Outer catch discriminates timeout vs generic resolution
 *      failure via `isTimeoutError` and surfaces a `cag: timeout`
 *      warning prefix for grep-ability.
 *   6. H2-c8 closure marker on resolver.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  withTimeout,
  isTimeoutError,
} from "../../server/agent-studio/services/runtime/with-timeout";

const RESOLVER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/cag/resolver.ts",
);
const TIMEOUT_HELPER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/with-timeout.ts",
);

// ─────────────────────────────────────────────────────────────────────
// 1. withTimeout helper behavior
// ─────────────────────────────────────────────────────────────────────

describe("H2-c8 — withTimeout helper", () => {
  it("resolves with the inner value when the promise wins", async () => {
    const result = await withTimeout(Promise.resolve("hello"), 100, "test");
    expect(result).toBe("hello");
  });

  it("throws a sentinel-tagged error when the timer wins", async () => {
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => resolve("late"), 200),
    );
    let caught: unknown;
    try {
      await withTimeout(slow, 50, "test op");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(isTimeoutError(caught)).toBe(true);
    expect((caught as Error).message).toContain("test op");
    expect((caught as Error).message).toContain("50ms");
  });

  it("propagates inner promise rejections (NOT tagged as timeout)", async () => {
    const rejecting = Promise.reject(new Error("inner failure"));
    let caught: unknown;
    try {
      await withTimeout(rejecting, 100, "test");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(isTimeoutError(caught)).toBe(false);
    expect((caught as Error).message).toBe("inner failure");
  });

  it("isTimeoutError returns false for non-tagged errors", () => {
    expect(isTimeoutError(new Error("plain"))).toBe(false);
    expect(isTimeoutError("string")).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
    expect(isTimeoutError({})).toBe(false);
  });

  it("default label 'operation' appears in the timeout message when none provided", async () => {
    let caught: unknown;
    try {
      await withTimeout(
        new Promise((resolve) => setTimeout(resolve, 200)),
        20,
      );
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toContain("operation");
    expect((caught as Error).message).toContain("20ms");
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. with-timeout module surface
// ─────────────────────────────────────────────────────────────────────

describe("H2-c8 — with-timeout module surface", () => {
  const src = readFileSync(TIMEOUT_HELPER_PATH, "utf8");

  it("module carries the H2-c8 + H3-c8 closure markers (shared helper)", () => {
    expect(src).toMatch(/H2-c8\b/);
    expect(src).toMatch(/H3-c8\b/);
  });

  it("uses Symbol-based sentinel (not string-based — fragile)", () => {
    expect(
      src,
      "H2-c8 violated: timeout sentinel must be a Symbol so the " +
        "isTimeoutError type-guard is structurally tagged. " +
        "String-based message matching breaks if error messages drift.",
    ).toMatch(/Symbol\("runtime-with-timeout"\)/);
  });

  it("clearTimeout in finally so timer doesn't leak past resolution", () => {
    expect(
      src,
      "H2-c8 violated: withTimeout must clearTimeout in a finally " +
        "block so the timer doesn't keep the event loop alive past " +
        "the function return on success.",
    ).toMatch(/finally\s*\{\s*if\s*\(\s*timer\s*\)\s*clearTimeout/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. CAG resolver source-scan lockstep
// ─────────────────────────────────────────────────────────────────────

describe("H2-c8 — CAG resolver wires withTimeout at the right sites", () => {
  const src = readFileSync(RESOLVER_PATH, "utf8");

  it("source carries the H2-c8 closure marker", () => {
    expect(src).toMatch(/H2-c8\b/);
  });

  it("imports withTimeout + isTimeoutError from runtime/with-timeout", () => {
    expect(
      src,
      "H2-c8 violated: resolver.ts must import the shared withTimeout " +
        "helper from runtime/with-timeout. Inlining the timeout pattern " +
        "or importing from elsewhere defeats the single-source-of-truth " +
        "contract (cycle-7 lesson #5 carried forward).",
    ).toMatch(
      /import\s*\{\s*withTimeout,\s*isTimeoutError\s*\}\s*from\s*["']\.\.\/runtime\/with-timeout["']/,
    );
  });

  it("declares CAG_BUILD_TIMEOUT_MS with env override + warn-on-out-of-range", () => {
    expect(
      src,
      "H2-c8 violated: resolver.ts must declare CAG_BUILD_TIMEOUT_MS " +
        "as an env-overridable constant with the standard validation " +
        "pattern (cycle-7 L5-c6 / H1-c7 / H7-c7 / H8-c7).",
    ).toMatch(
      /CAG_BUILD_TIMEOUT_MS[\s\S]{0,400}process\.env\.CAG_BUILD_TIMEOUT_MS[\s\S]{0,400}console\.warn/,
    );
  });

  it("CAG_BUILD_TIMEOUT_MS default is 10000ms", () => {
    expect(
      src,
      "H2-c8 violated: CAG_BUILD_TIMEOUT_MS default should be 10000 " +
        "(generous for normal MCP listing, bounded for hung servers).",
    ).toMatch(/CAG_BUILD_TIMEOUT_MS[\s\S]{0,300}return\s+10_?000;/);
  });

  it("declares CAG_PERSIST_TIMEOUT_MS with env override + warn-on-out-of-range", () => {
    expect(src).toMatch(
      /CAG_PERSIST_TIMEOUT_MS[\s\S]{0,400}process\.env\.CAG_PERSIST_TIMEOUT_MS[\s\S]{0,400}console\.warn/,
    );
  });

  it("CAG_PERSIST_TIMEOUT_MS default is 5000ms", () => {
    expect(src).toMatch(/CAG_PERSIST_TIMEOUT_MS[\s\S]{0,300}return\s+5_?000;/);
  });

  it("wraps buildFromCurrentSources with withTimeout(CAG_BUILD_TIMEOUT_MS)", () => {
    expect(
      src,
      "H2-c8 violated: the MCP-snapshot + builder chain must be " +
        "wrapped via `withTimeout(buildFromCurrentSources(input), " +
        "CAG_BUILD_TIMEOUT_MS, ...)`. Without this wrap, a hung " +
        "MCP listTools() blocks the orchestrator indefinitely.",
    ).toMatch(
      /withTimeout\(\s*buildFromCurrentSources\(input\)[\s\S]{0,200}CAG_BUILD_TIMEOUT_MS/,
    );
  });

  it("wraps createPack with withTimeout(CAG_PERSIST_TIMEOUT_MS)", () => {
    expect(
      src,
      "H2-c8 violated: createPack DB write must be wrapped via " +
        "withTimeout(createPack({...}), CAG_PERSIST_TIMEOUT_MS, ...).",
    ).toMatch(
      /withTimeout\(\s*createPack\([\s\S]{0,1500}CAG_PERSIST_TIMEOUT_MS/,
    );
  });

  it("wraps markPackUsed with withTimeout(CAG_PERSIST_TIMEOUT_MS)", () => {
    expect(src).toMatch(
      /withTimeout\(\s*markPackUsed\([\s\S]{0,200}CAG_PERSIST_TIMEOUT_MS/,
    );
  });

  it("outer catch discriminates timeout via isTimeoutError + emits 'cag: timeout' prefix", () => {
    // Load-bearing: a future PR that "simplified" by collapsing the
    // discrimination would silently restore the operator-can't-tell-
    // why-it-failed bug.
    expect(
      src,
      "H2-c8 violated: the outer catch must discriminate timeout " +
        "from generic failure via isTimeoutError(err) and emit a " +
        "warning prefixed `cag: timeout` so operator forensics can " +
        "filter timeout cases without parsing the error message.",
    ).toMatch(
      /isTimeoutError\(err\)[\s\S]{0,500}cag:\s*timeout/,
    );
  });
});
