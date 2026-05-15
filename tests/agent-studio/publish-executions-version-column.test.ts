/**
 * Publish-executions version column — PR-V1-220.
 *
 * `PublishExecutionRow.sourceVersionId` is the frozen
 * source-note version id at dispatch time — the rollback anchor.
 * It was exposed on the server-side shape but never rendered in
 * the executions table. Adds a Version column with first-12-char
 * monospaced rendering and full-id tooltip.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-220 — publish-executions version column", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );
  const queries = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/admin-queries.ts",
  );

  it("renders a Version header + per-row testid + slice(0, 12)", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(">\n                      Version\n                    </th>");
    expect(src).toContain("`publish-execution-version-${r.id}`");
    // First 12 chars rendered; full id only in title tooltip.
    expect(src).toContain("r.sourceVersionId.slice(0, 12)");
    expect(src).toContain("title={r.sourceVersionId ?? undefined}");
  });

  it("renders em-dash for null sourceVersionId", () => {
    const src = readFileSync(panel, "utf8");
    // The version cell uses the slice/em-dash conditional. Match
    // loosely on the conditional structure rather than the exact
    // whitespace.
    expect(
      /r\.sourceVersionId[\s\S]{0,40}slice\(0,\s*12\)[\s\S]{0,40}"—"/.test(src),
    ).toBe(true);
  });

  it("contract anchor: PublishExecutionRow still carries sourceVersionId: string | null", () => {
    const src = readFileSync(queries, "utf8");
    // If the field is renamed or its nullability changes, this test
    // catches it before the column silently renders blanks.
    expect(/readonly\s+sourceVersionId:\s*string\s*\|\s*null/.test(src)).toBe(
      true,
    );
  });
});
