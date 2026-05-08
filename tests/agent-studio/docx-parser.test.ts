/**
 * R5 — DOCX parser unit tests.
 *
 * Pure-function tests of `createDocxParser({mammothImpl})` per the
 * factory pattern locked in D-PARSE-OCR-1..4 / D-PARSE-AUDIO-1..4.
 * No real `.docx` fixture is needed — tests inject a fake mammoth
 * that returns synthetic HTML / raw-text payloads, exercising the
 * parser's section-walk + fallback + warning-forwarding logic.
 */

import { describe, it, expect } from "vitest";
import {
  createDocxParser,
  type MammothImpl,
  type MammothResult,
} from "../../server/agent-studio/services/ingestion/parsers/docx-parser";
import type { RawArtifact } from "../../server/agent-studio/services/ingestion/types";

function fakeMammoth(html: string, text: string, messages: MammothResult["messages"] = []): MammothImpl {
  const result: MammothResult = { value: html, messages };
  const textResult: MammothResult = { value: text, messages };
  return {
    convertToHtml: async () => result,
    extractRawText: async () => textResult,
  };
}

function artifact(): RawArtifact {
  return {
    bytes: Buffer.from("fake-docx-bytes"),
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sourceUri: "test://docx",
    contentHash: "deadbeef",
  };
}

describe("docxParser — heading-rich documents", () => {
  it("emits one markdown_section unit per heading", async () => {
    const html = `<html><body>
      <h1>Project Overview</h1>
      <p>First paragraph.</p>
      <p>Second paragraph.</p>
      <h2>Goals</h2>
      <p>Goal description.</p>
      <h2>Open Questions</h2>
      <p>Question paragraph.</p>
    </body></html>`;
    const text =
      "Project Overview\n\nFirst paragraph.\n\nSecond paragraph.\n\n" +
      "Goals\n\nGoal description.\n\n" +
      "Open Questions\n\nQuestion paragraph.";
    const parser = createDocxParser({ mammothImpl: fakeMammoth(html, text) });
    const result = await parser.parse(artifact());
    expect(result.parts).toHaveLength(3);
    expect(result.parts[0].unitTypeHint).toBe("markdown_section");
    expect(result.parts[0].partId).toBe("docx-section-1");
    expect(result.parts[0].text).toContain("Project Overview");
    expect(result.parts[0].text).toContain("First paragraph.");
    expect(result.parts[1].partId).toBe("docx-section-2");
    expect(result.parts[2].partId).toBe("docx-section-3");
    expect(result.parts[2].text).toContain("Open Questions");
  });

  it("captures heading + level + body in json metadata", async () => {
    const html = `<body><h2>Goals</h2><p>Goal body.</p></body>`;
    const parser = createDocxParser({
      mammothImpl: fakeMammoth(html, "Goals\n\nGoal body."),
    });
    const result = await parser.parse(artifact());
    expect(result.parts[0].json).toEqual({
      heading: "Goals",
      level: 2,
      body: "Goal body.",
    });
  });

  it("derives a slug-based selector for citation", async () => {
    const html = `<body><h1>Section A — Notes!</h1><p>x</p></body>`;
    const parser = createDocxParser({
      mammothImpl: fakeMammoth(html, "Section A — Notes!\n\nx"),
    });
    const result = await parser.parse(artifact());
    expect(result.parts[0].location?.selector).toBe("#section-a-notes");
  });
});

describe("docxParser — pre-heading preamble", () => {
  it("captures pre-heading paragraphs as a level-0 preamble section", async () => {
    const html = `<body>
      <p>Document subtitle.</p>
      <p>Author note.</p>
      <h1>Section A</h1>
      <p>Body of A.</p>
    </body>`;
    const text =
      "Document subtitle.\n\nAuthor note.\n\nSection A\n\nBody of A.";
    const parser = createDocxParser({ mammothImpl: fakeMammoth(html, text) });
    const result = await parser.parse(artifact());
    expect(result.parts).toHaveLength(2);
    expect(result.parts[0].json).toMatchObject({
      heading: null,
      level: 0,
    });
    expect(result.parts[0].text).toContain("Document subtitle.");
    expect(result.parts[1].json).toMatchObject({
      heading: "Section A",
      level: 1,
    });
  });
});

describe("docxParser — no-heading fallback", () => {
  it("emits a single text unit when document has no headings", async () => {
    const html = `<body><p>Status update.</p><p>Action items.</p></body>`;
    const text = "Status update.\n\nAction items.";
    const parser = createDocxParser({ mammothImpl: fakeMammoth(html, text) });
    const result = await parser.parse(artifact());
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].unitTypeHint).toBe("text");
    expect(result.parts[0].partId).toBe("docx-text");
    expect(result.parts[0].text).toBe(text);
  });
});

describe("docxParser — empty + warnings + errors", () => {
  it("returns parts: [] when document is truly empty", async () => {
    const parser = createDocxParser({ mammothImpl: fakeMammoth("", "") });
    const result = await parser.parse(artifact());
    expect(result.parts).toEqual([]);
    expect(result.fullText).toBe("");
  });

  it("forwards mammoth warnings into ParsedDocument.metadata", async () => {
    const parser = createDocxParser({
      mammothImpl: fakeMammoth(
        "<body><p>x</p></body>",
        "x",
        [
          { type: "warning", message: "Unrecognized style: Custom" },
          { type: "warning", message: "Embedded image dropped" },
        ],
      ),
    });
    const result = await parser.parse(artifact());
    expect(result.metadata?.mammothWarnings).toEqual([
      "Unrecognized style: Custom",
      "Embedded image dropped",
    ]);
  });

  it("de-duplicates warnings emitted by both convertToHtml and extractRawText", async () => {
    const parser = createDocxParser({
      mammothImpl: {
        convertToHtml: async () => ({
          value: "<body><p>x</p></body>",
          messages: [{ type: "warning", message: "Unrecognized style: Custom" }],
        }),
        extractRawText: async () => ({
          value: "x",
          messages: [{ type: "warning", message: "Unrecognized style: Custom" }],
        }),
      },
    });
    const result = await parser.parse(artifact());
    expect(result.metadata?.mammothWarnings).toEqual([
      "Unrecognized style: Custom",
    ]);
  });

  it("propagates mammoth errors as regular Error (parser failure path)", async () => {
    const parser = createDocxParser({
      mammothImpl: {
        convertToHtml: async () => {
          throw new Error("Could not find file in options");
        },
        extractRawText: async () => ({ value: "", messages: [] }),
      },
    });
    await expect(parser.parse(artifact())).rejects.toThrow(/Could not find file/);
  });
});

describe("docxParser — content-type registration", () => {
  it("accepts the modern .docx mime type and the .docm macro-enabled variant", () => {
    const parser = createDocxParser();
    expect(parser.acceptsContentTypes).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(parser.acceptsContentTypes).toContain(
      "application/vnd.ms-word.document.macroenabled.12",
    );
  });

  it("does NOT accept the legacy .doc binary format (mammoth only handles OOXML)", () => {
    const parser = createDocxParser();
    expect(parser.acceptsContentTypes).not.toContain("application/msword");
  });
});
