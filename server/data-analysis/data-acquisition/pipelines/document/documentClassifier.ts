/**
 * Document classifier.
 *
 * Heuristic classifier — decides whether a given item is a document
 * and, if so, picks `simple` / `structured` / `complex` / `scan`
 * complexity using mime type + filename hints. The full classifier
 * is the worker's job; this is the local fast-path.
 */

import { DATA_ACQUISITION_CLASSIFIER_VERSION } from "../../dataAcquisition.constants";
import type {
  ClassificationInput,
  ClassificationOutput,
} from "../../dataAcquisition.types";

const SCAN_HINTS = ["scan", "scanned", "ocr"];
const STRUCTURED_HINTS = [".pdf", ".docx", ".xlsx", ".pptx"];
const SIMPLE_HINTS = [".txt", ".md", ".csv", ".json", ".html", ".htm"];
const IMAGE_MIMES = ["image/png", "image/jpeg", "image/tiff", "image/jpg"];

export function classifyDocument(
  input: ClassificationInput,
): ClassificationOutput {
  const meta = input.metadata ?? {};
  const name = String(meta.name ?? "").toLowerCase();
  const ext = String(meta.ext ?? "").toLowerCase();
  const mime = String(meta.mimeType ?? "").toLowerCase();

  const looksLikeScan =
    SCAN_HINTS.some((h) => name.includes(h)) || IMAGE_MIMES.includes(mime);
  const looksStructured =
    STRUCTURED_HINTS.some((h) => name.endsWith(h)) ||
    STRUCTURED_HINTS.some((h) => ext === h);
  const looksSimple =
    SIMPLE_HINTS.some((h) => name.endsWith(h)) ||
    SIMPLE_HINTS.some((h) => ext === h);

  let complexity: ClassificationOutput["complexity"] = "simple";
  let recommendedProcessor = "markitdown";
  let confidence = 70;

  if (looksLikeScan) {
    complexity = "scan";
    recommendedProcessor = "tesseract";
    confidence = 65;
  } else if (looksStructured) {
    complexity = "structured";
    recommendedProcessor = "docling";
    confidence = 80;
  } else if (looksSimple) {
    complexity = "simple";
    recommendedProcessor = "markitdown";
    confidence = 85;
  } else {
    complexity = "complex";
    recommendedProcessor = "fallback_chain";
    confidence = 50;
  }

  return {
    dataType: "document",
    mode: "document",
    complexity,
    requiresOcr: complexity === "scan",
    hasTables: complexity === "structured",
    recommendedProcessor,
    confidence,
    result: {
      classifierVersion: DATA_ACQUISITION_CLASSIFIER_VERSION,
      hints: { name, ext, mime, looksLikeScan, looksStructured, looksSimple },
    },
  };
}
