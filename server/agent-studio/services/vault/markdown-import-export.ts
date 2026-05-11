/**
 * Vault — Markdown import + export.
 *
 * Phase 15. Closes the "Markdown import/export works" acceptance
 * criterion. Provides:
 *
 *   - `parseMarkdownBlob(rawMd)` — pure function. Parses a YAML-ish
 *     frontmatter preamble (`---\n...\n---\n`) and returns the
 *     extracted `{ frontmatter, contentMd }`. Pure — no DB.
 *   - `renderNoteAsMarkdown({ frontmatter, contentMd })` — pure
 *     function. Serializes a note row to a `.md` blob with a YAML
 *     preamble. Frontmatter values render as `key: value` (scalars)
 *     or `key: <json>` (objects/arrays).
 *   - `exportNoteAsMarkdown(noteId, options)` — DB-backed reader.
 *     Pulls the note row + latest version via the vault repository
 *     and renders the blob. Returns `null` when the note doesn't
 *     exist (matches the explain-reader contract).
 *
 * Frontmatter serialization is intentionally minimal:
 *   - String / number / boolean: bare scalar form
 *   - Strings containing YAML-significant chars (`:`, newline,
 *     leading whitespace, leading `-`, leading `#`, etc.) are JSON-
 *     quoted to keep them round-trip-safe.
 *   - Objects + arrays: JSON-encoded on a single line.
 *   - `null` / `undefined`: skipped (omits the key).
 *
 * Parsing follows the inverse: bare scalars decode to string |
 * number | boolean | null; JSON-shaped values decode via JSON.parse;
 * quoted strings decode by stripping quotes. Round-trip survives
 * `parseMarkdownBlob(renderNoteAsMarkdown(x)) === x` for the common
 * frontmatter shapes.
 *
 * ADR: docs/architecture/agent-studio-markdown-profile.md
 */

import { AsdbVaultRepository } from "./repository-asdb.js";
import type { VaultRepository } from "./repository.js";

export interface ParsedMarkdownBlob {
  readonly frontmatter: Record<string, unknown>;
  readonly contentMd: string;
}

export interface RenderNoteInput {
  readonly frontmatter?: Record<string, unknown> | null;
  readonly contentMd: string;
}

const FRONTMATTER_DELIMITER = "---";
// Consume the closing delimiter PLUS the conventional blank separator
// line so the captured body doesn't start with a stray `\n`. Both the
// blank line and the trailing newline are optional — a file ending
// right after `---` is still valid.
const FRONTMATTER_REGEX =
  /^---\r?\n([\s\S]*?)\r?\n---\r?\n?(?:\r?\n)?([\s\S]*)$/;

// Strings that would parse as scalars need quoting on render so the
// round-trip preserves the original type. Common YAML-significant
// patterns: leading/trailing whitespace, `:` (key/value confusion),
// `#` (comment in YAML), leading `-` (list item), `{` `[` (JSON),
// looks-like-number, looks-like-boolean, looks-like-null.
function needsQuoting(s: string): boolean {
  if (s === "") return true;
  if (/^\s|\s$/.test(s)) return true;
  if (/[:\n#]/.test(s)) return true;
  if (/^[-{[]/.test(s)) return true;
  if (/^(true|false|null|undefined)$/i.test(s)) return true;
  if (/^-?\d+(\.\d+)?$/.test(s)) return true;
  return false;
}

function renderFrontmatterValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    return needsQuoting(v) ? JSON.stringify(v) : v;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  // Objects + arrays — JSON on a single line.
  return JSON.stringify(v);
}

export function renderNoteAsMarkdown(input: RenderNoteInput): string {
  const fm = input.frontmatter ?? {};
  const lines: string[] = [];
  const keys = Object.keys(fm);
  if (keys.length > 0) {
    lines.push(FRONTMATTER_DELIMITER);
    for (const k of keys) {
      const rendered = renderFrontmatterValue(fm[k]);
      if (rendered === null) continue;
      lines.push(`${k}: ${rendered}`);
    }
    // Closing delimiter, then a blank separator line before the body.
    lines.push(FRONTMATTER_DELIMITER, "", "");
  }
  return lines.join("\n") + input.contentMd;
}

function parseFrontmatterValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  // JSON-shaped: object, array, quoted-string.
  if (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith('"')
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  // Numbers — only when the whole token matches.
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  // Bare scalar string.
  return trimmed;
}

export function parseMarkdownBlob(rawMd: string): ParsedMarkdownBlob {
  const m = FRONTMATTER_REGEX.exec(rawMd);
  if (!m) {
    return { frontmatter: {}, contentMd: rawMd };
  }
  const yamlBody = m[1];
  const contentMd = m[2];
  const frontmatter: Record<string, unknown> = {};
  for (const line of yamlBody.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const valueRaw = line.slice(idx + 1);
    if (key === "") continue;
    frontmatter[key] = parseFrontmatterValue(valueRaw);
  }
  return { frontmatter, contentMd };
}

export interface ExportNoteAsMarkdownResult {
  readonly noteId: number;
  readonly version: number;
  readonly filename: string;
  readonly markdown: string;
}

export interface ExportNoteAsMarkdownOptions {
  /** Inject a custom vault repo for tests. Defaults to `AsdbVaultRepository`. */
  readonly repository?: VaultRepository;
}

function sanitizeFilenameSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "note";
}

export async function exportNoteAsMarkdown(
  noteId: number,
  options: ExportNoteAsMarkdownOptions = {},
): Promise<ExportNoteAsMarkdownResult | null> {
  const repo = options.repository ?? new AsdbVaultRepository();

  const note = await repo.getNoteById(noteId);
  if (!note) return null;

  const latest = await repo.getLatestNoteVersion(noteId);
  if (!latest) return null;

  const frontmatter: Record<string, unknown> = {
    ...(latest.frontmatter as Record<string, unknown> | null | undefined),
    title: note.title,
    slug: note.slug,
    noteId: note.id,
    version: latest.version,
  };

  const markdown = renderNoteAsMarkdown({
    frontmatter,
    contentMd: latest.contentMd,
  });
  const filename = `${sanitizeFilenameSegment(note.slug)}.md`;

  return {
    noteId: note.id,
    version: latest.version,
    filename,
    markdown,
  };
}
