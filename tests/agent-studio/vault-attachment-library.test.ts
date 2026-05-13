/**
 * Vault — Attachment Library service tests (V1+ Phase 15-β).
 *
 * Covers:
 *   - classifyMimeType for each closed taxonomy bucket
 *   - isAttachmentMimeClass narrowing
 *   - browseAttachmentLibrary with no ASDB → []
 *   - findUnusedAttachments with no ASDB → []
 *   - computeAttachmentQuota with no ASDB → zero result
 *   - quota math: utilization, overQuota, null-limit case
 *   - source-scan boundary: no neo4j-driver / credential-resolver /
 *     dispatchMcpToolCall / raw *_API_KEY reads.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_MIME_CLASSES,
  BROWSE_SORT_KEYS,
  browseAttachmentLibrary,
  classifyMimeType,
  computeAttachmentQuota,
  findUnusedAttachments,
  isAttachmentMimeClass,
} from "../../server/agent-studio/services/vault/attachment-library.js";

describe("classifyMimeType — closed taxonomy", () => {
  it("classifies images", () => {
    expect(classifyMimeType("image/png")).toBe("image");
    expect(classifyMimeType("image/jpeg")).toBe("image");
    expect(classifyMimeType("IMAGE/SVG+XML")).toBe("image");
  });

  it("classifies videos", () => {
    expect(classifyMimeType("video/mp4")).toBe("video");
    expect(classifyMimeType("video/webm")).toBe("video");
  });

  it("classifies audio", () => {
    expect(classifyMimeType("audio/mpeg")).toBe("audio");
    expect(classifyMimeType("audio/wav")).toBe("audio");
  });

  it("classifies archives", () => {
    expect(classifyMimeType("application/zip")).toBe("archive");
    expect(classifyMimeType("application/x-7z-compressed")).toBe("archive");
    expect(classifyMimeType("application/gzip")).toBe("archive");
    expect(classifyMimeType("application/x-tar")).toBe("archive");
  });

  it("classifies documents", () => {
    expect(classifyMimeType("application/pdf")).toBe("document");
    expect(classifyMimeType("application/msword")).toBe("document");
    expect(
      classifyMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("document");
    expect(classifyMimeType("text/markdown")).toBe("document");
    expect(classifyMimeType("text/plain")).toBe("document");
    expect(classifyMimeType("application/json")).toBe("document");
  });

  it("falls through to other", () => {
    expect(classifyMimeType("application/octet-stream")).toBe("other");
    expect(classifyMimeType("model/gltf-binary")).toBe("other");
    expect(classifyMimeType("font/woff2")).toBe("other");
  });
});

describe("isAttachmentMimeClass", () => {
  it("accepts every member of the closed union", () => {
    for (const cls of ATTACHMENT_MIME_CLASSES) {
      expect(isAttachmentMimeClass(cls)).toBe(true);
    }
  });

  it("rejects non-members", () => {
    expect(isAttachmentMimeClass("PDF")).toBe(false);
    expect(isAttachmentMimeClass("")).toBe(false);
    expect(isAttachmentMimeClass(null)).toBe(false);
    expect(isAttachmentMimeClass(undefined)).toBe(false);
    expect(isAttachmentMimeClass(42)).toBe(false);
  });
});

describe("constants", () => {
  it("ATTACHMENT_MIME_CLASSES is the 6-value closed taxonomy", () => {
    expect([...ATTACHMENT_MIME_CLASSES]).toEqual([
      "image",
      "video",
      "audio",
      "document",
      "archive",
      "other",
    ]);
  });

  it("BROWSE_SORT_KEYS is the 2-value closed sort taxonomy", () => {
    expect([...BROWSE_SORT_KEYS]).toEqual(["created_at_desc", "size_desc"]);
  });
});

describe("ASDB-unavailable fall-through", () => {
  it("browseAttachmentLibrary returns [] when ASDB is unavailable", async () => {
    const rows = await browseAttachmentLibrary(
      { vaultId: 1 },
      { getDb: () => null as unknown as never },
    );
    expect(rows).toEqual([]);
  });

  it("findUnusedAttachments returns [] when ASDB is unavailable", async () => {
    const rows = await findUnusedAttachments(
      { vaultId: 1 },
      { getDb: () => null as unknown as never },
    );
    expect(rows).toEqual([]);
  });

  it("computeAttachmentQuota returns zero-result when ASDB is unavailable", async () => {
    const result = await computeAttachmentQuota(1, {
      getDb: () => null as unknown as never,
    });
    expect(result.vaultId).toBe(1);
    expect(result.bytesUsed).toBe(0);
    expect(result.attachmentCount).toBe(0);
    expect(result.utilization).toBeNull();
    expect(result.overQuota).toBe(false);
  });

  it("computeAttachmentQuota with bytesLimit but no ASDB: utilization=0, overQuota=false", async () => {
    const result = await computeAttachmentQuota(1, {
      getDb: () => null as unknown as never,
      bytesLimit: 100,
    });
    expect(result.bytesLimit).toBe(100);
    expect(result.utilization).toBe(0);
    expect(result.overQuota).toBe(false);
  });
});

describe("source-scan boundary", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/attachment-library.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does not import neo4j-driver (Postgres-only service)", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });

  it("does not import credential-resolver (Plan v3 D2)", () => {
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("does not import the MCP dispatcher", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY raw", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });
});
