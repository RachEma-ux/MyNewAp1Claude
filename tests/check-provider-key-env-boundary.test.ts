/**
 * Tests for `scripts/check-provider-key-env-boundary.ts`.
 *
 * Validates the classifier shape + the allowlist contract without
 * shelling out to the script (the full filesystem walk is exercised
 * by CI's `check:architecture` run).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const scriptSrc = readFileSync(
  join(process.cwd(), "scripts/check-provider-key-env-boundary.ts"),
  "utf8",
);

describe("check-provider-key-env-boundary — script declarations", () => {
  it("declares the boot-time seed script as the only legitimate provider-env reader", () => {
    expect(scriptSrc).toContain(
      "scripts/provider-connections/seed-from-env.ts",
    );
    expect(scriptSrc).toContain('"<seed-script>"');
  });

  it("documents NON_PROVIDER_KEYS for service tokens that match *_API_KEY shape", () => {
    expect(scriptSrc).toContain("NON_PROVIDER_KEYS");
    expect(scriptSrc).toContain("BUILT_IN_FORGE_API_KEY");
    expect(scriptSrc).toContain("OMNIRAG_API_KEY");
  });

  it("lists every legacy exception (LR-01..LR-06) with a deadline phase", () => {
    const ids = ["LR-01", "LR-02", "LR-03", "LR-04", "LR-06"];
    for (const id of ids) {
      expect(scriptSrc, `register id ${id}`).toContain(id);
    }
    // LR-05 (OmniRAG) is exempted globally via NON_PROVIDER_KEYS, not
    // a per-file allowlist row, so it is intentionally absent here.
    // Phase 27.7 flipped LR-01/02/03/04/06 deadlines to Phase 28; the
    // test asserts the contract (every entry has a `deadlinePhase`),
    // not the specific calendar phase, so a future deadline flip
    // doesn't fail this test again.
    const deadlineMatches = scriptSrc.match(/deadlinePhase:\s*"Phase \d+"/g) ?? [];
    expect(deadlineMatches.length, "every allowlist row carries a Phase N deadline").toBeGreaterThanOrEqual(ids.length);
    expect(scriptSrc).toContain("Phase 28");
  });

  it("flags writes to process.env provider keys (regression guard for PR #100)", () => {
    expect(scriptSrc).toContain("envWriteRegex");
    expect(scriptSrc).toMatch(/process\\\.env.*=.*=.*PR #100/s);
  });

  it("scopes dynamic-index zone to Agent Studio runtime adapters only", () => {
    const zone = scriptSrc.match(
      /AGENT_STUDIO_DYNAMIC_ZONE_PREFIXES = \[([\s\S]*?)\];/,
    );
    expect(zone).not.toBeNull();
    expect(zone![1]).toContain("server/agent-studio/adapters/");
    expect(zone![1]).toContain("server/agent-studio/runtime/");
    // Generic services/api are intentionally excluded — see hook-runner
    // sandboxed env passthrough, which uses a static PATH-only allowlist.
    expect(zone![1]).not.toContain("server/agent-studio/services/");
    expect(zone![1]).not.toContain("server/agent-studio/api/");
  });
});

describe("check-provider-key-env-boundary — classifier samples", () => {
  const PROVIDER_KEY_SUFFIX = "_API_KEY";
  const NON_PROVIDER_KEYS = new Set([
    "BUILT_IN_FORGE_API_KEY",
    "OMNIRAG_API_KEY",
  ]);

  function isProviderKey(name: string): boolean {
    if (!name.endsWith(PROVIDER_KEY_SUFFIX)) return false;
    if (NON_PROVIDER_KEYS.has(name)) return false;
    return true;
  }

  it("classifies provider keys vs service tokens", () => {
    const samples: Array<[string, boolean]> = [
      ["OPENAI_API_KEY", true],
      ["ANTHROPIC_API_KEY", true],
      ["GOOGLE_API_KEY", true],
      ["GROQ_API_KEY", true],
      ["AZURE_OPENAI_API_KEY", true],
      ["BUILT_IN_FORGE_API_KEY", false],
      ["OMNIRAG_API_KEY", false],
      ["DATABASE_URL", false],
      ["NODE_ENV", false],
    ];
    for (const [k, expected] of samples) {
      expect(isProviderKey(k), `key=${k}`).toBe(expected);
    }
  });

  it("env literal-read regex catches dot-form and bracket-form", () => {
    const re =
      /process\.env(?:\.([A-Z0-9_]+)|\[\s*["']([A-Z0-9_]+)["']\s*\])/g;
    const cases: Array<[string, string | null]> = [
      ["const x = process.env.OPENAI_API_KEY;", "OPENAI_API_KEY"],
      ['const x = process.env["ANTHROPIC_API_KEY"];', "ANTHROPIC_API_KEY"],
      ["const x = process.env['GROQ_API_KEY'];", "GROQ_API_KEY"],
      ["const x = process.env[varName];", null],
      ["const x = settings.OPENAI_API_KEY;", null],
    ];
    for (const [src, expected] of cases) {
      re.lastIndex = 0;
      const m = re.exec(src);
      const got = m ? m[1] ?? m[2] ?? null : null;
      expect(got, `src=${src}`).toBe(expected);
    }
  });

  it("env write regex catches assignments, not equality", () => {
    const re =
      /process\.env(?:\.([A-Z0-9_]+)|\[\s*["']([A-Z0-9_]+)["']\s*\])\s*=(?!=)/g;
    const writes = [
      "process.env.OPENAI_API_KEY = config.apiKey",
      'process.env["ANTHROPIC_API_KEY"] = pat',
    ];
    const reads = [
      "process.env.OPENAI_API_KEY === undefined",
      "process.env.OPENAI_API_KEY == null",
      "if (process.env.OPENAI_API_KEY)",
    ];
    for (const w of writes) {
      re.lastIndex = 0;
      expect(re.exec(w), `write=${w}`).not.toBeNull();
    }
    for (const r of reads) {
      re.lastIndex = 0;
      expect(re.exec(r), `read=${r}`).toBeNull();
    }
  });
});
