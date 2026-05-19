/**
 * No-Deferral continuation-7 slice 54 — bases-service caller-migration
 * source-scan lockstep.
 *
 * Extends T-B.3 (PR #1516, which pinned the createBase + listBases
 * routing) to cover the 8 remaining `getAsDb()` call sites in
 * `services/bases/bases-service.ts`. Each function that takes a
 * `baseId` or operates on a `rowId` now follows the Path-A
 * "bootstrap lookup, then route through getAsDbForWorkspace" pattern.
 *
 * Source-scan only — behavioral correctness is exercised by the
 * existing bases-service integration tests + the region-routing tests
 * on `getAsDbForWorkspace` itself.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const SERVICE = join(
  resolve(__dirname, "../.."),
  "server/agent-studio/services/bases/bases-service.ts",
);

const src = readFileSync(SERVICE, "utf8");

describe("slice 54 — bases-service caller-migration tail", () => {
  it("declares the resolveWorkspaceIdForBase helper", () => {
    expect(
      /async function resolveWorkspaceIdForBase[\s\S]+?agsBases\.workspaceId/.test(
        src,
      ),
    ).toBe(true);
  });

  it("declares the resolveWorkspaceIdForBaseRow helper (joins rows → bases)", () => {
    expect(
      /async function resolveWorkspaceIdForBaseRow[\s\S]+?innerJoin\(agsBases[\s\S]+?agsBases\.workspaceId/.test(
        src,
      ),
    ).toBe(true);
  });

  describe("each migrated function routes through getAsDbForWorkspace", () => {
    const fnNames = [
      "getBaseSnapshot",
      "updateBase",
      "createBaseColumn",
      "listBaseColumns",
      "createBaseRow",
      "updateBaseRow",
      "deleteBaseRow",
      "listBaseRows",
    ] as const;

    for (const fn of fnNames) {
      it(`${fn} uses the lookupDb → resolve → getAsDbForWorkspace pattern`, () => {
        const block = src.match(
          new RegExp(`export async function ${fn}[\\s\\S]+?\\n\\}\\n`),
        );
        expect(block).not.toBeNull();
        const body = block?.[0] ?? "";
        expect(/const lookupDb = getAsDb\(\);/.test(body)).toBe(true);
        expect(
          /const workspaceId = await resolveWorkspaceIdFor(Base|BaseRow)/.test(
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

  it("every getAsDb() call site is either a lookupDb assignment or a createBase/listBases routing fallback", () => {
    // Strip comments + backtick-quoted mentions so the assertion
    // counts actual call sites only.
    const code = src
      .split("\n")
      .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .map((l) => l.replace(/`[^`]*`/g, ""))
      .join("\n");
    const directCalls = code.match(/getAsDb\(\)/g) ?? [];
    // Expected call sites:
    //   - createBase: `getAsDbForWorkspace(ws) ?? getAsDb()` + `: getAsDb()` fallback = 2
    //   - listBases: same shape = 2
    //   - 8 migrated functions: 1 `lookupDb = getAsDb()` each = 8
    // Total = 12 direct calls in the actual code.
    expect(directCalls.length).toBe(12);
  });
});
