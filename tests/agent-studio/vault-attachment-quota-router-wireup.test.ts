// vault router — attachment quota wire-up integrity.
//
// Locks in the V1+ Phase 15-γ router integration shipped in
// PR-V1-20. Source-string scan (no live tRPC tree).
//
// Invariants:
//   1. Router imports `assertWithinQuota` + `AttachmentQuotaExceededError`
//      + `resolveDefaultAttachmentBytesLimit` from the quota-guard module.
//   2. The createAttachment mutation calls assertWithinQuota BEFORE
//      createAttachment.
//   3. AttachmentQuotaExceededError is mapped to FORBIDDEN (not the
//      default INTERNAL_SERVER_ERROR) so the client gets a precise code.
//   4. The bytesLimit threads through `resolveDefaultAttachmentBytesLimit()`
//      — operator can override via AGS_VAULT_ATTACHMENT_BYTES_LIMIT.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const VAULT_ROUTER_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/vault/router.ts",
);

describe("vault router — attachment quota wire-up", () => {
  const src = readFileSync(VAULT_ROUTER_PATH, "utf8");

  it("imports assertWithinQuota from attachment-quota-guard", () => {
    expect(src).toMatch(
      /import\s+\{[^}]*assertWithinQuota[^}]*\}\s+from\s+["']\.\/attachment-quota-guard/,
    );
  });

  it("imports AttachmentQuotaExceededError", () => {
    expect(src).toMatch(/\bAttachmentQuotaExceededError\b/);
  });

  it("imports resolveDefaultAttachmentBytesLimit", () => {
    expect(src).toMatch(/\bresolveDefaultAttachmentBytesLimit\b/);
  });
});

describe("createAttachment mutation — order of operations", () => {
  const src = readFileSync(VAULT_ROUTER_PATH, "utf8");

  it("calls assertWithinQuota BEFORE createAttachment inside the mutation", () => {
    // Extract the createAttachment mutation body (the protectedProcedure
    // .mutation(...) literal nearest the procedure name). Anchor on
    // `createAttachment: protectedProcedure` to scope the scan.
    const mutationStart = src.indexOf("createAttachment: protectedProcedure");
    expect(mutationStart).toBeGreaterThan(-1);
    // The next protectedProcedure declaration bounds the body.
    const nextStart = src.indexOf("protectedProcedure", mutationStart + 30);
    const body = src.slice(mutationStart, nextStart > -1 ? nextStart : src.length);
    const guardIdx = body.indexOf("assertWithinQuota");
    const insertIdx = body.indexOf("createAttachment(input, userId)");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(insertIdx);
  });

  it("maps AttachmentQuotaExceededError to FORBIDDEN (not INTERNAL_SERVER_ERROR)", () => {
    // Source-scan: the catch block branches on the typed error,
    // emitting a FORBIDDEN TRPCError.
    const errCheckIdx = src.indexOf(
      "e instanceof AttachmentQuotaExceededError",
    );
    expect(errCheckIdx).toBeGreaterThan(-1);
    // Within ~200 chars after that check, expect FORBIDDEN.
    const window = src.slice(errCheckIdx, errCheckIdx + 250);
    expect(window).toMatch(/code:\s*["']FORBIDDEN["']/);
  });

  it("threads resolveDefaultAttachmentBytesLimit() as bytesLimit", () => {
    // The guard's bytesLimit field is supplied by the env-resolver
    // so operators can tune via AGS_VAULT_ATTACHMENT_BYTES_LIMIT.
    expect(src).toMatch(
      /bytesLimit\s*:\s*resolveDefaultAttachmentBytesLimit\(\)/,
    );
  });

  it("threads input.sizeBytes as sizeBytesAdded", () => {
    expect(src).toMatch(/sizeBytesAdded\s*:\s*input\.sizeBytes/);
  });

  it("threads input.vaultId as the quota vaultId", () => {
    // The quota check must scope to the same vault the attachment
    // would land in, not a default — otherwise a malicious caller
    // could route to a low-usage vault to bypass the cap.
    const mutationStart = src.indexOf("createAttachment: protectedProcedure");
    const body = src.slice(mutationStart, mutationStart + 1200);
    expect(body).toMatch(/vaultId\s*:\s*input\.vaultId/);
  });
});
