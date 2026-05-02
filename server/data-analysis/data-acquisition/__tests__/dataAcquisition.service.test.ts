/**
 * Data Acquisition — service-layer logic tests.
 *
 * These exercise classifier + router pure logic and connector
 * registry behavior — no DB required.
 */

import { describe, expect, it } from "vitest";

import { classifyDocument } from "../pipelines/document/documentClassifier";
import { routeParser } from "../pipelines/document/parserRouter";
import { validateDocumentOutput } from "../pipelines/document/documentValidation";
import { buildCanonicalDocument } from "../pipelines/document/canonicalDocumentModel";
import {
  getConnector,
  listConnectorKeys,
  listConnectors,
} from "../connectors/connector.registry";

describe("documentClassifier", () => {
  it("classifies a markdown file as simple → markitdown", () => {
    const result = classifyDocument({
      itemId: 1,
      itemType: "document",
      metadata: { name: "notes.md", ext: ".md" },
    });
    expect(result.complexity).toBe("simple");
    expect(result.recommendedProcessor).toBe("markitdown");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("classifies a PDF as structured → docling", () => {
    const result = classifyDocument({
      itemId: 2,
      itemType: "document",
      metadata: { name: "spec.pdf", ext: ".pdf" },
    });
    expect(result.complexity).toBe("structured");
    expect(result.recommendedProcessor).toBe("docling");
  });

  it("flags TIFF as scan/OCR → tesseract", () => {
    const result = classifyDocument({
      itemId: 3,
      itemType: "document",
      metadata: { name: "page.tiff", ext: ".tiff", mimeType: "image/tiff" },
    });
    expect(result.complexity).toBe("scan");
    expect(result.requiresOcr).toBe(true);
    expect(result.recommendedProcessor).toBe("tesseract");
  });

  it("falls back to fallback_chain for unknown extensions", () => {
    const result = classifyDocument({
      itemId: 4,
      itemType: "document",
      metadata: { name: "data.bin", ext: ".bin" },
    });
    expect(result.complexity).toBe("complex");
    expect(result.recommendedProcessor).toBe("fallback_chain");
  });
});

describe("parserRouter", () => {
  it("routes simple → markitdown with docling/unstructured fallback chain", () => {
    const decision = routeParser({
      dataType: "document",
      mode: "document",
      complexity: "simple",
      confidence: 80,
    });
    expect(decision.selectedProcessor).toBe("markitdown");
    expect(decision.fallbackChain).toEqual(["docling", "unstructured"]);
    expect(decision.strategy).toBe("default");
  });

  it("routes structured → docling with unstructured/llamaparse fallback", () => {
    const decision = routeParser({
      dataType: "document",
      mode: "document",
      complexity: "structured",
      confidence: 80,
    });
    expect(decision.selectedProcessor).toBe("docling");
    expect(decision.fallbackChain).toEqual(["unstructured", "llamaparse"]);
  });

  it("routes scan/OCR → tesseract with paddleocr/llamaparse fallback", () => {
    const decision = routeParser({
      dataType: "document",
      mode: "document",
      complexity: "scan",
      requiresOcr: true,
      confidence: 60,
    });
    expect(decision.selectedProcessor).toBe("tesseract");
    expect(decision.fallbackChain).toEqual(["paddleocr", "llamaparse"]);
  });

  it("routes unknown → fallback_chain", () => {
    const decision = routeParser({
      dataType: "document",
      mode: "document",
      complexity: "complex",
      confidence: 30,
    });
    expect(decision.selectedProcessor).toBe("fallback_chain");
    expect(decision.strategy).toBe("fallback");
    expect(decision.fallbackChain.length).toBeGreaterThan(0);
  });
});

describe("documentValidation", () => {
  it("flags zero-section output as high severity NO_SECTIONS", () => {
    const verdict = validateDocumentOutput({});
    expect(verdict.confidenceScore).toBeLessThan(60);
    expect(verdict.requiresReview).toBe(true);
    expect(verdict.issues.some((i) => i.code === "NO_SECTIONS")).toBe(true);
  });

  it("passes a healthy parse with sections and no errors", () => {
    const verdict = validateDocumentOutput({
      sections: [{ title: "intro", content: ["hello"] }],
    });
    expect(verdict.confidenceScore).toBeGreaterThanOrEqual(60);
    expect(verdict.requiresReview).toBe(false);
  });

  it("logs LOW_OCR_CONFIDENCE when ocrConfidence < 0.6", () => {
    const verdict = validateDocumentOutput({
      sections: [{ title: "x", content: ["y"] }],
      ocrConfidence: 0.4,
    });
    expect(
      verdict.issues.some((i) => i.code === "LOW_OCR_CONFIDENCE"),
    ).toBe(true);
  });
});

describe("buildCanonicalDocument", () => {
  it("normalizes worker output into the canonical shape", () => {
    const canonical = buildCanonicalDocument({
      itemId: 42,
      metadata: { lang: "en" },
      workerOutput: {
        sections: [
          { title: "S1", content: ["a", "b"], tables: [], figures: [] },
        ],
      },
    });
    expect(canonical.document.id).toBe("42");
    expect(canonical.document.metadata).toEqual({ lang: "en" });
    expect(canonical.document.sections).toHaveLength(1);
    expect(canonical.document.sections[0].title).toBe("S1");
  });
});

describe("connector registry", () => {
  it("includes the three real connectors (local, manual, webhook)", () => {
    expect(getConnector("local")).toBeDefined();
    expect(getConnector("manual")).toBeDefined();
    expect(getConnector("webhook")).toBeDefined();
  });

  it("includes external-system connectors that report unconfigured cleanly", async () => {
    const s3 = getConnector("s3")!;
    const status = await s3.status();
    // S3 requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET — not
    // set in CI by default → unconfigured.
    expect(["available", "unconfigured"]).toContain(status.status);
  });

  it("local connector reports available without credentials", async () => {
    const local = getConnector("local")!;
    const status = await local.status();
    expect(status.status).toBe("available");
  });

  it("manual + webhook connectors are always available", async () => {
    const manual = await getConnector("manual")!.status();
    const webhook = await getConnector("webhook")!.status();
    expect(manual.status).toBe("available");
    expect(webhook.status).toBe("available");
  });

  it("registry exposes at least the canonical 11 connector keys", () => {
    const keys = listConnectorKeys();
    for (const k of [
      "local",
      "manual",
      "webhook",
      "s3",
      "gdrive",
      "github",
      "api",
      "database",
      "sensor",
      "stream",
      "saas",
      "web",
      "objectStorage",
    ]) {
      expect(keys).toContain(k);
    }
    expect(listConnectors().length).toBeGreaterThanOrEqual(13);
  });
});
