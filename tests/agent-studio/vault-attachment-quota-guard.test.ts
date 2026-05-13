/**
 * Vault — attachment quota write-gate tests (V1+ Phase 15-γ).
 *
 * Covers:
 *   - null/undefined bytesLimit → no-op
 *   - within budget → resolves silently
 *   - over budget → AttachmentQuotaExceededError with informative fields
 *   - boundary: equal to limit is allowed (≤ semantics is "≤ limit")
 *   - usageOverride seam skips the DB roundtrip
 *   - getDb seam for ASDB-unavailable returns zero bytesUsed → allowed
 *     when sizeBytesAdded ≤ limit
 *   - negative sizeBytesAdded throws (defensive)
 *   - resolveDefaultAttachmentBytesLimit env parsing
 *   - source-scan boundary: no credential-resolver / dispatcher /
 *     neo4j-driver / *_API_KEY (env reads here are scoped to
 *     AGS_VAULT_ATTACHMENT_BYTES_LIMIT — operator config, not a secret).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AttachmentQuotaExceededError,
  assertWithinQuota,
  resolveDefaultAttachmentBytesLimit,
} from "../../server/agent-studio/services/vault/attachment-quota-guard.js";

describe("assertWithinQuota — limit branching", () => {
  it("null bytesLimit is a no-op (unlimited)", async () => {
    await expect(
      assertWithinQuota({
        vaultId: 1,
        sizeBytesAdded: 1_000_000_000,
        bytesLimit: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("undefined bytesLimit is a no-op (unlimited)", async () => {
    await expect(
      assertWithinQuota({ vaultId: 1, sizeBytesAdded: 1_000_000 }),
    ).resolves.toBeUndefined();
  });

  it("within budget — usage + new < limit → resolves", async () => {
    await expect(
      assertWithinQuota(
        { vaultId: 1, sizeBytesAdded: 100, bytesLimit: 1000 },
        { usageOverride: 500 },
      ),
    ).resolves.toBeUndefined();
  });

  it("equal to limit is allowed (≤ semantics)", async () => {
    await expect(
      assertWithinQuota(
        { vaultId: 1, sizeBytesAdded: 500, bytesLimit: 1000 },
        { usageOverride: 500 },
      ),
    ).resolves.toBeUndefined();
  });

  it("one byte over limit throws", async () => {
    await expect(
      assertWithinQuota(
        { vaultId: 1, sizeBytesAdded: 501, bytesLimit: 1000 },
        { usageOverride: 500 },
      ),
    ).rejects.toThrow(AttachmentQuotaExceededError);
  });
});

describe("assertWithinQuota — error shape", () => {
  it("error carries vaultId, bytesUsed, bytesLimit, sizeBytesAdded fields", async () => {
    try {
      await assertWithinQuota(
        { vaultId: 7, sizeBytesAdded: 600, bytesLimit: 1000 },
        { usageOverride: 500 },
      );
      throw new Error("should not reach here");
    } catch (err) {
      expect(err).toBeInstanceOf(AttachmentQuotaExceededError);
      const e = err as AttachmentQuotaExceededError;
      expect(e.vaultId).toBe(7);
      expect(e.bytesUsed).toBe(500);
      expect(e.bytesLimit).toBe(1000);
      expect(e.sizeBytesAdded).toBe(600);
      expect(e.code).toBe("attachment_quota_exceeded");
      expect(e.message).toMatch(/quota exceeded for vault 7/);
      expect(e.message).toMatch(/current=500B/);
      expect(e.message).toMatch(/new=600B/);
      expect(e.message).toMatch(/= 1100B > limit=1000B/);
    }
  });
});

describe("assertWithinQuota — defensive checks", () => {
  it("negative sizeBytesAdded throws (caller error)", async () => {
    await expect(
      assertWithinQuota(
        { vaultId: 1, sizeBytesAdded: -1, bytesLimit: 1000 },
        { usageOverride: 0 },
      ),
    ).rejects.toThrow(AttachmentQuotaExceededError);
  });
});

describe("assertWithinQuota — ASDB-unavailable fall-through", () => {
  it("returns 0 bytesUsed when getDb yields null; allows new bytes ≤ limit", async () => {
    await expect(
      assertWithinQuota(
        { vaultId: 1, sizeBytesAdded: 500, bytesLimit: 1000 },
        { getDb: () => null as unknown as never },
      ),
    ).resolves.toBeUndefined();
  });

  it("ASDB-unavailable + new > limit still throws", async () => {
    await expect(
      assertWithinQuota(
        { vaultId: 1, sizeBytesAdded: 1500, bytesLimit: 1000 },
        { getDb: () => null as unknown as never },
      ),
    ).rejects.toThrow(AttachmentQuotaExceededError);
  });
});

describe("resolveDefaultAttachmentBytesLimit — env parsing", () => {
  const original = process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT;

  beforeEach(() => {
    delete process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT;
    } else {
      process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT = original;
    }
  });

  it("returns null when env is unset", () => {
    expect(resolveDefaultAttachmentBytesLimit()).toBeNull();
  });

  it("returns the parsed positive integer", () => {
    process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT = "5242880";
    expect(resolveDefaultAttachmentBytesLimit()).toBe(5_242_880);
  });

  it("returns null for non-positive values", () => {
    process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT = "0";
    expect(resolveDefaultAttachmentBytesLimit()).toBeNull();
    process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT = "-100";
    expect(resolveDefaultAttachmentBytesLimit()).toBeNull();
  });

  it("returns null for non-numeric values", () => {
    process.env.AGS_VAULT_ATTACHMENT_BYTES_LIMIT = "five MB";
    expect(resolveDefaultAttachmentBytesLimit()).toBeNull();
  });
});

describe("source-scan boundary — attachment-quota-guard.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/attachment-quota-guard.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does not import credential-resolver", () => {
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("does not import the MCP dispatcher", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });

  it("does not read process.env.*_API_KEY raw", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });
});
