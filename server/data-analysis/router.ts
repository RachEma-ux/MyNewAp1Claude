/**
 * Data Analysis — Namespace Router
 *
 * Top-level router for the Data Analysis domain.
 * Currently contains: GraphRAG
 * Future: additional analytical tools can be added here.
 */

import { router } from "../_core/trpc";
import { graphRagRouter } from "./graphrag/router";

export const dataAnalysisRouter = router({
  graphRag: graphRagRouter,
});
