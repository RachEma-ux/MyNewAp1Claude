/**
 * Track A — A3 — Vault FS-sync module unit tests.
 *
 * Exercises the pure FS layer (writer + reader + reconciler) end-
 * to-end against a per-test tmp directory. No DB; the DB-interfacing
 * wiring lands in A4 (watcher) + A5 (tRPC) + A6 (post-commit hooks).
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALLOWED_ROOTS_ENV,
  assertVaultRootIsConfigurable,
  FsSyncError,
  getAllowedRoots,
  isStagingFile,
  isUnderAllowedRoot,
  materializeNotes,
  MD_EXTENSION,
  parseNotePathFromAbs,
  readMarkdownFile,
  resolveNoteFilePath,
  sha256Hex,
  TMP_SUFFIX,
  vaultLockFilePath,
  writeMarkdownAtomic,
} from "../../server/agent-studio/services/vault/fs-sync/index";

let tmpRoot: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "vault-fs-sync-test-"));
  originalEnv = process.env[ALLOWED_ROOTS_ENV];
  process.env[ALLOWED_ROOTS_ENV] = tmpdir();
});

afterEach(async () => {
  if (originalEnv === undefined) {
    delete process.env[ALLOWED_ROOTS_ENV];
  } else {
    process.env[ALLOWED_ROOTS_ENV] = originalEnv;
  }
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("A3 — content-hash", () => {
  it("sha256Hex returns 64 lowercase hex chars", () => {
    const h = sha256Hex("hello world");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Stable across calls — same input → same hash.
    expect(sha256Hex("hello world")).toBe(h);
  });

  it("different inputs yield different hashes", () => {
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });
});

describe("A3 — path-validator", () => {
  it("getAllowedRoots reads VAULT_FS_SYNC_ALLOWED_ROOTS, trims, drops non-absolute", () => {
    process.env[ALLOWED_ROOTS_ENV] = "/a,/b, ./relative , /c/";
    const roots = getAllowedRoots();
    expect(roots).toEqual(["/a", "/b", "/c"]);
  });

  it("missing env returns [] (feature disabled)", () => {
    delete process.env[ALLOWED_ROOTS_ENV];
    expect(getAllowedRoots()).toEqual([]);
  });

  it("isUnderAllowedRoot accepts exact match + child paths, rejects siblings", () => {
    const roots = ["/data/vaults"];
    expect(isUnderAllowedRoot("/data/vaults", roots)).toBe(true);
    expect(isUnderAllowedRoot("/data/vaults/MyVault", roots)).toBe(true);
    expect(isUnderAllowedRoot("/data/vaults-other", roots)).toBe(false);
    expect(isUnderAllowedRoot("/etc/passwd", roots)).toBe(false);
    expect(isUnderAllowedRoot("relative/path", roots)).toBe(false);
  });

  it("assertVaultRootIsConfigurable throws FEATURE_DISABLED when env empty", () => {
    delete process.env[ALLOWED_ROOTS_ENV];
    expect(() => assertVaultRootIsConfigurable("/anywhere")).toThrow(
      FsSyncError,
    );
    try {
      assertVaultRootIsConfigurable("/anywhere");
    } catch (e) {
      expect((e as FsSyncError).code).toBe("FEATURE_DISABLED");
    }
  });

  it("assertVaultRootIsConfigurable throws PATH_NOT_ABSOLUTE on relative", () => {
    process.env[ALLOWED_ROOTS_ENV] = "/data/vaults";
    try {
      assertVaultRootIsConfigurable("relative/path");
    } catch (e) {
      expect((e as FsSyncError).code).toBe("PATH_NOT_ABSOLUTE");
    }
  });

  it("assertVaultRootIsConfigurable throws PATH_OUTSIDE_ALLOWED_ROOTS for escape", () => {
    process.env[ALLOWED_ROOTS_ENV] = "/data/vaults";
    try {
      assertVaultRootIsConfigurable("/etc/passwd");
    } catch (e) {
      expect((e as FsSyncError).code).toBe("PATH_OUTSIDE_ALLOWED_ROOTS");
    }
  });
});

describe("A3 — path-resolver", () => {
  it("resolveNoteFilePath joins vault + folders + slug.md", () => {
    const p = resolveNoteFilePath("/root", ["Projects", "Q4"], "my-note");
    expect(p).toBe("/root/Projects/Q4/my-note.md");
  });

  it("resolveNoteFilePath sanitizes unsafe segments", () => {
    const p = resolveNoteFilePath(
      "/root",
      ["With Spaces", "../../etc"],
      "fun?slug!",
    );
    // "../../etc" sanitizes to "etc"; "With Spaces" → "With-Spaces";
    // "fun?slug!" → "fun-slug".
    expect(p).toBe("/root/With-Spaces/etc/fun-slug.md");
  });

  it("parseNotePathFromAbs inverts resolveNoteFilePath", () => {
    const abs = "/root/A/B/note-x.md";
    const parsed = parseNotePathFromAbs("/root", abs);
    expect(parsed).toEqual({ folderSegments: ["A", "B"], slug: "note-x" });
  });

  it("parseNotePathFromAbs rejects non-md and escape paths", () => {
    expect(parseNotePathFromAbs("/root", "/root/file.txt")).toBeNull();
    expect(parseNotePathFromAbs("/root", "/other/file.md")).toBeNull();
  });

  it("vaultLockFilePath returns .fs-sync.lock at the vault root", () => {
    expect(vaultLockFilePath("/data/vaults/MyVault")).toBe(
      "/data/vaults/MyVault/.fs-sync.lock",
    );
  });

  it("MD_EXTENSION is exactly '.md'", () => {
    expect(MD_EXTENSION).toBe(".md");
  });
});

describe("A3 — writer", () => {
  it("writes content + creates parent dirs + returns hash", async () => {
    const abs = join(tmpRoot, "sub/dir/note.md");
    const result = await writeMarkdownAtomic({
      vaultRoot: tmpRoot,
      absPath: abs,
      contentMd: "# Hello",
    });
    expect(result.kind).toBe("written");
    if (result.kind !== "written") throw new Error("unreachable");
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    const onDisk = await readFile(abs, "utf8");
    expect(onDisk).toBe("# Hello");
  });

  it("uses atomic .tmp → rename (no .tmp file lingers after success)", async () => {
    const abs = join(tmpRoot, "atomic.md");
    await writeMarkdownAtomic({
      vaultRoot: tmpRoot,
      absPath: abs,
      contentMd: "x",
    });
    await expect(stat(`${abs}${TMP_SUFFIX}`)).rejects.toThrow();
  });

  it("skips on echo when lastHash matches the to-be-written hash", async () => {
    const abs = join(tmpRoot, "echo.md");
    const content = "# Echo";
    const hash = sha256Hex(content);
    const result = await writeMarkdownAtomic({
      vaultRoot: tmpRoot,
      absPath: abs,
      contentMd: content,
      lastHash: hash,
    });
    expect(result.kind).toBe("skipped_echo");
    // No file should have been created.
    await expect(stat(abs)).rejects.toThrow();
  });

  it("rejects paths outside the vault root (symlink-escape guard)", async () => {
    const escapePath = "/etc/passwd";
    const result = await writeMarkdownAtomic({
      vaultRoot: tmpRoot,
      absPath: escapePath,
      contentMd: "x",
    });
    expect(result.kind).toBe("error");
  });

  it("isStagingFile detects .tmp suffix", () => {
    expect(isStagingFile("/a/b.md.tmp")).toBe(true);
    expect(isStagingFile("/a/b.md")).toBe(false);
  });
});

describe("A3 — reader", () => {
  it("reads + parses frontmatter and contentMd", async () => {
    const abs = join(tmpRoot, "note.md");
    const blob = "---\ntitle: My Note\nslug: my-note\n---\n\n# Body\n\nText.";
    await writeFile(abs, blob, "utf8");
    const result = await readMarkdownFile({ vaultRoot: tmpRoot, absPath: abs });
    expect(result.kind).toBe("parsed");
    if (result.kind !== "parsed") throw new Error("unreachable");
    expect(result.frontmatter.title).toBe("My Note");
    expect(result.contentMd).toContain("# Body");
    expect(result.hash).toBe(sha256Hex(blob));
  });

  it("returns skipped_echo when lastHash matches the on-disk hash", async () => {
    const abs = join(tmpRoot, "echo-read.md");
    const blob = "no frontmatter just body";
    await writeFile(abs, blob, "utf8");
    const hash = sha256Hex(blob);
    const result = await readMarkdownFile({
      vaultRoot: tmpRoot,
      absPath: abs,
      lastHash: hash,
    });
    expect(result.kind).toBe("skipped_echo");
  });

  it("returns error on read failure (missing file)", async () => {
    const result = await readMarkdownFile({
      vaultRoot: tmpRoot,
      absPath: join(tmpRoot, "missing.md"),
    });
    expect(result.kind).toBe("error");
  });
});

describe("A3 — reconciler", () => {
  it("materializes a batch of notes + aggregates per-file results", async () => {
    const specs = [
      {
        absPath: join(tmpRoot, "Project A/note-1.md"),
        contentMd: "# Note 1",
        lastHash: null,
      },
      {
        absPath: join(tmpRoot, "Project B/Sub/note-2.md"),
        contentMd: "# Note 2",
        lastHash: null,
      },
      {
        // Echo — already-on-disk hash matches → skip.
        absPath: join(tmpRoot, "note-3.md"),
        contentMd: "# Echo",
        lastHash: sha256Hex("# Echo"),
      },
    ];
    const written: Array<{ slug: string; hash: string }> = [];
    const result = await materializeNotes({
      vaultId: 42,
      vaultRoot: tmpRoot,
      specs,
      onWritten: (spec, r) => {
        if (r.kind === "written") {
          written.push({ slug: spec.absPath, hash: r.hash });
        }
      },
    });
    expect(result.vaultId).toBe(42);
    expect(result.notesTotal).toBe(3);
    expect(result.written).toBe(2);
    expect(result.skippedEcho).toBe(1);
    expect(result.errors).toEqual([]);
    expect(written).toHaveLength(2);
  });

  it("aggregates per-file errors without stopping the batch", async () => {
    const specs = [
      {
        absPath: "/etc/passwd", // escape → error
        contentMd: "x",
        lastHash: null,
      },
      {
        absPath: join(tmpRoot, "ok.md"),
        contentMd: "y",
        lastHash: null,
      },
    ];
    const result = await materializeNotes({
      vaultId: 1,
      vaultRoot: tmpRoot,
      specs,
    });
    expect(result.notesTotal).toBe(2);
    expect(result.written).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});
