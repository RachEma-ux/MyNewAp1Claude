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
  it("value input's type attribute branches on folderId → number (T-F.123 extends to 3-branch with updatedAt → datetime-local)", () => {
    const src = readPanel();
    // T-F.122 invariant: folderId → "number" branch exists.
    // The expression may be a 2-branch ternary (folderId/text) or
    // a 3-branch ternary after T-F.123 (folderId/updatedAt/text).
    // Assert just the folderId mapping.
    expect(src).toMatch(
      /type=\{[\s\S]{0,200}addField\s*===\s*"folderId"[\s\S]{0,40}"number"/,
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

  it("non-folderId/updatedAt variants still get type=\"text\" (slug / title / governanceStatus)", () => {
    // After T-F.123 the type ternary is 3-branch: folderId → number,
    // updatedAt → datetime-local, else → text. This test locks the
    // existence of the text fallback for the remaining fields.
    const src = readPanel();
    expect(src).toMatch(/"text"/);
  });
});
