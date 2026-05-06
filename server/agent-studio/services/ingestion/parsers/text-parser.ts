/**
 * Text parser — D-UI-5 MVP parser #1.
 *
 * UTF-8 plain text. Splits on blank lines (paragraph boundaries) into
 * `text` units. Empty inputs produce zero parts; the normalizer skips
 * them and the job records `unitsCreated=0` rather than failing.
 */

import type { Parser, ParsedDocument, RawArtifact } from "../types";

export const textParser: Parser = {
  key: "text",
  acceptsContentTypes: ["text/plain"],

  async parse(artifact: RawArtifact): Promise<ParsedDocument> {
    const text = artifact.bytes.toString("utf-8");
    const fullText = text.replace(/\r\n/g, "\n");
    const paragraphs = fullText
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    return {
      parserKey: "text",
      fullText,
      parts: paragraphs.map((paragraph, idx) => {
        const start = fullText.indexOf(paragraph);
        const lineRange = inferLineRange(fullText, start, start + paragraph.length);
        return {
          partId: `text-${idx}`,
          text: paragraph,
          unitTypeHint: "text",
          location: { lineRange },
        };
      }),
    };
  },
};

function inferLineRange(
  fullText: string,
  startOffset: number,
  endOffset: number,
): { start: number; end: number } | null {
  if (startOffset < 0) return null;
  let line = 1;
  let pos = 0;
  let startLine = 1;
  let endLine = 1;
  for (let i = 0; i < fullText.length; i++) {
    if (i === startOffset) startLine = line;
    if (i === endOffset) {
      endLine = line;
      break;
    }
    if (fullText[i] === "\n") line++;
    pos = i;
  }
  if (endOffset >= fullText.length) endLine = line;
  return { start: startLine, end: endLine };
}
