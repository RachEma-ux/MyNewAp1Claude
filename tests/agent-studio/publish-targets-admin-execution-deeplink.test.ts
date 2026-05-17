/**
 * PublishTargetsAdminPanel execution→registry deeplink — T-F.129
 * (T-F.7-j₂ intra-panel, mechanical replication of T-F.128).
 *
 * Identical shape to T-F.128 ExtensionsAdminPanel:
 *   registry table (targetsQ.data.map) + log table
 *   (recentQ.data.map) where the log lists a key via
 *   `targetKeyById.get(r.targetId) ?? '#${r.targetId}'`. The
 *   plain-text becomes a button that highlights + scrollIntoViews
 *   the matching registry row above.
 *
 * Per-link (NOT whole-row) click so the Details "view" button +
 * highlight handler don't race (lesson 64 generalization).
 *
 * Precedent (p) (intra-panel deeplink via lifted ref Map +
 * highlightedId scalar state) opened by T-F.128, replicated here
 * with zero new infrastructure — same hook shape, same ref Map
 * type, same scrollIntoView options.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
    ),
    "utf8",
  );
}

describe("PublishTargetsAdminPanel execution→registry deeplink (T-F.129 / T-F.7-j₂ intra-panel)", () => {
  it("declares highlightedTargetId state + registry row refs map", () => {
    const src = read();
    expect(src).toMatch(/setHighlightedTargetId/);
    expect(src).toMatch(
      /targetRowRefs\s*=\s*React\.useRef<[\s\S]{0,200}Map<number,\s*HTMLTableRowElement\s*\|\s*null>[\s\S]{0,50}>\(\s*new\s+Map\(\)\s*\)/,
    );
  });

  it("handleExecutionTargetClick sets highlight + scrollIntoView via the ref map", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+handleExecutionTargetClick\(\s*targetId:\s*number\s*\)\s*\{[\s\S]{0,600}setHighlightedTargetId\(\s*targetId\s*\)[\s\S]{0,400}targetRowRefs\.current\.get\(\s*targetId\s*\)[\s\S]{0,400}scrollIntoView\(\{\s*behavior:\s*"smooth",\s*block:\s*"center"\s*\}\)/,
    );
  });

  it("registry <tr> wires the ref callback + conditional highlight class + per-row testid", () => {
    const src = read();
    expect(src).toMatch(
      /ref=\{\(el\)\s*=>\s*\{\s*targetRowRefs\.current\.set\(t\.id,\s*el\);?\s*\}\}/,
    );
    expect(src).toMatch(
      /className=\{`border-t \$\{highlightedTargetId === t\.id \? "bg-amber-100 dark:bg-amber-900\/30" : ""\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`publish-target-registry-row-\$\{t\.id\}`\}/,
    );
  });

  it("executions Target cell becomes a <button> wired to handleExecutionTargetClick", () => {
    const src = read();
    expect(src).toMatch(
      /<button[\s\S]{0,400}data-testid=\{`publish-execution-row-target-\$\{r\.id\}`\}[\s\S]{0,300}onClick=\{\(\)\s*=>\s*handleExecutionTargetClick\(r\.targetId\)\s*\}[\s\S]{0,400}targetKeyById\.get\(r\.targetId\)\s*\?\?\s*`#\$\{r\.targetId\}`/,
    );
  });

  it("Details 'view' button preserved (regression-free; unchanged toggle signature)", () => {
    const src = read();
    expect(src).toMatch(
      /data-testid=\{`publish-execution-details-toggle-\$\{r\.id\}`\}/,
    );
    expect(src).toMatch(
      /setExpandedExecutionId\([\s\S]{0,100}isExpanded \? null : r\.id/,
    );
  });
});
