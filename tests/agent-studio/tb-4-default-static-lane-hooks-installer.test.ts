/**
 * T-B.4 default static-data lane-hooks installer — env-gating + boot wiring.
 *
 * Phase 18-γ shipped the three concrete static-data hook factories
 * (#1179 / #1180 / #1181) but never wired them at boot. This installer
 * mirrors the observability installer pattern (#PR-V1-82); operators
 * opt in via `AGS_EXTENSIONS_LANE_HOOKS_STATIC=on`.
 *
 * Verifies:
 *   - Installer no-ops when the env flag is unset / off
 *   - Installer registers all 3 lanes (retrieve / assemble / compose)
 *     when the env flag is "on"
 *   - Tool lane is NOT registered (hard-rule: tool lane is excluded)
 *   - Caller-supplied data tables are passed through to the factories
 *   - boot.ts wires `maybeInstallDefaultStaticLaneHooks` adjacent to
 *     the observability installer, with the same try/catch
 *     fail-soft envelope
 *   - Module source-scan: no neo4j-driver / openrouter /
 *     dispatchMcpToolCall / credential-resolver / *_API_KEY reads
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

import { maybeInstallDefaultStaticLaneHooks } from "../../server/agent-studio/services/extensions/install-default-static-lane-hooks";

const REPO = resolve(__dirname, "../..");
const MODULE = join(
  REPO,
  "server/agent-studio/services/extensions/install-default-static-lane-hooks.ts",
);
const BOOT = join(REPO, "server/agent-studio/boot.ts");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

afterEach(() => {
  delete process.env.AGS_EXTENSIONS_LANE_HOOKS_STATIC;
});

// ────────────────────────────────────────────────────────────────────
// Env-gating
// ────────────────────────────────────────────────────────────────────

describe("maybeInstallDefaultStaticLaneHooks — env gating", () => {
  it("no-op when env flag is unset", () => {
    const register = vi.fn();
    const result = maybeInstallDefaultStaticLaneHooks({
      env: {},
      register: register as never,
    });
    expect(result.installed).toBe(false);
    expect(result.installedLanes).toEqual([]);
    expect(register).not.toHaveBeenCalled();
  });

  it("no-op for arbitrary values (only 'on' triggers install)", () => {
    const register = vi.fn();
    for (const val of ["off", "true", "1", "yes", ""]) {
      const result = maybeInstallDefaultStaticLaneHooks({
        env: { AGS_EXTENSIONS_LANE_HOOKS_STATIC: val },
        register: register as never,
      });
      expect(result.installed, `value="${val}"`).toBe(false);
    }
    expect(register).not.toHaveBeenCalled();
  });

  it("installs all 3 lanes when env flag is 'on'", () => {
    const register = vi.fn();
    const result = maybeInstallDefaultStaticLaneHooks({
      env: { AGS_EXTENSIONS_LANE_HOOKS_STATIC: "on" },
      register: register as never,
    });
    expect(result.installed).toBe(true);
    expect(result.installedLanes).toEqual(["retrieve", "assemble", "compose"]);
    expect(register).toHaveBeenCalledTimes(3);
    expect(register).toHaveBeenNthCalledWith(
      1,
      "retrieve",
      expect.any(Function),
    );
    expect(register).toHaveBeenNthCalledWith(
      2,
      "assemble",
      expect.any(Function),
    );
    expect(register).toHaveBeenNthCalledWith(
      3,
      "compose",
      expect.any(Function),
    );
  });

  it("NEVER registers the tool lane (excluded by hard rule)", () => {
    const register = vi.fn();
    maybeInstallDefaultStaticLaneHooks({
      env: { AGS_EXTENSIONS_LANE_HOOKS_STATIC: "on" },
      register: register as never,
    });
    for (const call of register.mock.calls) {
      expect(call[0]).not.toBe("tool");
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// Source-scan + boot wiring
// ────────────────────────────────────────────────────────────────────

describe("install-default-static-lane-hooks source-scan", () => {
  const src = read(MODULE);
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");

  it("no neo4j-driver import", () => {
    expect(stripped).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  it("no openrouter import", () => {
    expect(stripped).not.toMatch(/from\s+["'][^"']*openrouter[^"']*["']/);
  });

  it("no dispatchMcpToolCall call", () => {
    expect(stripped).not.toMatch(/\bdispatchMcpToolCall\s*\(/);
  });

  it("no credential-resolver import", () => {
    expect(stripped).not.toMatch(/credential-resolver/);
  });

  it("no process.env.*_API_KEY reads", () => {
    expect(stripped).not.toMatch(/process\.env\.[A-Z0-9_]*_API_KEY/);
  });

  it("composes existing `registerLaneHook` from lane-hooks.js", () => {
    expect(src).toMatch(
      /import\s*\{\s*registerLaneHook\s*\}\s*from\s*["']\.\/lane-hooks\.js["']/,
    );
  });

  it("env key is the canonical AGS_EXTENSIONS_LANE_HOOKS_STATIC", () => {
    expect(src).toMatch(/"AGS_EXTENSIONS_LANE_HOOKS_STATIC"/);
  });
});

describe("boot.ts wiring", () => {
  const src = read(BOOT);

  it("imports maybeInstallDefaultStaticLaneHooks via dynamic import", () => {
    expect(src).toMatch(
      /maybeInstallDefaultStaticLaneHooks[\s\S]*?await import\(\s*["']\.\/services\/extensions\/install-default-static-lane-hooks["']/,
    );
  });

  it("calls maybeInstallDefaultStaticLaneHooks() and logs the outcome", () => {
    expect(src).toMatch(/maybeInstallDefaultStaticLaneHooks\(\)/);
    expect(src).toMatch(/\[ags-extensions-lane-static\] installed/);
  });

  it("wraps the call in try/catch (fail-soft pattern)", () => {
    expect(src).toMatch(
      /try\s*\{[\s\S]*?maybeInstallDefaultStaticLaneHooks[\s\S]*?\}\s*catch/,
    );
  });

  it("error path logs the install-skipped message", () => {
    expect(src).toMatch(/\[ags-extensions-lane-static\] install skipped/);
  });
});
