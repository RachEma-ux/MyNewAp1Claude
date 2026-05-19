/**
 * RegionAdminPanel pin forms — source-scan integrity.
 *
 * Slice 23 of the no-deferral catalogue (2026-05-19). Closes the
 * doc-block claim "Pin add/edit/remove forms are intentionally out
 * of scope for this slice" — the forms had in fact shipped in the
 * same file. Slice 23 syncs the doc to truth and locks the form
 * wiring so a future doc edit can't accidentally re-claim the
 * deferral.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const PANEL_PATH = join(
  process.cwd(),
  "client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
);

describe("RegionAdminPanel — pin forms (slice 23)", () => {
  const src = readFileSync(PANEL_PATH, "utf8");

  it("doc-block no longer carries the out-of-scope claim as a live statement", () => {
    // The slice 23 close-out doc-block intentionally quotes the
    // historical phrase (with leading 'earlier' qualifier) to record
    // the closure. Match only the unqualified live statement.
    const liveClaim = /(?<!earlier\s*")Pin add\/edit\/remove forms are intentionally out of scope/;
    expect(src).not.toMatch(liveClaim);
  });

  it("doc-block names the slice 23 close-out", () => {
    expect(src).toMatch(/Slice 23 of the no-deferral catalogue/);
  });

  it("wires setPin mutation", () => {
    expect(src).toMatch(
      /trpc\.agentStudio\.region\.setPin\.useMutation/,
    );
  });

  it("wires removePin mutation", () => {
    expect(src).toMatch(
      /trpc\.agentStudio\.region\.removePin\.useMutation/,
    );
  });

  it("renders form inputs for workspaceId + regionKey + isReplicated + notes", () => {
    expect(src).toMatch(/pinForm\.workspaceId/);
    expect(src).toMatch(/pinForm\.regionKey/);
    expect(src).toMatch(/pinForm\.isReplicated/);
    expect(src).toMatch(/pinForm\.notes/);
  });

  it("provides Edit prefill (single form services Add + Edit)", () => {
    expect(src).toMatch(/Prefill setPin form with this row's values/);
  });

  it("provides per-row Remove button wired to removePin", () => {
    expect(src).toMatch(
      /removePinMutation\.mutate\(\{[\s\S]{0,200}workspaceId/,
    );
  });

  it("disables submit when required fields are empty", () => {
    expect(src).toMatch(/!pinForm\.workspaceId/);
    expect(src).toMatch(/!pinForm\.regionKey/);
  });

  it("invalidates listPins on mutation success", () => {
    expect(src).toMatch(
      /utils\.agentStudio\.region\.listPins\.invalidate\(\)/,
    );
  });
});
