/**
 * RAG — Provided ports.
 */
import type { RagSearchRequest, RagSearchResult, RagStats } from "./contracts";

export interface RagSearchPort {
  search(req: RagSearchRequest): Promise<RagSearchResult[]>;
}

export interface RagStatsPort {
  stats(): Promise<RagStats>;
}
