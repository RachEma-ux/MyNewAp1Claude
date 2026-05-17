/**
 * Bases type-aware folderId input — T-F.122 (T-F.2-γ-polish δ).
 *
 * Replaces the rich-form add/edit value input's `type` from "text"
 * to "number" when the selected field is `folderId`. Adds `min=1`
 * + `step=1` to match the FolderIdEqSchema contract
 * (`z.number().int().positive()`). Other 4 variants keep text
 * input — datetime-local and multi-token chips ship as separate
 * polish slices.
 *
 * Source-scan locks the conditional type / min / step + verifies
 * non-folderId fields still get text input.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/BasesPanel.tsx",
    ),
    "utf8",
  );
}

describe("Bases type-aware folderId input (T-F.122 / T-F.2-γ-polish δ)", () => {
  it("value input's type attribute toggles on addField === 'folderId'", () => {
    const src = readPanel();
    expect(src).toMatch(
      /type=\{addField\s*===\s*"folderId"\s*\?\s*"number"\s*:\s*"text"\}/,
    );
  });

  it("min and step attributes set to 1 for folderId, undefined otherwise (matches FolderIdEqSchema contract)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /min=\{addField\s*===\s*"folderId"\s*\?\s*1\s*:\s*undefined\}/,
    );
    expect(src).toMatch(
      /step=\{addField\s*===\s*"folderId"\s*\?\s*1\s*:\s*undefined\}/,
    );
  });

  it("placeholder copy preserved per-field (existing operator hint behaviour)", () => {
    const src = readPanel();
    expect(src).toMatch(/"positive integer"/);
    expect(src).toMatch(/"draft,published \(comma-separated\)"/);
    expect(src).toMatch(/"ISO-8601 \(e\.g\. 2026-01-01T00:00:00Z\)"/);
  });

  it("non-folderId variants still get type=\"text\" (no regression for slug / title / governanceStatus / updatedAt)", () => {
    // The ternary expression covers both branches; this assertion
    // documents that ALL non-folderId fields fall through to "text"
    // by the single ternary's else-branch.
    const src = readPanel();
    expect(src).toMatch(
      /type=\{addField\s*===\s*"folderId"\s*\?\s*"number"\s*:\s*"text"\}/,
    );
    expect(src).not.toMatch(
      /type=\{addField\s*===\s*"updatedAt"\s*\?\s*"datetime-local"/,
    );
  });
});
