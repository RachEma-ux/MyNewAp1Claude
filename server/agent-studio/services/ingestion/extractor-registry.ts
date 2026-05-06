/**
 * Extractor registry — D-UI-1 layer #4.
 *
 * Optional layer; runs AFTER normalization. The MVP ships zero default
 * extractors — the structure is in place for future per-language code
 * extraction, table-row expansion, URL extraction, etc. Each extractor
 * produces zero or more `ExtractionOutput`s that the
 * `UniversalIngestionService` persists into `agsExtractionResults`.
 */

import type { Extractor } from "./types";

const extractors = new Map<string, Extractor>();

export function registerExtractor(extractor: Extractor): void {
  extractors.set(extractor.key, extractor);
}

export function clearExtractors(): void {
  extractors.clear();
}

export function getExtractor(key: string): Extractor | undefined {
  return extractors.get(key);
}

export function listExtractors(): ReadonlyArray<Extractor> {
  return [...extractors.values()];
}
