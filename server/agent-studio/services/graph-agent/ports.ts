/**
 * Graph Agent Lite — port declarations.
 *
 * Phase 13. Mirrors KGRA Agent port pattern.
 */

import type { GraphAgentRunInput, GraphAgentAnswer } from "./contracts.js";

export interface GraphAgentRunPort {
  run(input: GraphAgentRunInput): Promise<GraphAgentAnswer>;
}

export interface GraphAgentExplainPort {
  explain(input: { runId: number }): Promise<{
    runId: number;
    explanation: Record<string, unknown> | null;
  }>;
}
