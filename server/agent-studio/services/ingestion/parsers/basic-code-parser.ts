/**
 * Basic code file parser — D-UI-5 MVP parser #6.
 *
 * Heuristic per-function and per-class chunking for common languages
 * (TypeScript / JavaScript / Python / Go / Java / Rust). Imports are
 * preserved as a leading `text` unit so downstream retrieval can locate
 * "what this file imports from where".
 *
 * The heuristic is deliberately simple — full AST parsing per language
 * is a follow-up. The tradeoff: a unit may include comments + the next
 * function header on a noisy file, but the unit always contains the
 * full function body (we anchor on `^[ \t]*(export\s+)?(async\s+)?(function|class|def|fn|func|public|private|protected)\s+\w+`
 * lines and chunk to the next anchor).
 */

import type { Parser, ParsedDocument, ParsedPart, RawArtifact } from "../types";
import { extractLicenseFromCode } from "../license-extractor";

const ANCHOR_RE =
  /^[ \t]*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|def|fn|func|public|private|protected|interface|type)\s+(\w+)/;

const IMPORT_RE = /^(?:import\s+|from\s+\S+\s+import\s+|use\s+|require\s*\(|package\s+|using\s+)/;

const CONTENT_TYPES_BY_LANG: Record<string, string[]> = {
  typescript: ["text/x-typescript", "application/x-typescript"],
  javascript: ["text/javascript", "application/javascript"],
  python: ["text/x-python"],
  go: ["text/x-go"],
  java: ["text/x-java"],
  rust: ["text/x-rust"],
};

const ALL_CONTENT_TYPES = Object.values(CONTENT_TYPES_BY_LANG).flat();

export const basicCodeFileParser: Parser = {
  key: "basic_code_file",
  acceptsContentTypes: ALL_CONTENT_TYPES,

  async parse(artifact: RawArtifact): Promise<ParsedDocument> {
    const text = artifact.bytes.toString("utf-8").replace(/\r\n/g, "\n");
    const lines = text.split("\n");

    // Group leading imports as a single text unit (anchor for retrieval).
    let importEndIdx = 0;
    while (
      importEndIdx < lines.length &&
      (IMPORT_RE.test(lines[importEndIdx]) ||
        lines[importEndIdx].trim() === "" ||
        lines[importEndIdx].trim().startsWith("//"))
    ) {
      importEndIdx++;
    }

    const parts: ParsedPart[] = [];
    let idx = 0;

    if (importEndIdx > 0) {
      const importsText = lines.slice(0, importEndIdx).join("\n").trim();
      if (importsText.length > 0) {
        parts.push({
          partId: `code-imports-${idx++}`,
          text: importsText,
          unitTypeHint: "text",
          location: { lineRange: { start: 1, end: importEndIdx } },
          json: { kind: "imports" },
        });
      }
    }

    // Walk the file from importEndIdx, anchor on top-level definitions.
    let currentStart = importEndIdx;
    let currentName: string | null = null;
    let currentKind: "function" | "class" = "function";

    for (let i = importEndIdx; i < lines.length; i++) {
      const m = lines[i].match(ANCHOR_RE);
      if (m && i > currentStart) {
        emit(currentStart, i, currentName, currentKind);
        currentStart = i;
        currentName = m[1];
        currentKind = /class|interface|type/.test(lines[i]) ? "class" : "function";
      } else if (m) {
        currentName = m[1];
        currentKind = /class|interface|type/.test(lines[i]) ? "class" : "function";
      }
    }
    if (currentStart < lines.length && currentName !== null) {
      // Only emit the trailing chunk when we actually anchored on
      // a definition; otherwise let the no-anchors fallback below
      // produce a single `text` unit instead of a misleading
      // `code_function` unit.
      emit(currentStart, lines.length, currentName, currentKind);
    }

    function emit(
      start: number,
      end: number,
      name: string | null,
      kind: "function" | "class",
    ) {
      const body = lines.slice(start, end).join("\n").trim();
      if (body.length === 0) return;
      parts.push({
        partId: `code-${kind}-${idx++}-${name ?? "anon"}`,
        text: body,
        unitTypeHint: kind === "class" ? "code_class" : "code_function",
        location: { lineRange: { start: start + 1, end } },
        json: { name, kind },
      });
    }

    // Files with no anchors at all (config files, scripts) become a
    // single `text` unit so they're still retrievable.
    if (parts.length === 0 && text.trim().length > 0) {
      parts.push({
        partId: "code-whole-file",
        text,
        unitTypeHint: "text",
        location: { lineRange: { start: 1, end: lines.length } },
      });
    }

    // U5-b.2: SPDX-License-Identifier comment in the first 20 lines.
    const license = extractLicenseFromCode(text);

    return {
      parserKey: "basic_code_file",
      fullText: text,
      parts,
      metadata: license != null ? { license } : undefined,
    };
  },
};
