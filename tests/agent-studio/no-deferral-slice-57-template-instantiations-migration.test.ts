/**
 * No-Deferral continuation-8 slice 57 — template-instantiations
 * caller-migration source-scan lockstep.
 *
 * Extends the existing PR-V1-131 migration of
 * `recordTemplateInstantiation` to cover the 3 remaining `getAsDb()`
 * call sites in `services/vault/template-instantiations.ts`. Two
 * reusable resolution helpers (`resolveWorkspaceIdForTemplate`,
 * `resolveWorkspaceIdForNote`) are extracted so writes + reads share
 * the same chain; `recordTemplateInstantiation` is refactored to use
 * the helper instead of an inline JOIN.
 *
 * Source-scan only — behavioral correctness is covered by the
 * existing template-instantiation integration tests + the
 * region-routing tests on `getAsDbForWorkspace` itself.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const SERVICE = join(
  resolve(__dirname, "../.."),
  "server/agent-studio/services/vault/template-instantiations.ts",
);

const src = readFileSync(SERVICE, "utf8");

describe("slice 57 — template-instantiations caller migration", () => {
  it("declares resolveWorkspaceIdForTemplate (template → vault → workspace)", () => {
    const block = src.match(
      /async function resolveWorkspaceIdForTemplate[\s\S]+?\n\}/,
    );
    expect(block).not.toBeNull();
    const body = block?.[0] ?? "";
    expect(/agsVaultTemplates/.test(body)).toBe(true);
    expect(/innerJoin\(agsVaults/.test(body)).toBe(true);
    expect(/agsVaults\.workspaceId/.test(body)).toBe(true);
  });

  it("declares resolveWorkspaceIdForNote (note → vault → workspace)", () => {
    const block = src.match(
      /async function resolveWorkspaceIdForNote[\s\S]+?\n\}/,
    );
    expect(block).not.toBeNull();
    const body = block?.[0] ?? "";
    expect(/agsVaultNotes/.test(body)).toBe(true);
    expect(/innerJoin\(agsVaults/.test(body)).toBe(true);
    expect(/agsVaults\.workspaceId/.test(body)).toBe(true);
  });

  it("imports agsVaultTemplates from the vault schema (needed for the template helper)", () => {
    expect(
      /import\s*\{[^}]*\bagsVaultTemplates\b[^}]*\}\s*from\s*["'][^"']*agent-studio-vault/.test(
        src,
      ),
    ).toBe(true);
  });

  describe("each migrated function routes through getAsDbForWorkspace", () => {
    const fnConfigs = [
      {
        name: "recordTemplateInstantiation",
        helper: "resolveWorkspaceIdForNote",
      },
      {
        name: "listInstantiationsByTemplate",
        helper: "resolveWorkspaceIdForTemplate",
      },
      {
        name: "listInstantiationsByNote",
        helper: "resolveWorkspaceIdForNote",
      },
      {
        name: "countDistinctDigestsForTemplate",
        helper: "resolveWorkspaceIdForTemplate",
      },
    ] as const;

    for (const { name, helper } of fnConfigs) {
      it(`${name} uses lookupDb → ${helper} → getAsDbForWorkspace pattern`, () => {
        const block = src.match(
          new RegExp(`export async function ${name}[\\s\\S]+?\\n\\}\\n`),
        );
        expect(block).not.toBeNull();
        const body = block?.[0] ?? "";
        expect(/const lookupDb = getAsDb\(\);/.test(body)).toBe(true);
        expect(
          new RegExp(`const workspaceId = await ${helper}\\(lookupDb`).test(
            body,
          ),
        ).toBe(true);
        expect(
          /workspaceId\s*!=\s*null[\s\S]*?getAsDbForWorkspace\(workspaceId\)\s*\?\?\s*lookupDb/.test(
            body,
          ),
        ).toBe(true);
      });
    }
  });

  it("recordTemplateInstantiation no longer carries the inline JOIN (uses the helper)", () => {
    const block = src.match(
      /export async function recordTemplateInstantiation[\s\S]+?\n\}\n/,
    );
    expect(block).not.toBeNull();
    const body = block?.[0] ?? "";
    // The function should NOT have its own inline innerJoin(agsVaults
    // anymore — that chain lives in the helper.
    expect(/innerJoin\(agsVaults/.test(body)).toBe(false);
  });

  it("every getAsDb() call site is now a lookupDb assignment (4 total)", () => {
    const code = src
      .split("\n")
      .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .map((l) => l.replace(/`[^`]*`/g, ""))
      .join("\n");
    const directCalls = code.match(/getAsDb\(\)/g) ?? [];
    // 4 lookupDb assignments, one per migrated function. No raw
    // getAsDb() reads remain.
    expect(directCalls.length).toBe(4);
  });
});
