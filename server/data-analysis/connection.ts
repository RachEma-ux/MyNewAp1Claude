/**
 * Data Analysis — DB Connection Foundation
 *
 * Phase-1 staged ownership:
 * - Data Analysis is the canonical owner of the GraphRAG subdomain
 *   (`graphrag_sources`, `graphrag_sync_runs`, `graphrag_index_runs`,
 *   `graphrag_query_runs`, `graphrag_artifact_registry`).
 * - The physical tables currently live in the shared platform DB
 *   (`mynewap1claude.public.graphrag_*`). The Data Analysis manifest
 *   declares `database.kind: "shared"` and lists those as `ownedTables`.
 * - This file provides the `getDataAnalysisDb()` accessor so all Data
 *   Analysis code can be migrated to use one canonical handle now;
 *   when the physical move to a dedicated `dataanalysisdb` happens
 *   (follow-up: "Data Analysis RTLM hardening: GraphRAG subdomain
 *   ownership, DB ownership, worker contract, and Digital HQ/AWI
 *   visibility"), this is the single seam to switch.
 *
 * Forward env: `DATABASE_URL_DATA_ANALYSISDB`. Until that env is set
 * AND a dedicated DB is provisioned, we delegate to the platform
 * `getDb()` so behavior is unchanged.
 */

import { getDb } from "../db/connection";

const FORWARD_ENV = "DATABASE_URL_DATA_ANALYSISDB";

let _warned = false;

/**
 * Canonical Data Analysis DB handle.
 *
 * Today: returns the shared platform DB (`getDb()`). The Data Analysis
 * manifest declares `kind: "shared"` to reflect this.
 *
 * Tomorrow (Phase 2 follow-up): when `DATABASE_URL_DATA_ANALYSISDB` is
 * provisioned and `drizzle/tables/dataanalysisdb.ts` is split out, this
 * function will lazy-build a dedicated drizzle instance.
 */
export function getDataAnalysisDb() {
  if (process.env[FORWARD_ENV] && !_warned) {
    _warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[DataAnalysisDB] ${FORWARD_ENV} is set but the dedicated DB is not yet provisioned; ` +
        `delegating to the shared platform DB. Track the physical migration under ` +
        `"Data Analysis RTLM hardening: GraphRAG subdomain ownership, DB ownership, worker contract, and Digital HQ/AWI visibility".`,
    );
  }
  return getDb();
}

/**
 * Reports whether the Data Analysis DB is currently sharing the
 * platform DB (Phase 1) or running on its own (Phase 2). Drives
 * AWI/Digital HQ visibility.
 */
export function getDataAnalysisDbMode():
  | "shared-platform-db"
  | "dedicated-dataanalysisdb" {
  return "shared-platform-db";
}
