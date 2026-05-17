/**
 * RegionAdminPanel pin-row clickable prefill — T-F.127
 * (T-F.7-j₂ intra-panel).
 *
 * Highest-ROI candidate per the post-T-A.37 scout report. Pins
 * table rows gain an Edit button that prefills the setPin form
 * below with the row's workspaceId / regionKey / isReplicated /
 * notes. Operator workflow: click Edit → scroll to form → tweak
 * one field → Save (3 steps vs the previous 4: scroll to form →
 * type workspaceId → type regionKey → tweak field → Save).
 *
 * Unlike T-F.125 / T-F.126 (cross-tab fusion lifted state), this
 * is purely intra-panel — setPinForm + setPinForm setter already
 * lived in RegionAdminPanel; the slice just adds a new caller.
 *
 * Per-button (not whole-row click) so the destructive remove
 * button stays unambiguous (lesson 64 destructive-action proximity
 * guard).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
    ),
    "utf8",
  );
}

describe("RegionAdminPanel pin-row clickable prefill (T-F.127 / T-F.7-j₂ intra-panel)", () => {
  it("each pin row carries a stable per-row testid", () => {
    const src = read();
    expect(src).toMatch(
      /data-testid=\{`region-pin-row-\$\{p\.workspaceId\}`\}/,
    );
  });

  it("Edit button calls setPinForm with workspaceId/regionKey/isReplicated/notes from the row", () => {
    const src = read();
    expect(src).toMatch(
      /onClick=\{\(\)\s*=>\s*setPinForm\(\{[\s\S]{0,800}workspaceId:\s*String\(p\.workspaceId\)[\s\S]{0,300}regionKey:\s*p\.regionKey[\s\S]{0,300}isReplicated:\s*p\.isReplicated[\s\S]{0,300}notes:\s*p\.notes\s*\?\?\s*""/,
    );
  });

  it("Edit button has per-row testid + title hint + 'edit' label", () => {
    const src = read();
    expect(src).toMatch(
      /data-testid=\{`region-pin-row-edit-\$\{p\.workspaceId\}`\}/,
    );
    expect(src).toMatch(/title="Prefill setPin form with this row's values"/);
    expect(src).toMatch(/>\s*edit\s*</);
  });

  it("Edit button rendered BEFORE remove button (Edit lives in the same Actions cell, ordered for least-destructive-first UX)", () => {
    const src = read();
    const editIdx = src.indexOf("region-pin-row-edit-");
    const removeIdx = src.indexOf("region-pin-row-remove-");
    expect(editIdx).toBeGreaterThan(0);
    expect(removeIdx).toBeGreaterThan(0);
    expect(editIdx).toBeLessThan(removeIdx);
  });

  it("remove button preserved (regression-free; same removePinMutation.mutate signature)", () => {
    const src = read();
    expect(src).toMatch(
      /onClick=\{\(\)\s*=>\s*removePinMutation\.mutate\(\{\s*workspaceId:\s*p\.workspaceId,?\s*\}\)/,
    );
    expect(src).toMatch(
      /data-testid=\{`region-pin-row-remove-\$\{p\.workspaceId\}`\}/,
    );
  });

  it("Edit button is NOT a whole-row click (per-button only) — assertion: <tr> has no onClick", () => {
    const src = read();
    // The pins table <tr> wrapper must NOT have an onClick (would
    // race with the remove button's onClick on the row's last cell).
    expect(src).not.toMatch(
      /<tr[\s\S]{0,500}key=\{p\.id\}[\s\S]{0,300}onClick=/,
    );
  });
});
