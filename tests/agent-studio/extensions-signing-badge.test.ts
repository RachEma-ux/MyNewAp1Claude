/**
 * Extensions signing indicator — PR-V1-197.
 *
 * Source-scan that the name cell now renders either an inline
 * `[unsigned]` destructive badge (signingKeyId == null) or a muted
 * `(<key-id>)` chip (signed). Surfaces dev-mode / unsigned bundles
 * at a glance without needing a separate column.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-197 — extensions signing indicator", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );

  it("renders [unsigned] destructive badge for signingKeyId == null", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain("[unsigned]");
    expect(src).toContain("extension-row-unsigned-");
    expect(
      /ext\.signingKeyId\s*==\s*null\s*\?\s*\(/.test(src),
    ).toBe(true);
    expect(/text-destructive[\s\S]{0,150}\[unsigned\]/.test(src)).toBe(true);
  });

  it("renders signed badge as muted chip when signingKeyId is present", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain("extension-row-signing-");
    expect(/text-muted-foreground[\s\S]{0,200}\$\{ext\.signingKeyId\}/.test(src)).toBe(
      true,
    );
    // Tooltip wording.
    expect(/Signed by key/.test(src)).toBe(true);
  });
});
