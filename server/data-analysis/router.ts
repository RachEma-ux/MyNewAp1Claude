/**
 * Data Analysis — Namespace Router
 *
 * Top-level router for the Data Analysis domain.
 * Contains: GraphRAG, Data Warehouse
 */

import { router } from "../_core/trpc";
import { graphRagRouter } from "./graphrag/router";
import { dataWarehouseRouter } from "./data-warehouse/router";
import { dataAcquisitionRouter } from "./data-acquisition/dataAcquisition.router";

export const dataAnalysisRouter = router({
  graphRag: graphRagRouter,
  dataWarehouse: dataWarehouseRouter,
  dataAcquisition: dataAcquisitionRouter,
});
