/**
 * Follow-up D4 — CSV parser unit tests.
 *
 * Locks the CSV parser's contract:
 *   - First row is the header; subsequent rows become `table_row`
 *     units (D-NKU-2).
 *   - contentJson preserves the structured shape (header → cell map).
 *   - Auto-detected delimiter (comma / semicolon / tab) on the first
 *     non-empty line.
 *   - Quoted fields with embedded commas, newlines, and escaped
 *     quote-quotes parse correctly.
 *   - Empty / whitespace-only input produces zero parts (no crash).
 */

import { describe, it, expect } from "vitest";
import { csvParser } from "../../server/agent-studio/services/ingestion/parsers/csv-parser";
import type { RawArtifact } from "../../server/agent-studio/services/ingestion/types";

function rawArtifact(content: string, contentType = "text/csv"): RawArtifact {
  const bytes = Buffer.from(content, "utf-8");
  return {
    bytes,
    contentType,
    sourceUri: "memory://test.csv",
    contentHash: "0".repeat(64),
  };
}

describe("csvParser — happy path", () => {
  it("emits one table_row part per data row, header used as keys", async () => {
    const r = await csvParser.parse(rawArtifact("name,age\nAlice,30\nBob,25\n"));
    expect(r.parserKey).toBe("csv");
    expect(r.parts).toHaveLength(2);
    expect(r.parts[0].unitTypeHint).toBe("table_row");
    expect(r.parts[0].json).toEqual({ name: "Alice", age: "30" });
    expect(r.parts[1].json).toEqual({ name: "Bob", age: "25" });
  });

  it("text projection is `key: value` lines (D-NKU-3)", async () => {
    const r = await csvParser.parse(rawArtifact("name,age\nAlice,30\n"));
    expect(r.parts[0].text).toBe("name: Alice\nage: 30");
  });

  it("falls back to col1/col2 when header has empty cells", async () => {
    const r = await csvParser.parse(rawArtifact(",b\nx,y\n"));
    expect(r.parts[0].json).toEqual({ col1: "x", b: "y" });
  });
});

describe("csvParser — delimiter detection", () => {
  it("auto-detects semicolons", async () => {
    const r = await csvParser.parse(rawArtifact("name;age\nAlice;30\n"));
    expect(r.parts[0].json).toEqual({ name: "Alice", age: "30" });
  });

  it("auto-detects tabs", async () => {
    const r = await csvParser.parse(rawArtifact("name\tage\nAlice\t30\n"));
    expect(r.parts[0].json).toEqual({ name: "Alice", age: "30" });
  });

  it("prefers the delimiter with the most occurrences in the header", async () => {
    // Body has tabs but header is comma-delimited — comma should win.
    const r = await csvParser.parse(
      rawArtifact("a,b,c\n1\t2\t3,4\t5,6\n"),
    );
    expect(Object.keys(r.parts[0].json ?? {})).toEqual(["a", "b", "c"]);
  });
});

describe("csvParser — quoting + edge cases", () => {
  it("preserves commas inside quoted fields", async () => {
    const r = await csvParser.parse(
      rawArtifact('name,bio\nAlice,"engineer, dancer"\n'),
    );
    expect(r.parts[0].json).toEqual({ name: "Alice", bio: "engineer, dancer" });
  });

  it("handles escaped quote-quote inside a quoted field", async () => {
    const r = await csvParser.parse(
      rawArtifact('q,a\n"What \\"is\\" CSV?","escape with double-quote"\n'.replace(/\\"/g, '""')),
    );
    expect(r.parts[0].json?.q).toContain('"is"');
  });

  it("preserves embedded newlines inside quoted fields", async () => {
    const csv = 'name,note\nAlice,"line1\nline2"\n';
    const r = await csvParser.parse(rawArtifact(csv));
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].json?.note).toBe("line1\nline2");
  });

  it("handles CRLF line endings", async () => {
    const r = await csvParser.parse(rawArtifact("name,age\r\nAlice,30\r\n"));
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].json).toEqual({ name: "Alice", age: "30" });
  });

  it("skips blank lines between rows", async () => {
    const r = await csvParser.parse(rawArtifact("name,age\nAlice,30\n\nBob,25\n"));
    expect(r.parts).toHaveLength(2);
  });

  it("empty input produces zero parts (no crash)", async () => {
    const r = await csvParser.parse(rawArtifact(""));
    expect(r.parts).toEqual([]);
  });

  it("whitespace-only input produces zero parts", async () => {
    const r = await csvParser.parse(rawArtifact("   \n\n  \n"));
    expect(r.parts).toEqual([]);
  });

  it("header-only file produces zero data rows", async () => {
    const r = await csvParser.parse(rawArtifact("name,age\n"));
    expect(r.parts).toEqual([]);
  });

  it("handles a missing trailing newline", async () => {
    const r = await csvParser.parse(rawArtifact("a,b\n1,2"));
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].json).toEqual({ a: "1", b: "2" });
  });
});

describe("csvParser — supported content types", () => {
  it("accepts text/csv, application/csv, text/tab-separated-values", () => {
    expect(csvParser.acceptsContentTypes).toEqual(
      expect.arrayContaining([
        "text/csv",
        "application/csv",
        "text/tab-separated-values",
      ]),
    );
  });
});
