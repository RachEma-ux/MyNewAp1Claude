/**
 * Graph Quality Findings dismiss-with-reason — η-slice
 * (T-F.87 / T-F.4-η).
 *
 * Refactors T-F.85's one-click Dismiss button into a two-step
 * inline reason editor: click "Dismiss…" opens an inline textarea
 * + Confirm/Cancel row; confirm submits `dismissFinding` with the
 * optional trimmed `reason` field that the server-side procedure
 * already accepts.
 *
 * Source-scan integrity test locks the editor state at the panel
 * level + the trim-on-submit logic + the mutual exclusion with the
 * trail expansion + the per-row testid namespace.
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

describe("Graph Quality Findings dismiss-with-reason η-slice (T-F.87 / T-F.4-η)", () => {
  it("panel holds reasonFindingId + reasonDraft state at the panel level", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[reasonFindingId,\s*setReasonFindingId\]\s*=\s*useState<number\s*\|\s*null>/,
    );
    expect(src).toMatch(
      /const\s+\[reasonDraft,\s*setReasonDraft\]\s*=\s*useState<string>/,
    );
  });

  it("openReasonEditor + closeReasonEditor helpers manage both state slices", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openReasonEditor[\s\S]{0,300}setReasonFindingId\(findingId\)[\s\S]{0,80}setReasonDraft\(""\)[\s\S]{0,80}setExpandedFindingId\(null\)/,
    );
    expect(src).toMatch(
      /function\s+closeReasonEditor[\s\S]{0,150}setReasonFindingId\(null\)[\s\S]{0,80}setReasonDraft\(""\)/,
    );
  });

  it("the Dismiss button now opens the reason editor instead of mutating directly", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-dismiss-\$\{f\.id\}`\}[\s\S]{0,300}onClick=\{\(\)\s*=>\s*openReasonEditor\(f\.id\)\}/,
    );
    // Button label was "Dismiss" — now it's "Dismiss…" to signal
    // the inline editor opens.
    expect(src).toMatch(/Dismiss…/);
  });

  it("reason editor row has a textarea + Confirm + Cancel + char-count testids", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-reason-row-\$\{f\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-reason-textarea-\$\{f\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-reason-confirm-\$\{f\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-reason-cancel-\$\{f\.id\}`\}/,
    );
    // Char counter is rendered as `${reasonDraft.length} / 2000`.
    expect(src).toMatch(/reasonDraft\.length\}\s*\/\s*2000/);
  });

  it("textarea respects the server's 2000-char limit via maxLength + visible counter", () => {
    const src = readPanel();
    expect(src).toMatch(/maxLength=\{2000\}/);
  });

  it("Confirm trims the draft and includes `reason` only when non-empty", () => {
    const src = readPanel();
    // The mutation invocation spreads `reason: trimmed` ONLY when
    // trimmed is non-empty so the server's optional field stays
    // optional rather than getting submitted as "".
    expect(src).toMatch(
      /const\s+trimmed\s*=\s*reasonDraft\.trim\(\)[\s\S]{0,500}\.\.\.\(trimmed\s*!==\s*""\s*\?\s*\{\s*reason:\s*trimmed\s*\}\s*:\s*\{\}\)/,
    );
  });

  it("mutation onSuccess closes the reason editor (cleanup after submit)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /onSuccess:\s*\(\)\s*=>\s*\{[\s\S]{0,400}closeReasonEditor\(\)/,
    );
  });

  it("Dismiss button hides once the reason editor is open for the same row (mutual exclusion)", () => {
    const src = readPanel();
    expect(src).toMatch(/isDismissable\s*&&\s*!isReasonOpen/);
  });

  it("textarea + confirm + cancel all disable while the row's mutation is pending", () => {
    const src = readPanel();
    // Three `disabled={isPending}` bindings exist in the file
    // (textarea + confirm button + cancel button). Counting catches
    // accidental drops without coupling to surrounding layout.
    const matches = src.match(/disabled=\{isPending\}/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });
});
