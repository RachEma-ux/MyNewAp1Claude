/**
 * License extractor — U5-b.2.
 *
 * Per `docs/architecture/agent-studio/RAC_PII_LICENSE_ENFORCEMENT.md`
 * §3.2 (DD2), license is per-unit on `ags_knowledge_units.license`.
 * Three parser-specific helpers extract the signal at parse time:
 *
 *   - HTML: `<link rel="license" href="...">` or
 *           `<meta name="license" content="...">`
 *   - JSON: top-level `license` key (string or `{type: "..."}`).
 *   - Code: SPDX comment in the first 20 lines
 *           (`SPDX-License-Identifier: <id>` per ADR §3.2).
 *
 * Other parsers (text, markdown, pdf, csv, xlsx, ocr, audio, video)
 * leave NULL — they have no canonical license signal in the bytes.
 *
 * Output: trimmed string when found, `null` when absent. Vocabulary is
 * free-form per ADR DD2 — operators may register site-specific labels
 * alongside SPDX identifiers.
 */

const SPDX_LINE_RE = /SPDX-License-Identifier:\s*([A-Za-z0-9.\-+_ ()]+)/;
// `\b` after the alternation would fail in the quoted variants because
// `"` (non-word) → ` ` (non-word) is no boundary. We rely on the
// closing `"`/`'` of the literal to disambiguate, and require a word
// boundary on the bare alternative to keep `licensed`/`licenseFoo`
// from matching.
const HTML_LINK_LICENSE_RE =
  /<link\b[^>]*\brel\s*=\s*(?:"license"|'license'|license\b)[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/i;
const HTML_META_LICENSE_RE =
  /<meta\b[^>]*\bname\s*=\s*(?:"license"|'license'|license\b)[^>]*\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/i;

const MAX_LICENSE_LEN = 64; // matches `ags_knowledge_units.license` VARCHAR(64).

function clamp(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > MAX_LICENSE_LEN ? trimmed.slice(0, MAX_LICENSE_LEN) : trimmed;
}

/**
 * HTML extractor. Reads either `<link rel="license" href="...">`
 * (preferred — RFC 4287) or `<meta name="license" content="...">`
 * (common in HTML5 + Open Graph variants). The first match wins.
 *
 * Both attribute orders (rel before href / href before rel) are
 * accepted by accepting alternation; quoted and unquoted values are
 * accepted. Case-insensitive.
 */
export function extractLicenseFromHtml(rawHtml: string): string | null {
  const linkMatch = rawHtml.match(HTML_LINK_LICENSE_RE);
  if (linkMatch) {
    const value = linkMatch[1] ?? linkMatch[2] ?? linkMatch[3] ?? null;
    const out = clamp(value);
    if (out) return out;
  }
  const metaMatch = rawHtml.match(HTML_META_LICENSE_RE);
  if (metaMatch) {
    const value = metaMatch[1] ?? metaMatch[2] ?? metaMatch[3] ?? null;
    const out = clamp(value);
    if (out) return out;
  }
  return null;
}

/**
 * JSON extractor. Reads the top-level `license` field if it's a
 * string OR a `{type: string}` object (npm package.json convention).
 * Anything else (array, nested object without `type`, non-string) is
 * `null` — operators can override per-unit via U5-b.4 mutations.
 */
export function extractLicenseFromJson(parsed: unknown): string | null {
  if (parsed == null || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const v = obj["license"];
  if (typeof v === "string") return clamp(v);
  if (v && typeof v === "object" && "type" in v) {
    const t = (v as Record<string, unknown>)["type"];
    if (typeof t === "string") return clamp(t);
  }
  return null;
}

/**
 * Code extractor. Reads the first SPDX-License-Identifier comment in
 * the leading `MAX_HEAD_LINES` lines. Comment shapes accepted:
 *
 *   // SPDX-License-Identifier: MIT
 *   /* SPDX-License-Identifier: Apache-2.0
 *   # SPDX-License-Identifier: GPL-3.0-or-later   (Python / shell / Ruby)
 *   -- SPDX-License-Identifier: ISC               (SQL / Haskell)
 *
 * Anything not preceded by a comment delimiter is rejected to avoid
 * matching arbitrary text in a string literal.
 */
const MAX_HEAD_LINES = 20;
export function extractLicenseFromCode(rawCode: string): string | null {
  const lines = rawCode.split(/\r?\n/, MAX_HEAD_LINES);
  for (const line of lines) {
    const m = line.match(SPDX_LINE_RE);
    if (!m) continue;
    // Make sure the line starts with a comment delimiter — reject
    // SPDX strings that happen to live inside a string literal /
    // arbitrary code.
    const trimmed = line.trimStart();
    if (
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("/*") &&
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("--") &&
      !trimmed.startsWith(";")
    ) {
      continue;
    }
    return clamp(m[1]);
  }
  return null;
}
