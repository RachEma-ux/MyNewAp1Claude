/**
 * Parser registry — D-UI-1 layer #2.
 *
 * In-process registry; no DB row per parser. Parsers register at module
 * load time. The dispatcher selects by content-type prefix; the first
 * parser whose `acceptsContentTypes` includes a prefix that matches the
 * artifact's `contentType` wins. Caller can override via
 * `IngestionJobRequest.parserKey`.
 *
 * The registry is mutable by tests via `registerParser` / `clearParsers`
 * but the production boot path calls `registerDefaultParsers()` exactly
 * once.
 */

import { textParser } from "./parsers/text-parser";
import { markdownParser } from "./parsers/markdown-parser";
import { htmlSnapshotParser } from "./parsers/html-snapshot-parser";
import { jsonParser } from "./parsers/json-parser";
import { basicPdfTextParser } from "./parsers/basic-pdf-parser";
import { basicCodeFileParser } from "./parsers/basic-code-parser";
import { csvParser } from "./parsers/csv-parser";
import { xlsxParser } from "./parsers/xlsx-parser";
import { ocrParser } from "./parsers/ocr-parser";
import { audioParser } from "./parsers/audio-parser";
import { UnsupportedContentTypeError, type Parser } from "./types";

const parsers = new Map<string, Parser>();

export function registerParser(parser: Parser): void {
  parsers.set(parser.key, parser);
}

export function clearParsers(): void {
  parsers.clear();
}

export function getParser(key: string): Parser | undefined {
  return parsers.get(key);
}

export function listParsers(): ReadonlyArray<Parser> {
  return [...parsers.values()];
}

/**
 * Pick a parser for the artifact's content-type. Throws
 * `UnsupportedContentTypeError` when no registered parser claims the
 * type — the dispatcher catches and records the job as
 * `status="unsupported_type"` (D-UI-5).
 */
export function selectParserForContentType(contentType: string): Parser {
  const lower = contentType.toLowerCase();
  for (const parser of parsers.values()) {
    for (const accepted of parser.acceptsContentTypes) {
      if (lower === accepted || lower.startsWith(accepted + ";")) {
        return parser;
      }
    }
  }
  throw new UnsupportedContentTypeError(contentType);
}

let defaultsRegistered = false;

export function registerDefaultParsers(): void {
  if (defaultsRegistered) return;
  registerParser(textParser);
  registerParser(markdownParser);
  registerParser(htmlSnapshotParser);
  registerParser(jsonParser);
  registerParser(basicPdfTextParser);
  registerParser(basicCodeFileParser);
  registerParser(csvParser);
  registerParser(xlsxParser);
  registerParser(ocrParser);
  registerParser(audioParser);
  defaultsRegistered = true;
}

/** Reset for tests — restores the MVP parsers. */
export function resetParsersToDefaults(): void {
  clearParsers();
  defaultsRegistered = false;
  registerDefaultParsers();
}
