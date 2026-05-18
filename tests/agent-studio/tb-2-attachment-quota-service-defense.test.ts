/**
 * T-B.2 — attachment-quota defense at the service layer.
 *
 * Before this PR, `assertWithinQuota` only ran in the vault router's
 * `createAttachment` tRPC procedure. Internal callers (future
 * ingestion paths, scripts, seeds) could bypass the quota by calling
 * `createAttachment` directly. T-B.2 pushes the guard INTO the
 * service so every caller gets the same defense.
 *
 * Source-scan verifies:
 *   - service imports `assertWithinQuota` + `resolveDefaultAttachmentBytesLimit`
 *   - createAttachment calls `assertWithinQuota` BEFORE the
 *     `db.insert(agsVaultAttachments)` call (line-order matters —
 *     reject before any write)
 *   - service exports a `bytesLimit?: number | null` option for
 *     callers to opt out (explicit `null`) or override (number)
 *   - router no longer calls `assertWithinQuota` directly (service
 *     is the single guard site)
 *   - router still maps `AttachmentQuotaExceededError` → FORBIDDEN
 *     (the error bubbles up from the service now)
 *   - router no longer imports `assertWithinQuota` (it's not used)
 *
 * Behavioral verifies:
 *   - assertWithinQuota throws when over the cap
 *   - assertWithinQuota is no-op when bytesLimit is null
 *   - assertWithinQuota treats negative sizeBytesAdded as quota
 *     exceeded (defensive)
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

import {
  assertWithinQuota,
  AttachmentQuotaExceededError,
  resolveDefaultAttachmentBytesLimit,
} from "../../server/agent-studio/services/vault/attachment-quota-guard";

const REPO = resolve(__dirname, "../..");
const ATTACHMENTS = join(REPO, "server/agent-studio/services/vault/attachments.ts");
const ROUTER = join(REPO, "server/agent-studio/services/vault/router.ts");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

afterEach(() => {
  delete process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT;
});

// ────────────────────────────────────────────────────────────────────
// Source-scan — service-layer defense
// ────────────────────────────────────────────────────────────────────

describe("createAttachment — service-layer quota defense (T-B.2)", () => {
  const src = read(ATTACHMENTS);

  it("imports assertWithinQuota + resolveDefaultAttachmentBytesLimit from the guard module", () => {
    expect(src).toMatch(
      /from\s+["']\.\/attachment-quota-guard\.js["']/,
    );
    expect(src).toMatch(/assertWithinQuota/);
    expect(src).toMatch(/resolveDefaultAttachmentBytesLimit/);
  });

  it("exposes an opt-in `bytesLimit?: number | null` option on the service signature", () => {
    expect(src).toMatch(
      /readonly\s+bytesLimit\?:\s*number\s*\|\s*null/,
    );
  });

  it("documents the explicit-null opt-out for trusted paths", () => {
    expect(src).toMatch(/explicitly to bypass/i);
  });

  it("calls assertWithinQuota BEFORE the db.insert (line-order matters)", () => {
    const assertIdx = src.search(/await\s+assertWithinQuota\(/);
    const insertIdx = src.search(
      /await\s+db[\s\S]{0,40}\.insert\(\s*agsVaultAttachments\s*\)/,
    );
    expect(assertIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(assertIdx).toBeLessThan(insertIdx);
  });

  it("treats `undefined` bytesLimit as resolveDefaultAttachmentBytesLimit() (env-resolved default)", () => {
    expect(src).toMatch(
      /options\.bytesLimit\s*===\s*undefined[\s\S]{0,80}resolveDefaultAttachmentBytesLimit\(\)/,
    );
  });
});

describe("vault/router.ts — service is now the single guard site (T-B.2)", () => {
  const src = read(ROUTER);

  it("does NOT call assertWithinQuota directly anymore", () => {
    // assertWithinQuota was previously called inside the
    // `createAttachment` tRPC procedure. After T-B.2 the service
    // handles it; the router only translates the thrown error.
    expect(src).not.toMatch(/await\s+assertWithinQuota\(/);
  });

  it("does NOT import assertWithinQuota (cleanup)", () => {
    // After removing the in-router call site, the import is dead.
    expect(src).not.toMatch(
      /import\s*\{[^}]*\bassertWithinQuota\b[^}]*\}\s*from\s*["']\.\/attachment-quota-guard\.js["']/,
    );
  });

  it("still maps AttachmentQuotaExceededError → FORBIDDEN inside createAttachment procedure", () => {
    // The catch block now sees the service-thrown error and translates.
    expect(src).toMatch(
      /AttachmentQuotaExceededError[\s\S]*?code:\s*"FORBIDDEN"/,
    );
  });

  it("still uses resolveDefaultAttachmentBytesLimit for getAttachmentQuota (unchanged)", () => {
    expect(src).toMatch(/resolveDefaultAttachmentBytesLimit/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Behavioral — guard module
// ────────────────────────────────────────────────────────────────────

describe("assertWithinQuota — behavioral re-confirms (#771 invariants)", () => {
  function fakeDbWithUsage(bytesUsed: number) {
    const stage = {
      from: () => stage,
      where: async () => [{ totalBytes: String(bytesUsed) }],
    };
    return { select: () => stage } as never;
  }

  it("no-op when bytesLimit is null", async () => {
    await expect(
      assertWithinQuota(
        { vaultId: 1, sizeBytesAdded: 100, bytesLimit: null },
        { usageOverride: 999999 },
      ),
    ).resolves.toBeUndefined();
  });

  it("no-op when bytesLimit is undefined", async () => {
    await expect(
      assertWithinQuota(
        { vaultId: 1, sizeBytesAdded: 100 },
        { usageOverride: 999999 },
      ),
    ).resolves.toBeUndefined();
  });

  it("throws AttachmentQuotaExceededError when over the cap", async () => {
    await expect(
      assertWithinQuota(
        { vaultId: 1, sizeBytesAdded: 200, bytesLimit: 250 },
        { usageOverride: 100 },
      ),
    ).rejects.toBeInstanceOf(AttachmentQuotaExceededError);
  });

  it("permits exact equality at the cap", async () => {
    await expect(
      assertWithinQuota(
        { vaultId: 1, sizeBytesAdded: 150, bytesLimit: 250 },
        { usageOverride: 100 },
      ),
    ).resolves.toBeUndefined();
  });

  it("treats negative sizeBytesAdded as quota exceeded (defensive)", async () => {
    await expect(
      assertWithinQuota(
        { vaultId: 1, sizeBytesAdded: -5, bytesLimit: 1000 },
        { usageOverride: 0 },
      ),
    ).rejects.toBeInstanceOf(AttachmentQuotaExceededError);
  });
});

describe("resolveDefaultAttachmentBytesLimit — env reader", () => {
  it("returns null when env var is unset", () => {
    delete process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT;
    expect(resolveDefaultAttachmentBytesLimit()).toBeNull();
  });

  it("returns the parsed integer when env var is set", () => {
    process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT = "100000000";
    expect(resolveDefaultAttachmentBytesLimit()).toBe(100000000);
  });

  it("returns null for malformed env values", () => {
    process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT = "not-a-number";
    expect(resolveDefaultAttachmentBytesLimit()).toBeNull();
  });

  it("returns null for zero / negative", () => {
    process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT = "0";
    expect(resolveDefaultAttachmentBytesLimit()).toBeNull();
    process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT = "-1";
    expect(resolveDefaultAttachmentBytesLimit()).toBeNull();
  });
});
