/**
 * Markdown parser — D-UI-5 MVP parser #2.
 *
 * Splits on headings (any `#`+ depth) into `markdown_section` units.
 * Fenced code blocks become sibling `code_function` units (best-effort —
 * the language tag isn't validated; the BasicCodeFileParser handles
 * full-file code parsing). Tables are emitted as a single
 * `markdown_section` unit (per-row extraction is a follow-up).
 */

import type { Parser, ParsedDocument, ParsedPart, RawArtifact } from "../types";

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^```/;

export const markdownParser: Parser = {
  key: "markdown",
  acceptsContentTypes: ["text/markdown", "text/x-markdown"],

  async parse(artifact: RawArtifact): Promise<ParsedDocument> {
    const text = artifact.bytes.toString("utf-8").replace(/\r\n/g, "\n");
    const lines = text.split("\n");

    const parts: ParsedPart[] = [];
    let buffer: string[] = [];
    let bufferStartLine = 1;
    let bufferHeadingLevel = 0;
    let bufferHeading: string | null = null;
    let inFence = false;
    let fenceLang: string | null = null;
    let fenceBuffer: string[] = [];
    let fenceStartLine = 0;
    let codeIdx = 0;
    let sectionIdx = 0;

    const flushSection = (endLine: number) => {
      const sectionText = buffer.join("\n").trim();
      if (sectionText.length === 0) return;
      parts.push({
        partId: `md-section-${sectionIdx++}`,
        text: sectionText,
        unitTypeHint: "markdown_section",
        location: { lineRange: { start: bufferStartLine, end: endLine } },
        json:
          bufferHeading !== null
            ? { heading: bufferHeading, level: bufferHeadingLevel }
            : undefined,
      });
    };
    const flushFence = (endLine: number) => {
      const code = fenceBuffer.join("\n");
      if (code.trim().length === 0) return;
      parts.push({
        partId: `md-code-${codeIdx++}`,
        text: code,
        unitTypeHint: "code_function",
        location: { lineRange: { start: fenceStartLine, end: endLine } },
        json: fenceLang ? { language: fenceLang } : undefined,
      });
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (FENCE_RE.test(line)) {
        if (!inFence) {
          // Closing the current section before opening a fence keeps
          // narrative text and code blocks as separate units.
          flushSection(lineNum - 1);
          buffer = [];
          inFence = true;
          fenceLang = line.replace(/^```/, "").trim() || null;
          fenceStartLine = lineNum;
          fenceBuffer = [];
        } else {
          flushFence(lineNum);
          inFence = false;
          fenceLang = null;
          fenceBuffer = [];
          bufferStartLine = lineNum + 1;
        }
        continue;
      }

      if (inFence) {
        fenceBuffer.push(line);
        continue;
      }

      const heading = line.match(HEADING_RE);
      if (heading) {
        flushSection(lineNum - 1);
        buffer = [line];
        bufferStartLine = lineNum;
        bufferHeadingLevel = heading[1].length;
        bufferHeading = heading[2];
      } else {
        if (buffer.length === 0) bufferStartLine = lineNum;
        buffer.push(line);
      }
    }
    flushSection(lines.length);
    if (inFence) {
      // Unterminated fence — capture what we have so the operator sees
      // the partial code rather than silently losing it.
      flushFence(lines.length);
    }

    return {
      parserKey: "markdown",
      fullText: text,
      parts,
    };
  },
};
