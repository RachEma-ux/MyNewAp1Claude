/**
 * Publish executions Digest column — PR-V1-199.
 *
 * Source-scan that the executions table now renders the
 * `payloadDigest` truncated to 12 chars with the full digest in
 * the cell tooltip, and the expanded-detail-row colSpan bumps to
 * 10 to match the new column count.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-199 — publish executions digest column", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );

  it("renders Digest header + 12-char truncated cell + full-digest tooltip", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(">Digest<");
    expect(src).toContain("publish-execution-digest-");
    expect(/r\.payloadDigest\.slice\(0,\s*12\)/.test(src)).toBe(true);
    // null branch falls through to em-dash.
    expect(
      /r\.payloadDigest[\s\S]{0,80}\?\s*r\.payloadDigest\.slice\(0,\s*12\)\s*:\s*"—"/.test(
        src,
      ),
    ).toBe(true);
    // Tooltip carries the full digest for copy-paste.
    expect(/title=\{r\.payloadDigest\s*\?\?\s*undefined\}/.test(src)).toBe(true);
  });

  it("expanded-detail-row colSpan bumps to 10 to match the new column count", () => {
    const src = readFileSync(panel, "utf8");
    // 10 columns now: When / Target / Promotion / Attempt / Status /
    // Duration / Digest / Upstream / Error / Details.
    expect(/colSpan=\{10\}/.test(src)).toBe(true);
  });
});
