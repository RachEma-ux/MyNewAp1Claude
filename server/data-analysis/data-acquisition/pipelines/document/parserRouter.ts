/**
 * Parser router — picks parser + fallback chain based on classifier output.
 *
 * Routing rules (deterministic):
 *   simple          → markitdown,            chain: [docling, unstructured]
 *   structured      → docling,               chain: [unstructured, llamaparse]
 *   scan / OCR      → tesseract,             chain: [paddleocr, llamaparse]
 *   complex / unknown → fallback_chain,      chain: [llamaparse, unstructured, docling]
 */

import type {
  ClassificationOutput,
  RoutingDecision,
} from "../../dataAcquisition.types";

export function routeParser(
  classification: ClassificationOutput,
): RoutingDecision {
  const c = classification.complexity;

  if (c === "simple") {
    return {
      selectedPipeline: "document",
      selectedProcessor: "markitdown",
      fallbackChain: ["docling", "unstructured"],
      strategy: "default",
      decision: { rule: "complexity=simple" },
    };
  }
  if (c === "structured") {
    return {
      selectedPipeline: "document",
      selectedProcessor: "docling",
      fallbackChain: ["unstructured", "llamaparse"],
      strategy: "default",
      decision: { rule: "complexity=structured" },
    };
  }
  if (c === "scan" || classification.requiresOcr) {
    return {
      selectedPipeline: "document",
      selectedProcessor: "tesseract",
      fallbackChain: ["paddleocr", "llamaparse"],
      strategy: "default",
      decision: { rule: "scan/ocr" },
    };
  }
  return {
    selectedPipeline: "document",
    selectedProcessor: "fallback_chain",
    fallbackChain: ["llamaparse", "unstructured", "docling"],
    strategy: "fallback",
    decision: { rule: "unknown/complex" },
  };
}
