/**
 * GraphHealthAdminPanel failure-state events severity color-coding
 * — T-F.133 (menu item (o) — 25-kind failure-state UI specialization
 * via FAILURE_STATE_SEVERITY metadata mirror).
 *
 * The failure-state events list inside GraphHealthAdminPanel
 * (data sourced from `agentStudio.graphHealth.listRecentFailureStateEvents`)
 * renders one row per event. The Kind column previously rendered
 * the kind string in plain `font-mono text-xs` with no severity
 * affordance — operators had to remember which kinds were critical
 * vs warning vs info.
 *
 * T-F.133 mirrors the 25-entry FAILURE_STATE_METADATA severity map
 * client-side (same boundary-crossing pattern as
 * FAILURE_STATE_KIND_OPTIONS from T-I.64) and color-codes the kind
 * cell by severity tier: critical=destructive, warning=amber,
 * info=muted, unknown=neutral (drift fallback per lesson 45).
 *
 * Title hint surfaces the severity at hover for explicit confirmation
 * (the color is the at-a-glance signal; the title is the
 * machine-readable confirmation).
 *
 * Per-row data-testid lets source-scan tests lock the cell wrap
 * without booting the panel.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
    ),
    "utf8",
  );
}

describe("GraphHealthAdminPanel failure-state events severity color-coding (T-F.133)", () => {
  it("declares FAILURE_STATE_SEVERITY map with the correct Readonly<Record> signature", () => {
    const src = read();
    expect(src).toMatch(
      /const\s+FAILURE_STATE_SEVERITY:\s*Readonly<\s*Record<string,\s*"info"\s*\|\s*"warning"\s*\|\s*"critical">\s*>\s*=/,
    );
  });

  it("mirrors all 25 kinds from FAILURE_STATES (1:1 with FAILURE_STATE_KIND_OPTIONS)", () => {
    const src = read();
    // Extract the FAILURE_STATE_SEVERITY map body. We capture from
    // the opening brace after `= {` to the matching closing brace.
    const mapMatch = src.match(
      /const\s+FAILURE_STATE_SEVERITY:[\s\S]+?=\s*\{([\s\S]+?)\n\};/,
    );
    expect(mapMatch).not.toBeNull();
    const entries = mapMatch![1].match(/^\s*[a-z0-9_]+:\s*"(info|warning|critical)"/gm) ?? [];
    expect(entries.length).toBe(25);
  });

  it("spot-checks 3 mappings across the 3 severity tiers", () => {
    const src = read();
    // critical
    expect(src).toMatch(/promotion_failed:\s*"critical"/);
    expect(src).toMatch(/projection_sync_failed:\s*"critical"/);
    expect(src).toMatch(/neo4j_unavailable:\s*"critical"/);
    // warning
    expect(src).toMatch(/note_conflict:\s*"warning"/);
    expect(src).toMatch(/background_job_failed:\s*"warning"/);
    // info
    expect(src).toMatch(/search_index_stale:\s*"info"/);
    expect(src).toMatch(/runtime_reference_hidden_by_permission:\s*"info"/);
  });

  it("failureStateKindClass dispatches severity → tailwind class with neutral fallback", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+failureStateKindClass\(\s*kind:\s*string\s*\)/,
    );
    expect(src).toMatch(/sev\s*===\s*"critical"[\s\S]{0,80}text-destructive/);
    expect(src).toMatch(/sev\s*===\s*"warning"[\s\S]{0,80}text-amber-600/);
    expect(src).toMatch(/sev\s*===\s*"info"[\s\S]{0,80}text-muted-foreground/);
    // Lesson-45 fallback when severity map misses (server adds new kind).
    expect(src).toMatch(/return\s+""/);
  });

  it("events-list Kind cell wraps the parsed kind with failureStateKindClass + per-row testid + severity title hint", () => {
    const src = read();
    expect(src).toMatch(
      /className=\{`py-1 pr-3 font-mono text-xs \$\{failureStateKindClass\(/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-health-failure-state-event-kind-\$\{r\.id\}`\}/,
    );
    expect(src).toMatch(
      /title=\{`severity:\s*\$\{[\s\S]{0,500}FAILURE_STATE_SEVERITY\[/,
    );
  });

  it("severity title falls back to 'unknown' when the kind is missing from the map (drift signal)", () => {
    const src = read();
    expect(src).toMatch(/\?\?\s*"unknown"/);
  });

  it("preserves the existing errorClass-prefix-strip logic (regression-free; same kind parser as the original cell)", () => {
    const src = read();
    // The original cell body content (the kind name inside the cell)
    // still uses the .startsWith("failure_state:") slice pattern.
    expect(src).toMatch(
      /r\.errorClass\.startsWith\("failure_state:"\)[\s\S]{0,200}r\.errorClass\.slice\([\s\S]{0,50}"failure_state:"\.length/,
    );
  });
});
