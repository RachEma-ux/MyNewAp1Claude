/**
 * PS Module — tRPC Router
 *
 * Exposes PS systems CRUD, wizard runs, catalog, classification, and demand.
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
  createResourceRequestSchema,
  listResourceRequestsSchema,
  listResourceRequestsBySystemSchema,
  updateResourceRequestStatusSchema,
  getDemandSummarySchema,
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

const demandRouter = router({
  create: governedProcedure
    .input(createResourceRequestSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createResourceRequest(input, ctx.user.id);
    }),

  list: protectedProcedure
    .input(listResourceRequestsSchema)
    .query(async ({ input }) => {
      return service.listResourceRequests(input.workspaceId, input.status);
    }),

  listBySystem: protectedProcedure
    .input(listResourceRequestsBySystemSchema)
    .query(async ({ input }) => {
      return service.listResourceRequestsBySystem(input.workspaceId, input.psSystemId);
    }),

  updateStatus: governedProcedure
    .input(updateResourceRequestStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return service.updateResourceRequestStatus(
        input.workspaceId,
        input.id,
        input.status,
        ctx.user.id,
      );
    }),

  summary: protectedProcedure
    .input(getDemandSummarySchema)
    .query(async ({ input }) => {
      return service.getDemandSummary(input.workspaceId, input.psSystemId);
    }),
});

export const psRouter = router({
  systems: systemsRouter,
  wizardRuns: wizardRunsRouter,
  demand: demandRouter,

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
