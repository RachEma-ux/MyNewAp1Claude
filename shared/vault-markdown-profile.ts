/**
 * Vault markdown profile — pure parse/render helpers.
 *
 * Track B follow-on (B5). Extracts the pure functions that were
 * previously file-local in
 * `server/agent-studio/services/vault/markdown-import-export.ts`
 * so the client (Track B properties panel) can round-trip
 * frontmatter without duplicating the parsing logic.
 *
 * The server module re-exports these so existing callers see no
 * change. Single source of truth for the frontmatter contract per
 * `docs/architecture/agent-studio-markdown-profile.md`.
 *
 * No DB / no Node-only imports — safe to import from both server
 * AND client (`@shared/vault-markdown-profile`).
 */

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
  const yamlBody = m[1] ?? "";
  const contentMd = m[2] ?? "";
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

/**
 * Sanitizes a string into a safe filename segment: ASCII alnum +
 * `-_`, trimmed of leading/trailing dashes, with `"note"` as a
 * fallback for fully-stripped inputs.
 */
export function sanitizeFilenameSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "note";
}
