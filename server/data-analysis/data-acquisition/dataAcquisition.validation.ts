/**
 * Data Acquisition — input validation (Zod schemas).
 */

import { z } from "zod";

import { ITEM_TYPES, OUTPUT_TYPES, PIPELINES, SOURCE_TYPES } from "./dataAcquisition.constants";

export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export const itemTypeSchema = z.enum(ITEM_TYPES);
export const pipelineSchema = z.enum(PIPELINES);
export const outputTypeSchema = z.enum(OUTPUT_TYPES);

export const registerSourceInput = z.object({
  workspaceId: z.number().int().positive(),
  sourceType: sourceTypeSchema,
  sourceUri: z.string().min(1),
  displayName: z.string().min(1),
  configJson: z.record(z.string(), z.unknown()).optional(),
  createdBy: z.number().int().positive().optional(),
});

export const updateSourceInput = z.object({
  id: z.number().int().positive(),
  patch: z
    .object({
      displayName: z.string().optional(),
      sourceUri: z.string().optional(),
      status: z.string().optional(),
      configJson: z.record(z.string(), z.unknown()).optional(),
    })
    .partial(),
});

export const idInput = z.object({ id: z.number().int().positive() });

export const runAcquisitionInput = z.object({
  sourceId: z.number().int().positive(),
  workspaceId: z.number().int().positive(),
  runType: z.string().default("acquire"),
  inlineItems: z
    .array(
      z.object({
        itemType: itemTypeSchema,
        sourceUri: z.string(),
        rawLocation: z.string().optional(),
        mimeType: z.string().optional(),
        sizeBytes: z.number().optional(),
        checksum: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  createdBy: z.number().int().positive().optional(),
});

export const discoverItemsInput = z.object({
  sourceId: z.number().int().positive(),
  workspaceId: z.number().int().positive(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  path: z.string().optional(),
});

export const classifyItemInput = z.object({
  itemId: z.number().int().positive(),
});

export const routeItemInput = z.object({
  itemId: z.number().int().positive(),
});

export const runProcessingInput = z.object({
  itemId: z.number().int().positive(),
  pipeline: pipelineSchema.optional(),
  processorName: z.string().optional(),
  runId: z.number().int().positive().optional(),
});

export const runOutputPipelineInput = z.object({
  workspaceId: z.number().int().positive(),
  outputType: outputTypeSchema,
  itemId: z.number().int().positive().optional(),
  canonicalRecordId: z.number().int().positive().optional(),
  targetRef: z.string().optional(),
});

export const documentParserInput = z.object({
  itemId: z.number().int().positive(),
});

export const validateDocumentInput = z.object({
  itemId: z.number().int().positive(),
  workerOutput: z
    .object({
      sections: z.array(z.unknown()).optional(),
      ocrConfidence: z.number().optional(),
      errors: z.array(z.string()).optional(),
    })
    .optional(),
});

export const summaryInput = z.object({
  workspaceId: z.number().int().positive().optional(),
});
