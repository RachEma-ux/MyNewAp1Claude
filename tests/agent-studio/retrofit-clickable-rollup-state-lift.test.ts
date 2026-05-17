/**
 * Retrofit clickable-rollup state-lift — T-F.125 (T-F.7-j₂ fusion).
 *
 * Closes the (j₂) clickable-rollup fusion deferred from T-F.112.
 * Lifts retryJobKind/cancelJobKind/tabValue state from
 * BulkJobOpsPanel + Tabs up to RetrofitPage so a click on a
 * jobs-by-kind row can fill BOTH retry+cancel forms AND switch
 * the active tab to bulk-job-ops in a single gesture.
 *
 * Source-scan locks:
 * - state-lift shape (3 useStates on RetrofitPage + Tabs controlled mode)
 * - handleKindClick fan-out (setRetryJobKind + setCancelJobKind + setTabValue)
 * - prop wiring (Observability gets onClickKind; BulkJobOps gets retry/cancel)
 * - JobsByKindBreakdownCard optional onClickKind prop + Kind cell branches
 *   on its presence
 * - BulkJobOpsPanel signature lifted (declares props instead of local state)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/pages/RetrofitPage.tsx",
    ),
    "utf8",
  );
}

describe("Retrofit clickable-rollup state-lift (T-F.125 / T-F.7-j₂ fusion)", () => {
  it("RetrofitPage declares lifted state: tabValue + retryJobKind + cancelJobKind", () => {
    const src = read();
    expect(src).toMatch(
      /const\s+\[tabValue,\s*setTabValue\][\s\S]{0,150}useState<string>\("ingestion"\)/,
    );
    expect(src).toMatch(
      /const\s+\[retryJobKind,\s*setRetryJobKind\][\s\S]{0,150}useState<string>\(""\)/,
    );
    expect(src).toMatch(
      /const\s+\[cancelJobKind,\s*setCancelJobKind\][\s\S]{0,150}useState<string>\(""\)/,
    );
  });

  it("handleKindClick fans out to all 3 lifted slices", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+handleKindClick\(kind:\s*string\):\s*void[\s\S]{0,400}setRetryJobKind\(kind\)[\s\S]{0,150}setCancelJobKind\(kind\)[\s\S]{0,200}setTabValue\("bulk-job-ops"\)/,
    );
  });

  it("Tabs is in controlled mode (value + onValueChange, no defaultValue)", () => {
    const src = read();
    expect(src).toMatch(
      /<Tabs\s+value=\{tabValue\}\s+onValueChange=\{setTabValue\}>/,
    );
    expect(src).not.toMatch(/<Tabs\s+defaultValue=/);
  });

  it("ObservabilityStatsPanel receives onClickKind={handleKindClick}", () => {
    const src = read();
    expect(src).toMatch(
      /<ObservabilityStatsPanel\s+onClickKind=\{handleKindClick\}\s*\/>/,
    );
  });

  it("BulkJobOpsPanel receives lifted retry/cancel state via props", () => {
    const src = read();
    expect(src).toMatch(
      /<BulkJobOpsPanel[\s\S]{0,500}retryJobKind=\{retryJobKind\}[\s\S]{0,200}setRetryJobKind=\{setRetryJobKind\}[\s\S]{0,200}cancelJobKind=\{cancelJobKind\}[\s\S]{0,200}setCancelJobKind=\{setCancelJobKind\}/,
    );
  });

  it("ObservabilityStatsPanel signature gains optional onClickKind prop", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+ObservabilityStatsPanel\(\s*\{\s*onClickKind,?\s*\}:\s*\{[\s\S]{0,400}onClickKind\?:\s*\(kind:\s*string\)\s*=>\s*void;?\s*\}\s*\)/,
    );
  });

  it("ObservabilityStatsPanel forwards onClickKind to JobsByKindBreakdownCard", () => {
    const src = read();
    expect(src).toMatch(
      /<JobsByKindBreakdownCard[\s\S]{0,500}onClickKind=\{onClickKind\}/,
    );
  });

  it("JobsByKindBreakdownCard signature gains optional onClickKind prop", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+JobsByKindBreakdownCard\(\s*\{[\s\S]{0,500}onClickKind,?\s*\}:\s*\{[\s\S]{0,800}onClickKind\?:\s*\(kind:\s*string\)\s*=>\s*void;?/,
    );
  });

  it("Kind cell branches on onClickKind presence (button when set, plain text otherwise)", () => {
    const src = read();
    expect(src).toMatch(
      /\{onClickKind\s*\?\s*\([\s\S]{0,500}<button[\s\S]{0,500}onClick=\{\(\)\s*=>\s*onClickKind\(k\)\}[\s\S]{0,300}data-testid=\{`retrofit-jobs-by-kind-row-\$\{k\}-click`\}[\s\S]{0,300}\)\s*:\s*\(\s*k\s*\)\s*\}/,
    );
  });

  it("BulkJobOpsPanel signature lifted: declares retryJobKind/setRetryJobKind/cancelJobKind/setCancelJobKind as props instead of local useState", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+BulkJobOpsPanel\(\s*\{[\s\S]{0,400}retryJobKind,[\s\S]{0,100}setRetryJobKind,[\s\S]{0,100}cancelJobKind,[\s\S]{0,100}setCancelJobKind,[\s\S]{0,500}retryJobKind:\s*string;[\s\S]{0,200}setRetryJobKind:\s*\(v:\s*string\)\s*=>\s*void;[\s\S]{0,200}cancelJobKind:\s*string;[\s\S]{0,200}setCancelJobKind:\s*\(v:\s*string\)\s*=>\s*void;/,
    );
    // Confirm the local useState declarations for retryJobKind +
    // cancelJobKind are GONE (only retryLimit / cancelStatuses /
    // cancelLimit remain local).
    expect(src).not.toMatch(
      /function\s+BulkJobOpsPanel\([\s\S]{0,800}const\s+\[retryJobKind,\s*setRetryJobKind\]\s*=\s*useState/,
    );
  });
});
