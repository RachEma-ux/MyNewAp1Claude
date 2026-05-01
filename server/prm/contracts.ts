/**
 * PRM — Contracts (DTO + Zod schemas exposed to other modules)
 *
 * Only types and Zod schemas; no runtime services. Other modules use
 * these to validate payloads they exchange with PRM via the Module
 * Gateway, Handoff, or Event Bus.
 */

import { z } from "zod";

export const PrmMethodIdSchema = z.number().int().positive();

export const PrmMethodSummarySchema = z.object({
  id: PrmMethodIdSchema,
  key: z.string(),
  name: z.string(),
  category: z.string(),
  status: z.string(),
  version: z.string().optional(),
});

export type PrmMethodSummary = z.infer<typeof PrmMethodSummarySchema>;

export const PrmPublishMethodInputSchema = z.object({
  methodId: PrmMethodIdSchema,
  governanceReceiptId: z.string().optional(),
});

export type PrmPublishMethodInput = z.infer<typeof PrmPublishMethodInputSchema>;
