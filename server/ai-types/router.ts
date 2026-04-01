/**
 * AI Types Module — tRPC Router
 *
 * Top-level router registered as `aiTypes` in appRouter.
 * Composes all AI Types sub-routers into a single namespace:
 *
 *   trpc.aiTypes.catalog.*        → catalog management (CRUD, authoring, authority)
 *   trpc.aiTypes.registry.*       → registry consumption (read-only bundles)
 *   trpc.aiTypes.import.*         → catalog import & discovery
 *   trpc.aiTypes.taxonomy.*       → taxonomy management
 *   trpc.aiTypes.relationships.*  → cross-type graph
 *   trpc.aiTypes.validation.*     → completeness checks
 *   trpc.aiTypes.orchestration.*  → read-only aggregated views (overview, control panel)
 *
 * The old `catalogManage`, `catalogRegistry`, `catalogImport` router names
 * are preserved as backward-compatible aliases in server/routers.ts.
 */

import { router } from "../_core/trpc";
import { catalogManageRouter } from "../routers/catalog-manage";
import { catalogRegistryRouter } from "../routers/catalog-registry";
import { catalogImportRouter } from "../catalog-import/router";
import { taxonomyRouter } from "./taxonomy/router";
import { relationshipsRouter } from "./relationships/router";
import { validationRouter } from "./validation/router";
import { orchestrationRouter } from "./orchestration/router";

export const aiTypesRouter = router({
  // Existing functionality under new namespace
  catalog: catalogManageRouter,
  registry: catalogRegistryRouter,
  import: catalogImportRouter,

  // Taxonomy management
  taxonomy: taxonomyRouter,

  // Relationships + Validation
  relationships: relationshipsRouter,
  validation: validationRouter,

  // Orchestration — read-only aggregated views for standalone pages
  orchestration: orchestrationRouter,
});
