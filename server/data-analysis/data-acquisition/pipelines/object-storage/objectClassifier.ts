/**
 * Object storage pipeline — content classifier.
 *
 * Decides which downstream pipeline an object belongs to based on its
 * key extension and content type. Returns a stable classification
 * verdict for the universal classifier to record.
 */

export interface ObjectClassification {
  pipeline: "document" | "media" | "object_storage";
  recommendedProcessor: string;
  complexity: "simple" | "structured" | "complex" | "scan";
  requiresOcr: boolean;
}

export function classifyObject(input: {
  key: string;
  contentType?: string;
}): ObjectClassification {
  const key = input.key.toLowerCase();
  const ct = (input.contentType ?? "").toLowerCase();
  if (/\.(mp3|wav|flac|m4a)$/.test(key) || ct.startsWith("audio/")) {
    return {
      pipeline: "media",
      recommendedProcessor: "media_metadata",
      complexity: "simple",
      requiresOcr: false,
    };
  }
  if (/\.(mp4|mov|webm|mkv)$/.test(key) || ct.startsWith("video/")) {
    return {
      pipeline: "media",
      recommendedProcessor: "media_metadata",
      complexity: "structured",
      requiresOcr: false,
    };
  }
  if (/\.(jpg|jpeg|png|gif|webp)$/.test(key) || ct.startsWith("image/")) {
    return {
      pipeline: "media",
      recommendedProcessor: "media_metadata",
      complexity: "simple",
      requiresOcr: false,
    };
  }
  if (/\.(tiff|tif)$/.test(key)) {
    return {
      pipeline: "document",
      recommendedProcessor: "tesseract",
      complexity: "scan",
      requiresOcr: true,
    };
  }
  if (/\.(pdf)$/.test(key)) {
    return {
      pipeline: "document",
      recommendedProcessor: "docling",
      complexity: "structured",
      requiresOcr: false,
    };
  }
  if (/\.(md|txt|csv|json|yaml|yml)$/.test(key)) {
    return {
      pipeline: "document",
      recommendedProcessor: "markitdown",
      complexity: "simple",
      requiresOcr: false,
    };
  }
  return {
    pipeline: "object_storage",
    recommendedProcessor: "fallback_chain",
    complexity: "complex",
    requiresOcr: false,
  };
}
