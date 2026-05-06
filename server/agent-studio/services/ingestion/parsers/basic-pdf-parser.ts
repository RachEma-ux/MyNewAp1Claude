/**
 * Basic PDF text parser — D-UI-5 MVP parser #5.
 *
 * Text-only extraction; no OCR. Each page becomes one `pdf_page` unit.
 * Uses the existing `pdf-parse` dependency; failures (encrypted PDFs,
 * malformed inputs) propagate to the dispatcher which records the job
 * as failed.
 *
 * Multi-page PDFs that produce no text on a page (e.g., scanned image
 * pages without OCR) are skipped silently — the job's `unitsCreated`
 * counter shows fewer pages than the PDF claims; the operator can see
 * the gap in the UI and request OCR re-processing in a follow-up.
 */

import type { Parser, ParsedDocument, ParsedPart, RawArtifact } from "../types";

export const basicPdfTextParser: Parser = {
  key: "basic_pdf_text",
  acceptsContentTypes: ["application/pdf"],

  async parse(artifact: RawArtifact): Promise<ParsedDocument> {
    // Lazy import — pdf-parse pulls in heavy deps; only loaded when a
    // PDF actually arrives.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParseModule = await import("pdf-parse");
    const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> =
      // pdf-parse exports a CJS default; handle both shapes.
      (pdfParseModule as { default?: typeof pdfParseModule } & typeof pdfParseModule).default ??
      (pdfParseModule as unknown as (buf: Buffer) => Promise<{ text: string; numpages: number }>);

    const result = await pdfParse(artifact.bytes);
    const fullText = (result.text ?? "").replace(/\r\n/g, "\n");

    // pdf-parse joins all page text with form-feed (\f). Split on it
    // for per-page units. Older pdf-parse versions sometimes use
    // double newlines; we tolerate both.
    const pageDelim = fullText.includes("\f") ? /\f+/ : /\n{3,}/;
    const pages = fullText
      .split(pageDelim)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const parts: ParsedPart[] = pages.map((page, i) => ({
      partId: `pdf-page-${i + 1}`,
      text: page,
      unitTypeHint: "pdf_page",
      location: { pageNumber: i + 1 },
    }));

    return {
      parserKey: "basic_pdf_text",
      fullText,
      parts,
      metadata: { reportedPageCount: result.numpages },
    };
  },
};
