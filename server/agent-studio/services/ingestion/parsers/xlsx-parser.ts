/**
 * XLSX (Excel spreadsheet) parser — D-UI-5 follow-up D4.
 *
 * Each non-header row of every visible sheet becomes a `table_row`
 * unit (D-NKU-2). Within a sheet the first row is treated as the
 * header line and used to label fields in the structured `contentJson`
 * shape. The canonical text projection formats each row as
 * `key: value` lines so retrieval matches against the human-readable
 * form (D-NKU-3).
 *
 * Design parallels `csv-parser.ts` so multi-sheet workbooks degrade
 * cleanly to the same downstream contract a single CSV produces.
 *
 * Tolerates:
 *   - Multiple worksheets — `partId` prefixes the sheet name so
 *     citations remain unambiguous across sheets.
 *   - Empty / header-only sheets — emit zero parts for that sheet.
 *   - Hidden / very-hidden sheets — skipped (operators don't intend
 *     hidden sheets to flow into retrieval; that's the point of
 *     hiding).
 *   - Rich-text, hyperlink, formula-result, and error cells — flattened
 *     to their displayable string form.
 *   - Empty headers — fall back to `col{N}` labels (matches CSV).
 *
 * Out of scope (deliberately): formula evaluation, charts, named
 * ranges, conditional formatting, the legacy binary `.xls` format
 * (exceljs is xlsx-only).
 */

import ExcelJS from "exceljs";
import type { Parser, ParsedDocument, ParsedPart, RawArtifact } from "../types";

export const xlsxParser: Parser = {
  key: "xlsx",
  acceptsContentTypes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel.sheet.macroenabled.12",
  ],

  async parse(artifact: RawArtifact): Promise<ParsedDocument> {
    const workbook = new ExcelJS.Workbook();
    // exceljs accepts a Node Buffer directly; the cast keeps the
    // declaration honest under the lib's `Buffer | ArrayBuffer` union.
    await workbook.xlsx.load(artifact.bytes as unknown as ArrayBuffer);

    const parts: ParsedPart[] = [];
    const fullTextChunks: string[] = [];

    for (const sheet of workbook.worksheets) {
      if (sheet.state && sheet.state !== "visible") continue;

      const rows = readRows(sheet);
      if (rows.length === 0) continue;

      const header = rows[0];
      const dataRows = rows.slice(1);
      if (dataRows.length === 0) continue;

      const sheetSlug = slug(sheet.name);
      fullTextChunks.push(`# Sheet: ${sheet.name}`);

      for (let r = 0; r < dataRows.length; r++) {
        const row = dataRows[r];
        const fields: Record<string, string> = {};
        for (let c = 0; c < header.length; c++) {
          const key = header[c] || `col${c + 1}`;
          fields[key] = row[c] ?? "";
        }
        const projection = Object.entries(fields)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");
        parts.push({
          partId: `xlsx-${sheetSlug}-row-${r + 1}`,
          text: projection,
          unitTypeHint: "table_row",
          json: { sheet: sheet.name, ...fields },
          location: { selector: `${sheet.name}!A${r + 2}` },
        });
        fullTextChunks.push(projection);
      }
    }

    return {
      parserKey: "xlsx",
      fullText: fullTextChunks.join("\n\n"),
      parts,
      metadata: { sheetCount: workbook.worksheets.length },
    };
  },
};

// ── Sheet → string-matrix projection ──────────────────────────────────

function readRows(sheet: ExcelJS.Worksheet): string[][] {
  const out: string[][] = [];
  // `actualRowCount` would skip the trailing empty rows ExcelJS
  // sometimes carries; iterate through the dense range instead so the
  // header sits at row 1 even if the sheet was authored with a leading
  // blank row (which we then drop via the empty-row filter).
  const lastRow = sheet.rowCount;
  for (let r = 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    // `row.values` is 1-indexed (slot 0 is undefined). Slice it off.
    const raw = (row.values as ExcelJS.CellValue[]) ?? [];
    const cells = raw.slice(1).map(cellToString);
    if (cells.every((c) => c.length === 0)) continue;
    out.push(cells);
  }
  return out;
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray((v as { richText?: unknown }).richText)) {
      return ((v as { richText: Array<{ text: string }> }).richText)
        .map((rt) => rt.text)
        .join("");
    }
    if ("result" in v) return cellToString(v.result);
    if ("text" in v) return String(v.text);
    if ("error" in v) return String(v.error);
    if ("hyperlink" in v) return String(v.hyperlink);
  }
  return String(value);
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "sheet";
}
