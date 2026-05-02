/**
 * Canonical Document Model adapter.
 *
 * Wraps a worker-produced document into the public
 * `CanonicalDocumentModel` shape. The worker is the parser of record;
 * this layer enforces the contract.
 */

import type { CanonicalDocumentModel } from "../../dataAcquisition.contracts";

export function buildCanonicalDocument(opts: {
  itemId: number;
  metadata: Record<string, unknown>;
  workerOutput: Record<string, unknown>;
}): CanonicalDocumentModel {
  const sections = Array.isArray(opts.workerOutput.sections)
    ? (opts.workerOutput.sections as any[]).map((s) => ({
        title: s?.title as string | undefined,
        content: Array.isArray(s?.content) ? s.content : [],
        tables: Array.isArray(s?.tables) ? s.tables : [],
        figures: Array.isArray(s?.figures) ? s.figures : [],
      }))
    : [];

  return {
    document: {
      id: String(opts.itemId),
      metadata: opts.metadata,
      sections,
    },
    graph:
      opts.workerOutput.graph &&
      typeof opts.workerOutput.graph === "object"
        ? (opts.workerOutput.graph as { nodes: unknown[]; edges: unknown[] })
        : undefined,
  };
}
