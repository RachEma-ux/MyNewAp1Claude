/**
 * Data Analysis — Handoff Catalog
 *
 * Data Analysis does not currently accept inbound handoffs from other
 * modules — its surface is consumed via the Module Gateway and tRPC.
 * Reserved for future cross-module workflows (e.g. PS handing a
 * curated dataset to Data Analysis for indexing). Coordinator should
 * orchestrate any such cross-module flow; ordinary GraphRAG indexing
 * and query MUST NOT go through Coordinator.
 */

export const DATA_ANALYSIS_HANDOFFS = {
  // (none for now — populate when cross-module workflows are added)
} as const;

export type DataAnalysisHandoffType =
  (typeof DATA_ANALYSIS_HANDOFFS)[keyof typeof DATA_ANALYSIS_HANDOFFS];
