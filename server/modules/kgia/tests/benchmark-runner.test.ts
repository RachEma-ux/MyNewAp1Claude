/**
 * KGIA — Benchmark Runner Tests
 *
 * Tests the scoring logic (no DB dependency).
 */

import { describe, it, expect } from "vitest";

// Extract the scoring function logic for testing
function scoreSimilarity(expected: string, actual: string): number {
  const expectedWords = new Set(expected.toLowerCase().split(/\s+/).filter(Boolean));
  const actualWords = new Set(actual.toLowerCase().split(/\s+/).filter(Boolean));

  if (expectedWords.size === 0 && actualWords.size === 0) return 1;
  if (expectedWords.size === 0 || actualWords.size === 0) return 0;

  let intersection = 0;
  for (const word of expectedWords) {
    if (actualWords.has(word)) intersection++;
  }

  const union = new Set([...expectedWords, ...actualWords]).size;
  return intersection / union;
}

describe("scoreSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(scoreSimilarity("John Smith", "John Smith")).toBe(1);
  });

  it("returns 1 for both empty strings", () => {
    expect(scoreSimilarity("", "")).toBe(1);
  });

  it("returns 0 when expected is empty but actual is not", () => {
    expect(scoreSimilarity("", "some answer")).toBe(0);
  });

  it("returns 0 when actual is empty but expected is not", () => {
    expect(scoreSimilarity("expected answer", "")).toBe(0);
  });

  it("returns 0 for completely different words", () => {
    expect(scoreSimilarity("apple banana", "orange grape")).toBe(0);
  });

  it("returns partial score for overlapping words", () => {
    const score = scoreSimilarity("John Smith CEO", "John Smith is the CEO of Acme");
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(1);
  });

  it("is case-insensitive", () => {
    expect(scoreSimilarity("JOHN SMITH", "john smith")).toBe(1);
  });

  it("handles single-word match", () => {
    const score = scoreSimilarity("Paris", "The city is Paris, France");
    expect(score).toBeGreaterThan(0);
  });

  it("scores higher for more overlap", () => {
    const low = scoreSimilarity("CEO of Acme Corp", "banana apple orange");
    const high = scoreSimilarity("CEO of Acme Corp", "The CEO of Acme Corp is John");
    expect(high).toBeGreaterThan(low);
  });
});
