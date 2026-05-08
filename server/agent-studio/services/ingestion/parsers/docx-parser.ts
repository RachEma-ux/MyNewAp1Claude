/**
 * DOCX (Word document) parser — D-UI-5 follow-up R5.
 *
 * Locked by `docs/architecture/agent-studio-docx-parser.md`
 * (D-PARSE-DOCX-1..4). Engine = `mammoth` (npm, pure JS, MIT, already
 * in node_modules). No external service, no credentials.
 *
 * Output contract (per ADR §5):
 *   - Heading-rich docs → one `markdown_section` unit per H1–H6
 *     section (heading + following paragraphs concatenated).
 *   - Memo-style docs (no headings) → one `text` unit with full
 *     extracted text.
 *   - Truly empty docs → `parts: []`.
 *
 * Failure modes (per ADR §4):
 *   - Invalid ZIP / non-OOXML bytes → mammoth throws → parser
 *     propagates as regular `Error` → dispatcher records parser
 *     failure (same shape as JSON `SyntaxError`).
 *   - Legacy `.doc` content-type is NOT registered; selection falls
 *     through to the standard `UnsupportedContentTypeError` path.
 *
 * Mammoth warnings (unparseable styles, missing fonts, etc.) flow
 * into `ParsedDocument.metadata.mammothWarnings` for operator
 * inspection without affecting unit shape.
 */

import mammoth from "mammoth";
import { load } from "cheerio";
import type {
  Parser,
  ParsedDocument,
  ParsedPart,
  RawArtifact,
} from "../types";

const HEADING_RE = /^h[1-6]$/i;

const ACCEPTS = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-word.document.macroenabled.12",
] as const;

// ── Mammoth interface (for dependency injection in tests) ─────────────

export interface MammothMessage {
  type?: string;
  message: string;
}

export interface MammothResult {
  value: string;
  messages: MammothMessage[];
}

export interface MammothImpl {
  convertToHtml(input: { buffer: Buffer }): Promise<MammothResult>;
  extractRawText(input: { buffer: Buffer }): Promise<MammothResult>;
}

const defaultMammothImpl: MammothImpl = {
  convertToHtml: (input) =>
    mammoth.convertToHtml(input as { buffer: Buffer }) as Promise<MammothResult>,
  extractRawText: (input) =>
    mammoth.extractRawText(input as { buffer: Buffer }) as Promise<MammothResult>,
};

export interface DocxParserDeps {
  mammothImpl?: MammothImpl;
}

// ── Section walking ───────────────────────────────────────────────────

interface DocxSection {
  heading: string;
  level: number; // 0 for preamble (pre-heading content)
  body: string;
}

function walkSections(html: string): DocxSection[] {
  if (html.trim().length === 0) return [];
  const $ = load(html);
  const out: DocxSection[] = [];
  let current: { heading: string; level: number; body: string[] } | null = null;

  // Mammoth wraps output in <html><body>… by default; cheerio normalizes
  // to a body root. Walk top-level body children — fall back to root
  // children when no <body> wrapper is present.
  const bodyChildren = $("body").children();
  const children = bodyChildren.length > 0 ? bodyChildren : $.root().children();
  children.each((_i, el) => {
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? "";
    if (HEADING_RE.test(tag)) {
      // Flush prior section if any.
      if (current) {
        out.push({
          heading: current.heading,
          level: current.level,
          body: current.body.join("\n\n").trim(),
        });
      }
      current = {
        heading: $(el).text().trim(),
        level: parseInt(tag.slice(1), 10) || 1,
        body: [],
      };
      return;
    }
    const text = $(el).text().trim();
    if (text.length === 0) return;
    if (!current) {
      // Pre-heading preamble: opens a level-0 section with empty heading.
      current = { heading: "", level: 0, body: [text] };
    } else {
      current.body.push(text);
    }
  });
  if (current) {
    out.push({
      heading: current.heading,
      level: current.level,
      body: current.body.join("\n\n").trim(),
    });
  }

  // Drop sections that are entirely empty (heading-less + body-less).
  return out.filter((s) => s.heading.length > 0 || s.body.length > 0);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "section";
}

// ── Parser factory + production singleton ─────────────────────────────

export function createDocxParser(deps: DocxParserDeps = {}): Parser {
  const impl = deps.mammothImpl ?? defaultMammothImpl;
  return {
    key: "docx",
    acceptsContentTypes: ACCEPTS,

    async parse(artifact: RawArtifact): Promise<ParsedDocument> {
      // Convert in parallel — mammoth holds no shared state across calls.
      const [htmlResult, textResult] = await Promise.all([
        impl.convertToHtml({ buffer: artifact.bytes }),
        impl.extractRawText({ buffer: artifact.bytes }),
      ]);

      const sections = walkSections(htmlResult.value);
      const parts: ParsedPart[] = [];
      // A document with no real headings yields only a level-0 "preamble"
      // section. In that case fall through to the single `text` unit
      // fallback rather than emitting a heading-less markdown_section.
      const hasHeading = sections.some((s) => s.level > 0);

      if (hasHeading) {
        sections.forEach((section, idx) => {
          const text = section.heading.length > 0
            ? `${section.heading}\n\n${section.body}`.trim()
            : section.body;
          if (text.length === 0) return;
          parts.push({
            partId: `docx-section-${idx + 1}`,
            text,
            unitTypeHint: "markdown_section",
            json: {
              heading: section.heading || null,
              level: section.level,
              body: section.body,
            },
            location: {
              selector: section.heading
                ? `#${slugify(section.heading)}`
                : null,
            },
          });
        });
      } else {
        // No-heading fallback: single `text` unit when there's any
        // content at all.
        const fullText = textResult.value.trim();
        if (fullText.length > 0) {
          parts.push({
            partId: "docx-text",
            text: fullText,
            unitTypeHint: "text",
          });
        }
      }

      // Mammoth warnings flow into doc metadata for operator inspection.
      const mammothWarnings = [
        ...htmlResult.messages.map((m) => m.message),
        ...textResult.messages.map((m) => m.message),
      ].filter((s, i, arr) => arr.indexOf(s) === i); // de-dupe

      return {
        parserKey: "docx",
        fullText: textResult.value.trim(),
        parts,
        metadata:
          mammothWarnings.length > 0
            ? { mammothWarnings }
            : undefined,
      };
    },
  };
}

export const docxParser: Parser = createDocxParser();
