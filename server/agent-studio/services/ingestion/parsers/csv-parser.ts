/**
 * CSV parser — D-UI-5 follow-up D4 (one of the additional MVP
 * parsers documented in agent-studio-retrofit-followups.md §D4).
 *
 * Each non-header row becomes a `table_row` unit (D-NKU-2). The first
 * row is treated as the header line and used to label fields in the
 * structured `contentJson` shape. The canonical text projection
 * formats each row as `key: value` lines so retrieval matches against
 * the human-readable form (D-NKU-3).
 *
 * Tolerates:
 *   - LF / CRLF line endings
 *   - Comma, semicolon, and tab delimiters (auto-detected from header)
 *   - Quoted fields with embedded commas / newlines / escaped quotes
 *
 * Out of scope (deliberately): per-cell type inference, multi-byte
 * delimiters, decimal-comma locales. CSVs that need those should ship
 * via the spreadsheet parser (xlsx, future follow-up).
 */

import type { Parser, ParsedDocument, ParsedPart, RawArtifact } from "../types";

const SUPPORTED_DELIMITERS = [",", ";", "\t"] as const;
type Delimiter = (typeof SUPPORTED_DELIMITERS)[number];

export const csvParser: Parser = {
  key: "csv",
  acceptsContentTypes: ["text/csv", "application/csv", "text/tab-separated-values"],

  async parse(artifact: RawArtifact): Promise<ParsedDocument> {
    const text = artifact.bytes.toString("utf-8");
    const trimmed = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (trimmed.trim().length === 0) {
      return { parserKey: "csv", fullText: text, parts: [] };
    }

    const delimiter = detectDelimiter(trimmed);
    const rows = parseCsv(trimmed, delimiter);
    if (rows.length === 0) {
      return { parserKey: "csv", fullText: text, parts: [] };
    }

    const header = rows[0];
    const dataRows = rows.slice(1);

    const parts: ParsedPart[] = dataRows.map((row, idx) => {
      const fields: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) {
        const key = header[i] || `col${i + 1}`;
        fields[key] = row[i] ?? "";
      }
      const projection = Object.entries(fields)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      return {
        partId: `csv-row-${idx + 1}`,
        text: projection,
        unitTypeHint: "table_row",
        json: fields,
      };
    });

    return {
      parserKey: "csv",
      fullText: text,
      parts,
    };
  },
};

// ── Delimiter detection ───────────────────────────────────────────────

function detectDelimiter(text: string): Delimiter {
  // Use the first non-empty line as the header sample.
  const firstLine = text.split("\n").find((l) => l.length > 0) ?? "";
  let best: Delimiter = ",";
  let bestCount = -1;
  for (const d of SUPPORTED_DELIMITERS) {
    const count = countOutsideQuotes(firstLine, d);
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, ch: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // Toggle unless escaped quote-quote.
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (!inQuotes && c === ch) {
      count += 1;
    }
  }
  return count;
}

// ── CSV row tokenizer ─────────────────────────────────────────────────

function parseCsv(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      row.push(field);
      field = "";
      // Skip empty rows (consecutive newlines).
      if (row.length > 1 || row[0]?.length > 0) {
        rows.push(row);
      }
      row = [];
      continue;
    }
    field += c;
  }

  // Flush trailing field/row.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0]?.length > 0) {
      rows.push(row);
    }
  }

  return rows;
}
