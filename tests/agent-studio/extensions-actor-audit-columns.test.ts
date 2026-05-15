/**
 * Extensions actor-audit columns — PR-V1-195.
 *
 * Source-scan that the three actor user-id fields written by the
 * install/approve/setStatus mutations (already in the DB schema)
 * are now surfaced on the read shape (ExtensionRecord) and rendered
 * inline on the admin panel.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-195 — extensions actor-audit columns", () => {
  const contracts = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/contracts.ts",
  );
  const manifest = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/manifest.ts",
  );
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );

  it("ExtensionRecord exposes the 3 actor fields", () => {
    const src = readFileSync(contracts, "utf8");
    expect(
      /installedByUserId:\s*number\s*\|\s*null/.test(src),
    ).toBe(true);
    expect(/approvedByUserId:\s*number\s*\|\s*null/.test(src)).toBe(true);
    expect(/disabledByUserId:\s*number\s*\|\s*null/.test(src)).toBe(true);
  });

  it("rowToExtension populates the 3 actor fields from the DB row", () => {
    const src = readFileSync(manifest, "utf8");
    expect(
      /installedByUserId:\s*\(r\.installedByUserId\s+as\s+number\s*\|\s*null\)\s*\?\?\s*null/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /approvedByUserId:\s*\(r\.approvedByUserId\s+as\s+number\s*\|\s*null\)\s*\?\?\s*null/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /disabledByUserId:\s*\(r\.disabledByUserId\s+as\s+number\s*\|\s*null\)\s*\?\?\s*null/.test(
        src,
      ),
    ).toBe(true);
  });

  it("ExtensionsAdminPanel renders an Actors column with all 3 ids", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(">Actors<");
    expect(src).toContain("extension-row-actors-");
    // Display shape: "installedBy / approvedBy / disabledBy"
    expect(
      /\$\{ext\.installedByUserId\s*\?\?\s*"—"\}\s*\/\s*\$\{ext\.approvedByUserId\s*\?\?\s*"—"\}\s*\/\s*\$\{ext\.disabledByUserId\s*\?\?\s*"—"\}/.test(
        src,
      ),
    ).toBe(true);
  });
});
