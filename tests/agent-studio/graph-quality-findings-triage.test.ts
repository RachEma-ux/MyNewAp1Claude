/**
 * Graph Quality Findings triage / convert-to-proposal — ε-slice
 * (T-F.88 / T-F.4-ε).
 *
 * Adds the third per-row affordance after Dismiss (η) and View
 * trail (θ): a "Triage…" button on `status="open"` rows that opens
 * an inline rationale editor and submits through the pre-existing
 * `convertFindingToProposal` tRPC procedure (Phase 23 §1 server
 * work, zero new server work in this slice).
 *
 * Source-scan integrity test locks the parallel state slice + the
 * trim-on-submit logic + mutual exclusion with the dismiss editor +
 * the per-row testid namespace.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/GraphQualityFindingsPanel.tsx",
    ),
    "utf8",
  );
}

describe("Graph Quality Findings triage ε-slice (T-F.88 / T-F.4-ε)", () => {
  it("panel holds triageFindingId + triageDraft + triageError parallel state", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[triageFindingId,\s*setTriageFindingId\]\s*=\s*useState<number\s*\|\s*null>/,
    );
    expect(src).toMatch(
      /const\s+\[triageDraft,\s*setTriageDraft\]\s*=\s*useState<string>/,
    );
    expect(src).toMatch(
      /const\s+\[triageError,\s*setTriageError\]\s*=\s*useState<string\s*\|\s*null>/,
    );
  });

  it("openTriageEditor + closeTriageEditor helpers manage all three slices + the mutual exclusion", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openTriageEditor[\s\S]{0,500}setTriageFindingId\(findingId\)[\s\S]{0,80}setTriageDraft\(""\)[\s\S]{0,200}setReasonFindingId\(null\)[\s\S]{0,200}setExpandedFindingId\(null\)/,
    );
    expect(src).toMatch(
      /function\s+closeTriageEditor[\s\S]{0,200}setTriageFindingId\(null\)[\s\S]{0,80}setTriageDraft\(""\)/,
    );
  });

  it("openReasonEditor (T-F.87) now ALSO clears triage state to enforce mutual exclusion", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openReasonEditor[\s\S]{0,500}setTriageFindingId\(null\)[\s\S]{0,80}setTriageDraft\(""\)/,
    );
  });

  it("convertFindingToProposal mutation invalidates listFindings + getStats on success", () => {
    const src = readPanel();
    expect(src).toMatch(
      /triageMutation\s*=\s*[\s\S]{0,300}convertFindingToProposal\.useMutation/,
    );
    expect(src).toMatch(
      /triageMutation[\s\S]{0,500}onSuccess[\s\S]{0,300}closeTriageEditor\(\)/,
    );
    expect(src).toMatch(
      /triageMutation[\s\S]{0,500}utils\.agentStudio\.graphQuality\.listFindings\.invalidate/,
    );
    expect(src).toMatch(
      /triageMutation[\s\S]{0,500}utils\.agentStudio\.graphQuality\.getStats\.invalidate/,
    );
  });

  it("Triage button only renders when status === 'open' AND no editor is open for the row", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+isTriageable\s*=\s*f\.status\s*===\s*"open"/,
    );
    expect(src).toMatch(/isTriageable\s*&&\s*!isTriageOpen/);
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-triage-\$\{f\.id\}`\}/,
    );
  });

  it("isTriagePending is resolved per-row via mutation.variables", () => {
    const src = readPanel();
    expect(src).toMatch(
      /isTriagePending\s*=[\s\S]{0,200}triageMutation\.isPending\s*&&\s*triageMutation\.variables\?\.findingId\s*===\s*f\.id/,
    );
  });

  it("triage editor row has a textarea + Confirm + Cancel + char-count testids", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-triage-row-\$\{f\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-triage-textarea-\$\{f\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-triage-confirm-\$\{f\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-triage-cancel-\$\{f\.id\}`\}/,
    );
    expect(src).toMatch(/triageDraft\.length\}\s*\/\s*2000/);
  });

  it("Confirm trims the draft + includes rationale only when non-empty", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+trimmed\s*=\s*triageDraft\.trim\(\)[\s\S]{0,500}\.\.\.\(trimmed\s*!==\s*""\s*\?\s*\{\s*rationale:\s*trimmed\s*\}\s*:\s*\{\}\)/,
    );
  });

  it("triageError surface renders above the table on mutation failure", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-quality-triage-error"/);
  });
});
