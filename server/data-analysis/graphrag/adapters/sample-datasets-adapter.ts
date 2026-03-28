/**
 * GraphRAG Sample Datasets Adapter (Dev/Test only)
 *
 * Provides two local file-based source adapters for testing:
 *   1. sample-books:christmas-carol
 *   2. sample-books:alice-wonderland
 *
 * Reads from checked-in text files under sample-datasets/.
 * These adapters are only registered when NODE_ENV !== "production".
 *
 * Boundary rules:
 * - Module slug: "sample-books" (isolated from real module data)
 * - Reads only from local filesystem sample files
 * - No database dependency for content — content is static text
 */

import * as fs from "fs";
import * as path from "path";
import type { GraphRagSourceAdapter, GraphRagDocument } from "../types";

const SAMPLE_ROOT = path.resolve(
  process.cwd(),
  "sample-datasets"
);

function makeSampleAdapter(
  datasetKey: string,
  displayName: string,
  description: string,
  subdir: string
): GraphRagSourceAdapter {
  return {
    moduleSlug: "sample-books",
    datasetKey,
    displayName,
    description,

    async exportDocuments(args) {
      const inputDir = path.join(SAMPLE_ROOT, subdir, "input");

      if (!fs.existsSync(inputDir)) {
        console.warn(
          `[GraphRAG:SampleAdapter] Input dir not found: ${inputDir}`
        );
        return [];
      }

      const files = fs
        .readdirSync(inputDir)
        .filter((f) => f.endsWith(".txt"));

      const docs: GraphRagDocument[] = [];

      for (const file of files) {
        const filePath = path.join(inputDir, file);
        const text = fs.readFileSync(filePath, "utf-8");
        const baseName = path.basename(file, ".txt");

        docs.push({
          id: `${datasetKey}:${baseName}`,
          text,
          title: `${displayName} — ${baseName}`,
          creation_date: new Date().toISOString(),
          metadata: {
            source: "sample-datasets",
            datasetKey,
            filename: file,
          },
        });
      }

      return docs;
    },
  };
}

export const christmasCarolAdapter = makeSampleAdapter(
  "christmas-carol",
  "A Christmas Carol",
  "Sample dataset: Dickens classic novella (public domain). For dev/test use.",
  "christmas-carol"
);

export const aliceWonderlandAdapter = makeSampleAdapter(
  "alice-wonderland",
  "Alice in Wonderland",
  "Sample dataset: Carroll fantasy novel (public domain). For dev/test use.",
  "alice-wonderland"
);

/** All sample adapters for batch registration */
export const sampleDatasetAdapters: GraphRagSourceAdapter[] = [
  christmasCarolAdapter,
  aliceWonderlandAdapter,
];
