/**
 * Extensions recent invocations count label — PR-V1-214.
 *
 * Symmetric with publish executions count label (#964). Surfaces
 * the "you are viewing a window" hint above the invocations log
 * so operators don't think they have the full history.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-214 — extensions recent invocations count label", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );

  it("renders count label with testid + singular/plural + capped-at-50 hint", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      'data-testid="extensions-recent-invocations-count-label"',
    );
    expect(src).toContain("most-recent invocation");
    expect(/recentQ\.data\.length\s*===\s*1\s*\?\s*""\s*:\s*"s"/.test(src)).toBe(
      true,
    );
    expect(
      /recentQ\.data\.length\s*>=\s*50\s*\?\s*"\s*\(capped at 50\)"\s*:\s*""/.test(
        src,
      ),
    ).toBe(true);
  });
});
