/**
 * Follow-up D4 — XLSX parser unit tests.
 *
 * Locks the xlsx parser's contract:
 *   - First row of each visible sheet is the header; subsequent rows
 *     become `table_row` units (D-NKU-2).
 *   - `contentJson` carries the structured shape (header → cell map)
 *     plus a `sheet` field so cross-sheet citations stay unambiguous.
 *   - Text projection is `key: value` lines (D-NKU-3) — same as CSV.
 *   - Hidden / very-hidden sheets are skipped.
 *   - Multi-sheet workbooks emit units for each visible sheet.
 *   - Empty cells, formula-result cells, hyperlink cells, rich-text
 *     cells, error cells, date cells all flatten to displayable text.
 *   - Empty / header-only sheets produce zero parts.
 *
 * Fixtures are generated at test-time via the same exceljs library
 * the parser uses, so the shape stays in sync without committing
 * binary `.xlsx` blobs to the repo.
 */

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { xlsxParser } from "../../server/agent-studio/services/ingestion/parsers/xlsx-parser";
import type { RawArtifact } from "../../server/agent-studio/services/ingestion/types";

async function buildArtifact(
  build: (wb: ExcelJS.Workbook) => void | Promise<void>,
): Promise<RawArtifact> {
  const wb = new ExcelJS.Workbook();
  await build(wb);
  const buf = await wb.xlsx.writeBuffer();
  const bytes = Buffer.from(buf);
  return {
    bytes,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sourceUri: "memory://test.xlsx",
    contentHash: "0".repeat(64),
  };
}

describe("xlsxParser — happy path", () => {
  it("emits one table_row part per data row, header used as keys", async () => {
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("People");
      ws.addRow(["name", "age"]);
      ws.addRow(["Alice", 30]);
      ws.addRow(["Bob", 25]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parserKey).toBe("xlsx");
    expect(r.parts).toHaveLength(2);
    expect(r.parts[0].unitTypeHint).toBe("table_row");
    expect(r.parts[0].json).toMatchObject({
      sheet: "People",
      name: "Alice",
      age: "30",
    });
    expect(r.parts[1].json).toMatchObject({ name: "Bob", age: "25" });
  });

  it("text projection is `key: value` lines (D-NKU-3)", async () => {
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("People");
      ws.addRow(["name", "age"]);
      ws.addRow(["Alice", 30]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts[0].text).toBe("name: Alice\nage: 30");
  });

  it("falls back to col1/col2 for empty header cells", async () => {
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("Gappy");
      ws.addRow([null, "b"]);
      ws.addRow(["x", "y"]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts[0].json).toMatchObject({ col1: "x", b: "y" });
  });
});

describe("xlsxParser — multi-sheet + hidden sheets", () => {
  it("emits parts for every visible sheet", async () => {
    const artifact = await buildArtifact((wb) => {
      const a = wb.addWorksheet("First");
      a.addRow(["k", "v"]);
      a.addRow(["a", "1"]);
      const b = wb.addWorksheet("Second");
      b.addRow(["k", "v"]);
      b.addRow(["b", "2"]);
      b.addRow(["c", "3"]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts).toHaveLength(3);
    const sheets = r.parts.map((p) => (p.json as { sheet: string }).sheet);
    expect(sheets).toEqual(["First", "Second", "Second"]);
  });

  it("partId encodes the sheet slug so cross-sheet citations stay unambiguous", async () => {
    const artifact = await buildArtifact((wb) => {
      const a = wb.addWorksheet("Q1 Sales!");
      a.addRow(["k", "v"]);
      a.addRow(["a", "1"]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts[0].partId).toBe("xlsx-q1-sales-row-1");
    expect(r.parts[0].location?.selector).toBe("Q1 Sales!!A2");
  });

  it("skips hidden sheets", async () => {
    const artifact = await buildArtifact((wb) => {
      const visible = wb.addWorksheet("Visible");
      visible.addRow(["k", "v"]);
      visible.addRow(["a", "1"]);
      const hidden = wb.addWorksheet("Hidden");
      hidden.state = "hidden";
      hidden.addRow(["k", "v"]);
      hidden.addRow(["secret", "value"]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts).toHaveLength(1);
    expect((r.parts[0].json as { sheet: string }).sheet).toBe("Visible");
  });

  it("skips very-hidden sheets", async () => {
    const artifact = await buildArtifact((wb) => {
      const v = wb.addWorksheet("Visible");
      v.addRow(["k"]);
      v.addRow(["a"]);
      const h = wb.addWorksheet("VeryHidden");
      h.state = "veryHidden";
      h.addRow(["k"]);
      h.addRow(["b"]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts).toHaveLength(1);
  });
});

describe("xlsxParser — cell shape coverage", () => {
  it("flattens date cells to ISO strings", async () => {
    const d = new Date("2026-05-06T12:34:56Z");
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("Dates");
      ws.addRow(["when"]);
      ws.addRow([d]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts[0].json).toMatchObject({ when: d.toISOString() });
  });

  it("flattens hyperlink cells to their visible text", async () => {
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("Links");
      ws.addRow(["site"]);
      ws.addRow([{ text: "Anthropic", hyperlink: "https://anthropic.com" }]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts[0].json).toMatchObject({ site: "Anthropic" });
  });

  it("flattens formula-result cells to the cached result", async () => {
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("Formulas");
      ws.addRow(["sum"]);
      ws.addRow([{ formula: "1+2", result: 3 }]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts[0].json).toMatchObject({ sum: "3" });
  });

  it("flattens error cells to the error code", async () => {
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("Errs");
      ws.addRow(["e"]);
      ws.addRow([{ error: "#REF!" }]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts[0].json).toMatchObject({ e: "#REF!" });
  });

  it("flattens rich-text cells by concatenating runs", async () => {
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("RT");
      ws.addRow(["note"]);
      ws.addRow([
        {
          richText: [
            { text: "Hello ", font: { bold: true } },
            { text: "world" },
          ],
        },
      ]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts[0].json).toMatchObject({ note: "Hello world" });
  });

  it("treats empty cells as empty strings, not the literal `null`", async () => {
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("Sparse");
      ws.addRow(["a", "b", "c"]);
      ws.addRow(["1", null, "3"]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts[0].json).toMatchObject({ a: "1", b: "", c: "3" });
  });

  it("preserves boolean cells as `true` / `false` strings", async () => {
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("Bools");
      ws.addRow(["flag"]);
      ws.addRow([true]);
      ws.addRow([false]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts[0].json).toMatchObject({ flag: "true" });
    expect(r.parts[1].json).toMatchObject({ flag: "false" });
  });
});

describe("xlsxParser — edge cases", () => {
  it("empty workbook produces zero parts (no crash)", async () => {
    const artifact = await buildArtifact(() => {
      // No sheets added.
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts).toEqual([]);
  });

  it("header-only sheet produces zero parts", async () => {
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("Solo");
      ws.addRow(["a", "b"]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts).toEqual([]);
  });

  it("blank rows interleaved with data are skipped, not emitted as empty units", async () => {
    const artifact = await buildArtifact((wb) => {
      const ws = wb.addWorksheet("Gap");
      ws.addRow(["k", "v"]);
      ws.addRow(["a", "1"]);
      ws.addRow([]); // blank
      ws.addRow(["b", "2"]);
    });
    const r = await xlsxParser.parse(artifact);
    expect(r.parts).toHaveLength(2);
    expect(r.parts[0].json).toMatchObject({ k: "a", v: "1" });
    expect(r.parts[1].json).toMatchObject({ k: "b", v: "2" });
  });
});

describe("xlsxParser — supported content types", () => {
  it("accepts the canonical xlsx mime + the macro-enabled variant", () => {
    expect(xlsxParser.acceptsContentTypes).toEqual(
      expect.arrayContaining([
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel.sheet.macroenabled.12",
      ]),
    );
  });
});
