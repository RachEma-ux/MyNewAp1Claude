/**
 * Document validation.
 *
 * Issues a quality verdict on a worker output. The worker provides
 * raw extraction; this layer attaches a confidence + issues array
 * + `requiresReview` flag.
 */

import { DATA_ACQUISITION_VALIDATION_VERSION } from "../../dataAcquisition.constants";

export interface DocumentQualityVerdict {
  confidenceScore: number;
  requiresReview: boolean;
  issues: Array<{
    code: string;
    severity: "low" | "medium" | "high";
    message: string;
  }>;
  validationVersion: string;
}

export function validateDocumentOutput(workerOutput: {
  sections?: unknown[];
  ocrConfidence?: number;
  errors?: string[];
}): DocumentQualityVerdict {
  const issues: DocumentQualityVerdict["issues"] = [];
  let confidence = 80;

  if (!workerOutput.sections || workerOutput.sections.length === 0) {
    issues.push({
      code: "NO_SECTIONS",
      severity: "high",
      message: "Document parser returned no sections.",
    });
    confidence -= 50;
  }
  if (typeof workerOutput.ocrConfidence === "number") {
    if (workerOutput.ocrConfidence < 0.6) {
      issues.push({
        code: "LOW_OCR_CONFIDENCE",
        severity: "medium",
        message: "OCR confidence below 0.6.",
      });
      confidence -= 20;
    }
  }
  for (const err of workerOutput.errors ?? []) {
    issues.push({
      code: "PARSER_ERROR",
      severity: "medium",
      message: err,
    });
    confidence -= 10;
  }

  confidence = Math.max(0, Math.min(100, confidence));
  const requiresReview =
    confidence < 60 || issues.some((i) => i.severity === "high");

  return {
    confidenceScore: confidence,
    requiresReview,
    issues,
    validationVersion: DATA_ACQUISITION_VALIDATION_VERSION,
  };
}
