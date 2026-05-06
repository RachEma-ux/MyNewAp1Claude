/**
 * JSON parser — D-UI-5 MVP parser #4.
 *
 * Top-level keys become `json_object` units. Top-level arrays expand
 * into per-element units. The structured shape is preserved on
 * `contentJson` so downstream consumers can read fields without re-
 * parsing; the canonical text projection is `JSON.stringify(value, null, 2)`.
 *
 * Malformed JSON throws `SyntaxError`, which the dispatcher records as a
 * job failure (D-UI-5 "unsupported files fail safely").
 */

import type { Parser, ParsedDocument, ParsedPart, RawArtifact } from "../types";

export const jsonParser: Parser = {
  key: "json",
  acceptsContentTypes: ["application/json", "text/json"],

  async parse(artifact: RawArtifact): Promise<ParsedDocument> {
    const text = artifact.bytes.toString("utf-8");
    const parsed = JSON.parse(text);

    const parts: ParsedPart[] = [];
    let idx = 0;

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        parts.push({
          partId: `json-${idx++}`,
          text: stringify(item),
          unitTypeHint: "json_object",
          json: typeof item === "object" && item != null ? item as Record<string, unknown> : { value: item },
        });
      }
    } else if (parsed != null && typeof parsed === "object") {
      for (const [key, value] of Object.entries(parsed)) {
        parts.push({
          partId: `json-${key}`,
          text: stringify({ [key]: value }),
          unitTypeHint: "json_object",
          json: { [key]: value },
        });
      }
    } else {
      // Scalar top-level (e.g., "hello" or 42) — single unit.
      parts.push({
        partId: "json-root",
        text: stringify(parsed),
        unitTypeHint: "json_object",
        json: { value: parsed },
      });
    }

    return {
      parserKey: "json",
      fullText: text,
      parts,
    };
  },
};

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
