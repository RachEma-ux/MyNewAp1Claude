/**
 * Sample Datasets Adapter — Unit Tests
 *
 * Validates:
 * - Both adapters have correct moduleSlug / datasetKey
 * - exportDocuments returns non-empty results from local files
 * - Adapter metadata matches expected shape
 * - No production leakage (env gating tested at service level)
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  christmasCarolAdapter,
  aliceWonderlandAdapter,
  sampleDatasetAdapters,
} from "./sample-datasets-adapter";

// ── Adapter identity ────────────────────────────────────────────────────

describe("Sample dataset adapters — identity", () => {
  it("exports exactly 2 adapters", () => {
    expect(sampleDatasetAdapters).toHaveLength(2);
  });

  it("christmas-carol adapter has correct identity", () => {
    expect(christmasCarolAdapter.moduleSlug).toBe("sample-books");
    expect(christmasCarolAdapter.datasetKey).toBe("christmas-carol");
    expect(christmasCarolAdapter.displayName).toBe("A Christmas Carol");
    expect(christmasCarolAdapter.description).toContain("Dickens");
  });

  it("alice-wonderland adapter has correct identity", () => {
    expect(aliceWonderlandAdapter.moduleSlug).toBe("sample-books");
    expect(aliceWonderlandAdapter.datasetKey).toBe("alice-wonderland");
    expect(aliceWonderlandAdapter.displayName).toBe("Alice in Wonderland");
    expect(aliceWonderlandAdapter.description).toContain("Carroll");
  });

  it("both adapters use same moduleSlug for module isolation", () => {
    expect(christmasCarolAdapter.moduleSlug).toBe(aliceWonderlandAdapter.moduleSlug);
  });

  it("both adapters have different datasetKeys", () => {
    expect(christmasCarolAdapter.datasetKey).not.toBe(aliceWonderlandAdapter.datasetKey);
  });
});

// ── exportDocuments ─────────────────────────────────────────────────────

describe("Sample dataset adapters — exportDocuments", () => {
  it("christmas-carol exports at least 1 document from local file", async () => {
    const docs = await christmasCarolAdapter.exportDocuments({});
    expect(docs.length).toBeGreaterThanOrEqual(1);

    const doc = docs[0];
    expect(doc.id).toContain("christmas-carol");
    expect(doc.text.length).toBeGreaterThan(10);
    expect(doc.title).toContain("A Christmas Carol");
    expect(doc.metadata).toHaveProperty("source", "sample-datasets");
    expect(doc.metadata).toHaveProperty("datasetKey", "christmas-carol");
  });

  it("alice-wonderland exports at least 1 document from local file", async () => {
    const docs = await aliceWonderlandAdapter.exportDocuments({});
    expect(docs.length).toBeGreaterThanOrEqual(1);

    const doc = docs[0];
    expect(doc.id).toContain("alice-wonderland");
    expect(doc.text.length).toBeGreaterThan(10);
    expect(doc.title).toContain("Alice in Wonderland");
    expect(doc.metadata).toHaveProperty("source", "sample-datasets");
    expect(doc.metadata).toHaveProperty("datasetKey", "alice-wonderland");
  });

  it("documents have valid creation_date ISO strings", async () => {
    const carolDocs = await christmasCarolAdapter.exportDocuments({});
    const aliceDocs = await aliceWonderlandAdapter.exportDocuments({});

    for (const doc of [...carolDocs, ...aliceDocs]) {
      expect(() => new Date(doc.creation_date)).not.toThrow();
      expect(new Date(doc.creation_date).getTime()).not.toBeNaN();
    }
  });
});
