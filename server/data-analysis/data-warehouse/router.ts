/**
 * Data Warehouse — tRPC Router
 *
 * API surface for the Data Warehouse module.
 * Namespace: dataAnalysis.dataWarehouse.*
 */

import { z } from "zod";
import { router, publicProcedure } from "../../_core/trpc";
import * as service from "./service";
import { seedDataWarehouse } from "./seed";

export const dataWarehouseRouter = router({
  // ── Sectors ─────────────────────────────────────────────────────────────
  sectors: router({
    list: publicProcedure.query(async () => {
      return service.listSectors();
    }),
  }),

  // ── Industries ──────────────────────────────────────────────────────────
  industries: router({
    list: publicProcedure
      .input(z.object({ sectorCode: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return service.listIndustries(input?.sectorCode);
      }),
  }),

  // ── Scopes ──────────────────────────────────────────────────────────────
  scopes: router({
    list: publicProcedure
      .input(z.object({ sectorCode: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return service.listScopes(input?.sectorCode);
      }),
  }),

  // ── Standards ───────────────────────────────────────────────────────────
  standards: router({
    list: publicProcedure.query(async () => {
      return service.listStandards();
    }),
  }),

  // ── Mappings (search with filters) ──────────────────────────────────────
  mappings: router({
    search: publicProcedure
      .input(
        z.object({
          sectorCode: z.string().optional(),
          naicsCode: z.string().optional(),
          scopeId: z.string().optional(),
          searchText: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        return service.searchMappings(input ?? {});
      }),
  }),

  // ── Stats ───────────────────────────────────────────────────────────────
  stats: publicProcedure.query(async () => {
    return service.getStats();
  }),

  // ── Seed (mutation to populate the DB) ──────────────────────────────────
  seed: publicProcedure.mutation(async () => {
    const counts = await seedDataWarehouse();
    return { success: true, counts };
  }),
});
