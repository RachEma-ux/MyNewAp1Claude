/**
 * AI Types Module — tRPC Router
 *
 * Top-level router registered as `aiTypes` in appRouter.
 * Composes all AI Types sub-routers into a single namespace:
 *
 *   trpc.aiTypes.catalog.*     → catalog management (CRUD, authoring, authority)
 *   trpc.aiTypes.registry.*    → registry consumption (read-only bundles)
 *   trpc.aiTypes.import.*      → catalog import & discovery
 *   trpc.aiTypes.taxonomy.*    → taxonomy management (Phase 3)
 *   trpc.aiTypes.relationships.*→ cross-type graph (Phase 4)
 *   trpc.aiTypes.validation.*  → completeness checks (Phase 4)
 *   trpc.aiTypes.controlPanel.*→ admin actions (Phase 5)
 *
 * The old `catalogManage`, `catalogRegistry`, `catalogImport` router names
 * are preserved as backward-compatible aliases in server/routers.ts.
 */

import { router } from "../_core/trpc";
import { catalogManageRouter } from "../routers/catalog-manage";
import { catalogRegistryRouter } from "../routers/catalog-registry";
import { catalogImportRouter } from "../catalog-import/router";
import { taxonomyRouter } from "./taxonomy/router";

export const aiTypesRouter = router({
  // Existing functionality under new namespace
  catalog: catalogManageRouter,
  registry: catalogRegistryRouter,
  import: catalogImportRouter,

  // Phase 3: Taxonomy management
  taxonomy: taxonomyRouter,

  // Future sub-routers (Phase 4-5):
  // relationships: relationshipsRouter,
  // validation: validationRouter,
  // controlPanel: controlPanelRouter,
});
