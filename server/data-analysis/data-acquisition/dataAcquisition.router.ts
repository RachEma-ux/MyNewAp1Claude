/**
 * Data Acquisition — tRPC router.
 *
 * Mounted at `dataAnalysis.dataAcquisition.*`. State-changing
 * operations use `governedProcedure` so the platform governance gate
 * runs before the service. Read operations use `protectedProcedure`.
 */

import { z } from "zod";

import { protectedProcedure, governedProcedure, router } from "../../_core/trpc";

import * as service from "./dataAcquisition.service";
import {
  classifyItemInput,
  discoverItemsInput,
  documentParserInput,
  idInput,
  registerSourceInput,
  routeItemInput,
  runAcquisitionInput,
  runOutputPipelineInput,
  runProcessingInput,
  summaryInput,
  updateSourceInput,
  validateDocumentInput,
} from "./dataAcquisition.validation";

export const dataAcquisitionRouter = router({
  /* ── Health ────────────────────────────────────────────────────── */
  workerStatus: protectedProcedure.query(() => service.workerStatus()),
  summary: protectedProcedure
    .input(summaryInput.optional())
    .query(({ input }) => service.summary(input ?? undefined)),

  /* ── Sources ──────────────────────────────────────────────────── */
  registerSource: governedProcedure
    .input(registerSourceInput)
    .mutation(({ input }) => service.registerSource(input)),
  listSources: protectedProcedure
    .input(z.object({ workspaceId: z.number().optional() }).optional())
    .query(({ input }) => service.listSources(input?.workspaceId)),
  getSource: protectedProcedure
    .input(idInput)
    .query(({ input }) => service.getSourceById(input.id)),
  updateSource: governedProcedure
    .input(updateSourceInput)
    .mutation(({ input }) => service.updateSource(input)),
  disableSource: governedProcedure
    .input(idInput)
    .mutation(({ input }) => service.disableSource(input)),

  /* ── Acquisition runs ─────────────────────────────────────────── */
  runAcquisition: governedProcedure
    .input(runAcquisitionInput)
    .mutation(({ input }) => service.runAcquisition(input)),
  listRuns: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().optional(),
        sourceId: z.number().optional(),
      }).optional(),
    )
    .query(({ input }) => service.listRuns(input?.workspaceId, input?.sourceId)),
  getRun: protectedProcedure
    .input(idInput)
    .query(({ input }) => service.getRunById(input.id)),
  cancelRun: governedProcedure
    .input(idInput)
    .mutation(({ input }) => service.cancelRun(input)),

  /* ── Items ────────────────────────────────────────────────────── */
  discoverItems: governedProcedure
    .input(discoverItemsInput)
    .mutation(({ input }) =>
      service.runAcquisition({
        sourceId: input.sourceId,
        workspaceId: input.workspaceId,
        runType: "discover",
        path: input.path,
      }),
    ),
  listItems: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().optional(),
        sourceId: z.number().optional(),
      }).optional(),
    )
    .query(({ input }) => service.listItems(input?.workspaceId, input?.sourceId)),
  getItem: protectedProcedure
    .input(idInput)
    .query(({ input }) => service.getItemById(input.id)),

  /* ── Classification + routing ─────────────────────────────────── */
  classifyItem: governedProcedure
    .input(classifyItemInput)
    .mutation(({ input }) => service.classifyItem(input)),
  routeItem: governedProcedure
    .input(routeItemInput)
    .mutation(({ input }) => service.routeItem(input)),
  listClassifications: protectedProcedure
    .input(z.object({ itemId: z.number().optional() }).optional())
    .query(({ input }) => service.listClassifications(input?.itemId)),
  listRoutes: protectedProcedure
    .input(z.object({ itemId: z.number().optional() }).optional())
    .query(({ input }) => service.listRoutesAll(input?.itemId)),

  /* ── Processing ───────────────────────────────────────────────── */
  runProcessing: governedProcedure
    .input(runProcessingInput)
    .mutation(({ input }) => service.runProcessing(input)),
  listProcessingRuns: protectedProcedure
    .input(z.object({ itemId: z.number().optional() }).optional())
    .query(({ input }) => service.listProcessingRuns(input?.itemId)),
  getProcessingRun: protectedProcedure
    .input(idInput)
    .query(({ input }) => service.getProcessingRunById(input.id)),

  /* ── Document pipeline ────────────────────────────────────────── */
  document: router({
    classify: governedProcedure
      .input(documentParserInput)
      .mutation(({ input }) => service.classifyDocumentItem(input)),
    routeParser: governedProcedure
      .input(documentParserInput)
      .mutation(({ input }) => service.routeParserForItem(input)),
    runParser: governedProcedure
      .input(documentParserInput)
      .mutation(({ input }) => service.runParser(input)),
    validate: governedProcedure
      .input(validateDocumentInput)
      .mutation(({ input }) => service.validateDocument(input)),
    getCanonical: protectedProcedure
      .input(documentParserInput)
      .query(({ input }) => service.getCanonicalDocument(input)),
  }),

  /* ── Output pipelines ─────────────────────────────────────────── */
  runOutputPipeline: governedProcedure
    .input(runOutputPipelineInput)
    .mutation(({ input }) => service.runOutputPipeline(input)),
  listOutputRuns: protectedProcedure
    .input(z.object({ workspaceId: z.number().optional() }).optional())
    .query(({ input }) => service.listOutputRuns(input?.workspaceId)),

  /* ── Canonical records ────────────────────────────────────────── */
  getCanonicalRecord: protectedProcedure
    .input(idInput)
    .query(({ input }) => service.getCanonicalRecord(input)),
  listCanonicalRecords: protectedProcedure
    .input(z.object({ workspaceId: z.number().optional() }).optional())
    .query(({ input }) => service.listCanonicalRecords(input?.workspaceId)),
});
