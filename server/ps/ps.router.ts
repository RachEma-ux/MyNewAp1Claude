/**
 * PS Module — tRPC Router
 *
 * Exposes PS systems CRUD, wizard runs, catalog, and classification.
 */

import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import {
  createSystemSchema,
  getSystemSchema,
  listSystemsSchema,
  createWizardRunSchema,
  getWizardRunSchema,
  listWizardRunsSchema,
  classifyScenarioSchema,
} from "./ps.validation";
import * as service from "./ps.service";

const systemsRouter = router({
  create: governedProcedure
    .input(createSystemSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createSystem(input, ctx.user.id);
    }),

  get: protectedProcedure
    .input(getSystemSchema)
    .query(async ({ input }) => {
      return service.getSystem(input.workspaceId, input.id);
    }),

  list: protectedProcedure
    .input(listSystemsSchema)
    .query(async ({ input }) => {
      return service.listSystems(input.workspaceId, input.status);
    }),
});

const wizardRunsRouter = router({
  create: governedProcedure
    .input(createWizardRunSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createWizardRun(input, ctx.user.id);
    }),

  get: protectedProcedure
    .input(getWizardRunSchema)
    .query(async ({ input }) => {
      return service.getWizardRun(input.workspaceId, input.id);
    }),

  list: protectedProcedure
    .input(listWizardRunsSchema)
    .query(async ({ input }) => {
      return service.listWizardRuns(input.workspaceId);
    }),
});

export const psRouter = router({
  systems: systemsRouter,
  wizardRuns: wizardRunsRouter,

  classifyScenario: protectedProcedure
    .input(classifyScenarioSchema)
    .query(({ input }) => {
      return service.classifyScenario({
        scenarioText: input.scenarioText,
        dimensions: input.dimensions,
      });
    }),

  catalog: protectedProcedure
    .query(async () => {
      return service.getCatalog();
    }),
});
