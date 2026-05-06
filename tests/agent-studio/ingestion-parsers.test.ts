/**
 * Universal Ingestion — parser unit tests (Retrofit P3).
 *
 * Each MVP parser is exercised against a small fixture. Tests are
 * pure (no DB) so the OOM-safe pattern doesn't apply; we run them
 * in the regular vitest config.
 */

import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  textParser,
  markdownParser,
  htmlSnapshotParser,
  jsonParser,
  basicCodeFileParser,
  selectParserForContentType,
  registerDefaultParsers,
  resetParsersToDefaults,
  UnsupportedContentTypeError,
  validateUnit,
  KnowledgeUnitContractError,
  type RawArtifact,
} from "../../server/agent-studio/services/ingestion";

function rawArtifact(content: string, contentType: string): RawArtifact {
  const bytes = Buffer.from(content, "utf-8");
  return {
    bytes,
    contentType,
    sourceUri: null,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    metadata: {},
  };
}

describe("textParser", () => {
  it("splits on blank-line paragraphs into text units", async () => {
    const input = "First paragraph.\n\nSecond paragraph spans\ntwo lines.\n\n\nThird.";
    const r = await textParser.parse(rawArtifact(input, "text/plain"));
    expect(r.parserKey).toBe("text");
    expect(r.parts.map((p) => p.text)).toEqual([
      "First paragraph.",
      "Second paragraph spans\ntwo lines.",
      "Third.",
    ]);
    for (const part of r.parts) {
      expect(part.unitTypeHint).toBe("text");
    }
  });

  it("handles empty input gracefully", async () => {
    const r = await textParser.parse(rawArtifact("", "text/plain"));
    expect(r.parts).toEqual([]);
  });
});

describe("markdownParser", () => {
  it("splits sections on headings + extracts fenced code", async () => {
    const md = `# Title

Intro paragraph.

## Section A
Body of A.

\`\`\`ts
function hello() { return 1; }
\`\`\`

## Section B
Body of B.
`;
    const r = await markdownParser.parse(rawArtifact(md, "text/markdown"));
    expect(r.parserKey).toBe("markdown");

    const sections = r.parts.filter((p) => p.unitTypeHint === "markdown_section");
    const codeBlocks = r.parts.filter((p) => p.unitTypeHint === "code_function");

    // Title + Section A intro + Section B = 3 sections (intro section
    // includes "# Title" + "Intro paragraph.").
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(codeBlocks.length).toBe(1);
    expect(codeBlocks[0].text).toContain("function hello");
    expect((codeBlocks[0].json as Record<string, unknown> | undefined)?.language).toBe(
      "ts",
    );
  });
});

describe("htmlSnapshotParser", () => {
  it("strips scripts/styles and emits one block per <article>", async () => {
    const html = `<html><body>
      <script>alert('xss')</script>
      <style>body { color: red; }</style>
      <article id="a"><p>First article.</p></article>
      <article class="b"><p>Second article.</p></article>
    </body></html>`;
    const r = await htmlSnapshotParser.parse(rawArtifact(html, "text/html"));
    expect(r.parts.length).toBe(2);
    expect(r.parts[0].text).toBe("First article.");
    expect(r.parts[1].text).toBe("Second article.");
    expect(r.parts[0].location?.selector).toBe("#a");
    expect(r.parts[1].location?.selector).toBe(".b");
    // Script + style content stripped from fullText.
    expect(r.fullText).not.toContain("alert");
    expect(r.fullText).not.toContain("color: red");
  });

  it("falls back to body text when no block elements present", async () => {
    const r = await htmlSnapshotParser.parse(
      rawArtifact("<html><body>Hello world</body></html>", "text/html"),
    );
    expect(r.parts.length).toBe(1);
    expect(r.parts[0].text).toBe("Hello world");
  });
});

describe("jsonParser", () => {
  it("expands top-level array into per-element json_object units", async () => {
    const r = await jsonParser.parse(
      rawArtifact('[1, "two", {"k": 3}]', "application/json"),
    );
    expect(r.parts.length).toBe(3);
    expect(r.parts.every((p) => p.unitTypeHint === "json_object")).toBe(true);
  });

  it("emits one unit per top-level key for objects", async () => {
    const r = await jsonParser.parse(
      rawArtifact('{"a": 1, "b": "x"}', "application/json"),
    );
    expect(r.parts.length).toBe(2);
    expect(r.parts[0].partId).toBe("json-a");
    expect(r.parts[1].partId).toBe("json-b");
  });

  it("malformed JSON throws SyntaxError (caught by dispatcher)", async () => {
    await expect(
      jsonParser.parse(rawArtifact("{not: valid}", "application/json")),
    ).rejects.toThrow();
  });
});

describe("basicCodeFileParser", () => {
  it("extracts imports + per-function units from TypeScript", async () => {
    const ts = `import { foo } from "bar";
import * as x from "y";

export function add(a: number, b: number): number {
  return a + b;
}

export class Greeter {
  greet(name: string) { return \`hi \${name}\`; }
}`;
    const r = await basicCodeFileParser.parse(
      rawArtifact(ts, "text/x-typescript"),
    );

    const imports = r.parts.find((p) => (p.json as Record<string, unknown> | undefined)?.kind === "imports");
    const fns = r.parts.filter((p) => p.unitTypeHint === "code_function");
    const cls = r.parts.filter((p) => p.unitTypeHint === "code_class");
    expect(imports).toBeDefined();
    expect(imports!.text).toContain('import { foo }');
    expect(fns.length).toBe(1);
    expect(fns[0].text).toContain("function add");
    expect(cls.length).toBe(1);
    expect(cls[0].text).toContain("class Greeter");
  });

  it("emits a single text unit when no anchors and no leading import zone", async () => {
    const r = await basicCodeFileParser.parse(
      rawArtifact("console.log('hi');\nlet x = 1;\n", "text/javascript"),
    );
    // No imports, no anchors, body-only → one whole-file unit.
    expect(r.parts.length).toBe(1);
    expect(r.parts[0].unitTypeHint).toBe("text");
  });
});

describe("parser registry", () => {
  beforeEach(() => {
    resetParsersToDefaults();
  });

  it("registers all 10 default parsers (text/markdown/html/json/pdf/code/csv/xlsx/ocr/audio)", () => {
    registerDefaultParsers();
    expect(selectParserForContentType("text/plain").key).toBe("text");
    expect(selectParserForContentType("text/markdown").key).toBe("markdown");
    expect(selectParserForContentType("text/html").key).toBe("html_snapshot");
    expect(selectParserForContentType("application/json").key).toBe("json");
    expect(selectParserForContentType("application/pdf").key).toBe("basic_pdf_text");
    expect(selectParserForContentType("text/x-typescript").key).toBe(
      "basic_code_file",
    );
    expect(selectParserForContentType("text/csv").key).toBe("csv");
    expect(
      selectParserForContentType(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ).key,
    ).toBe("xlsx");
    // OCR + audio register unconditionally (D-PARSE-OCR-3 / -AUDIO-3).
    // Engine availability is checked at parse-time, not selection-time.
    expect(selectParserForContentType("image/png").key).toBe("ocr");
    expect(selectParserForContentType("audio/mpeg").key).toBe("audio");
  });

  it("throws UnsupportedContentTypeError for unknown types", () => {
    registerDefaultParsers();
    expect(() => selectParserForContentType("video/mp4")).toThrowError(
      UnsupportedContentTypeError,
    );
  });

  it("matches content-types with parameters (e.g. text/plain; charset=utf-8)", () => {
    registerDefaultParsers();
    expect(
      selectParserForContentType("text/plain; charset=utf-8").key,
    ).toBe("text");
  });
});

describe("data validation service", () => {
  it("blocks units with empty contentText", () => {
    const r = validateUnit({
      workspaceId: 1,
      sourceId: 1,
      unitType: "text",
      contentText: "",
      permissionContext: { inheritFromSource: true },
    });
    expect(r.status).toBe("blocked");
    expect(r.findings.some((f) => f.rule === "required_fields")).toBe(true);
  });

  it("returns ok for a valid unit", () => {
    const r = validateUnit({
      workspaceId: 1,
      sourceId: 1,
      unitType: "text",
      contentText: "hello",
      permissionContext: { inheritFromSource: true },
    });
    expect(r.status).toBe("ok");
    expect(r.findings).toEqual([]);
  });
});

describe("contract errors", () => {
  it("KnowledgeUnitContractError carries a code", () => {
    const e = new KnowledgeUnitContractError(
      "missing_content_text",
      "test",
    );
    expect(e.code).toBe("missing_content_text");
    expect(e.name).toBe("KnowledgeUnitContractError");
  });
});

// vitest's `beforeEach` lives on the global describe; use the standard
// import path for this small helper.
import { beforeEach } from "vitest";
