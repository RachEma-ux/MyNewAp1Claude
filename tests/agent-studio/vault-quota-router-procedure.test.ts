/**
 * V1+ 15-δ vault attachment quota tRPC procedure source-scan
 * (PR-V1-64).
 *
 * Mirrors the source-scan style of the existing vault-saved-views
 * procedure mount test (#770). Asserts the new
 * `vault.getAttachmentQuota` procedure exists with the expected
 * shape: protectedProcedure, requires `{vaultId}`, delegates to
 * `computeAttachmentQuota`, threads the
 * `resolveDefaultAttachmentBytesLimit` byte-limit through the
 * options bag so the panel display matches the #771 write-gate
 * threshold bit-for-bit.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const file = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/router.ts",
);
const src = readFileSync(file, "utf8");

describe("vault.getAttachmentQuota router procedure source-scan", () => {
  it("imports computeAttachmentQuota from attachment-library", () => {
    expect(
      /import\s*\{[^}]*computeAttachmentQuota[^}]*\}\s*from\s+["']\.\/attachment-library/.test(
        src,
      ),
    ).toBe(true);
  });

  it("imports resolveDefaultAttachmentBytesLimit from attachment-quota-guard", () => {
    expect(
      /import\s*\{[^}]*resolveDefaultAttachmentBytesLimit[^}]*\}\s*from\s+["']\.\/attachment-quota-guard/.test(
        src,
      ),
    ).toBe(true);
  });

  it("declares getAttachmentQuota as a protectedProcedure with vaultId input", () => {
    expect(
      /getAttachmentQuota\s*:\s*protectedProcedure\s*\.input\s*\(\s*z\.object\s*\(\s*\{\s*vaultId\s*:/.test(
        src,
      ),
    ).toBe(true);
  });

  it("delegates to computeAttachmentQuota(input.vaultId, ...)", () => {
    expect(
      /await\s+computeAttachmentQuota\s*\(\s*input\.vaultId/.test(src),
    ).toBe(true);
  });

  it("threads resolveDefaultAttachmentBytesLimit() as bytesLimit", () => {
    // The threading guarantees the panel's "X% used" matches the
    // #771 write-gate threshold bit-for-bit.
    expect(
      /bytesLimit\s*:\s*resolveDefaultAttachmentBytesLimit\s*\(\s*\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("wraps the call in throwTrpcAndCapture on error (observability hook)", () => {
    // Locate the getAttachmentQuota block and confirm the error
    // path routes through throwTrpcAndCapture like the other vault
    // procedures (vault-router observability pattern).
    const blockStart = src.indexOf("getAttachmentQuota");
    expect(blockStart).toBeGreaterThan(-1);
    // Slice forward to the next procedure declaration or the end
    // of the router definition.
    const after = src.slice(blockStart);
    const nextProcedureMatch = after.match(
      /\n\s+[a-zA-Z]+\s*:\s*(?:protectedProcedure|adminProcedure|publicProcedure)/,
    );
    const slice = after.slice(
      0,
      nextProcedureMatch?.index ?? after.length,
    );
    expect(/throwTrpcAndCapture/.test(slice)).toBe(true);
  });
});
