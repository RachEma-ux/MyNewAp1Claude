/**
 * Universal Ingestion Service — D-UI-1 top-level orchestrator.
 *
 * Walks the four layers in order:
 *   SourceConnector.fetch → Parser.parse → Normalizer.normalize → Extractor.extract*
 *
 * Persists artifacts (D-UI-3), provenance (D-UI-2), units (D-NKU-2 + D-NKU-4
 * dedupe), validation results (D-UI-4), extractions (D-UI-1 layer #4),
 * and the wrapping ingestion job. Returns the structured `IngestionJobResult`.
 *
 * Never executes tools (D-UI-6). Pure DB writes.
 */

import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection";
import {
  agsIngestionArtifacts,
  agsExtractionResults,
} from "../../../../drizzle/tables/agent-studio";
import {
  getSourceConnector,
  registerDefaultSourceConnectors,
} from "./source-connector-registry";
import {
  getParser,
  selectParserForContentType,
  registerDefaultParsers,
} from "./parser-registry";
import {
  getNormalizer,
  registerDefaultNormalizers,
  identityNormalizer,
} from "./normalizer-registry";
import { getExtractor } from "./extractor-registry";
import { recordProvenance } from "./provenance-service";
import { insertUnit } from "./knowledge-unit-service";
import { startJob, completeJob } from "./ingestion-job-service";
import {
  KnowledgeUnitContractError,
  UnsupportedContentTypeError,
  type IngestionJobRequest,
  type IngestionJobResult,
} from "./types";

let bootstrapped = false;
function ensureBootstrapped() {
  if (bootstrapped) return;
  registerDefaultSourceConnectors();
  registerDefaultParsers();
  registerDefaultNormalizers();
  bootstrapped = true;
}

export async function runIngestion(
  request: IngestionJobRequest,
): Promise<IngestionJobResult> {
  ensureBootstrapped();

  const jobId = await startJob({
    workspaceId: request.workspaceId,
    sourceConnectorKey: request.sourceConnectorKey,
    requestedBy: request.requestedBy,
  });

  const counters = {
    artifactsCreated: 0,
    unitsCreated: 0,
    chunksCreated: 0,
    extractionsCreated: 0,
  };

  try {
    // ── Layer 1: SourceConnector.fetch ──
    const connector = getSourceConnector(request.sourceConnectorKey);
    if (!connector) {
      await completeJob({
        jobId,
        status: "failed",
        ...counters,
        failureReason: `unknown source connector: ${request.sourceConnectorKey}`,
      });
      return { jobId, status: "failed", ...counters, failureReason: `unknown source connector: ${request.sourceConnectorKey}` };
    }
    const artifact = await connector.fetch({
      workspaceId: request.workspaceId,
      config: request.connectorInput,
    });

    // ── Persist the raw artifact (D-UI-3) ──
    const artifactId = await persistArtifact({
      workspaceId: request.workspaceId,
      sourceConnectorKey: request.sourceConnectorKey,
      contentHash: artifact.contentHash,
      sourceUri: artifact.sourceUri,
      contentType: artifact.contentType,
      sizeBytes: artifact.bytes.byteLength,
    });
    counters.artifactsCreated += artifactId.created ? 1 : 0;

    // ── Layer 2: Parser.parse ──
    let parser;
    try {
      parser = request.parserKey
        ? getParser(request.parserKey)
        : selectParserForContentType(artifact.contentType);
      if (!parser) {
        throw new UnsupportedContentTypeError(artifact.contentType);
      }
    } catch (e) {
      if (e instanceof UnsupportedContentTypeError) {
        await completeJob({
          jobId,
          status: "unsupported_type",
          ...counters,
          failureReason: e.message,
        });
        return {
          jobId,
          status: "unsupported_type",
          ...counters,
          failureReason: e.message,
        };
      }
      throw e;
    }
    let parsed;
    try {
      parsed = await parser.parse(artifact);
    } catch (e) {
      // D-PARSE-OCR-3: parsers may refuse at parse-time when their
      // engine is unhealthy; surface that as `unsupported_type` so it
      // matches the missing-parser path operators already understand.
      if (e instanceof UnsupportedContentTypeError) {
        await completeJob({
          jobId,
          status: "unsupported_type",
          ...counters,
          failureReason: e.message,
        });
        return {
          jobId,
          status: "unsupported_type",
          ...counters,
          failureReason: e.message,
        };
      }
      throw e;
    }

    // ── Layer 3: Normalizer.normalize ──
    const normalizer =
      (request.normalizerKey && getNormalizer(request.normalizerKey)) ??
      identityNormalizer;
    let inputs;
    try {
      inputs = normalizer.normalize({
        workspaceId: request.workspaceId,
        sourceId: request.sourceId,
        document: parsed,
        permissionContext: request.permissionContext,
      });
    } catch (e) {
      // Normalizer failure means the parsed document can't be split
      // into units. Fail the job with a structured reason so it's
      // distinguishable from generic "failed".
      const reason = `normalizer_failed: ${e instanceof Error ? e.message : String(e)}`;
      await completeJob({ jobId, status: "failed", ...counters, failureReason: reason });
      return { jobId, status: "failed", ...counters, failureReason: reason };
    }

    // ── Persist provenance once per job ──
    const provenanceId = await recordProvenance({
      workspaceId: request.workspaceId,
      sourceConnectorKey: connector.key,
      parserKey: parser.key,
      normalizerKey: normalizer.key,
      rawArtifactHash: artifact.contentHash,
      ingestionJobId: jobId,
      metadata: artifact.metadata ?? undefined,
    });

    // ── Insert units (D-NKU-4 dedupes on hash; service enforces D-NKU-3) ──
    const insertedUnitIds: number[] = [];
    for (const unitInput of inputs) {
      try {
        const r = await insertUnit({ ...unitInput, provenanceId });
        if (!r.reused) counters.unitsCreated += 1;
        insertedUnitIds.push(r.unitId);
      } catch (e) {
        if (e instanceof KnowledgeUnitContractError) {
          // Skip units that violate the contract; the job still succeeds
          // for the rest. A warning rule fires in DataValidation.
          continue;
        }
        throw e;
      }
    }

    // ── Layer 4: Extractor.extract ──
    // Per-unit extraction failures are isolated — one bad extraction
    // never breaks the rest of the job (mirrors the per-unit insertUnit
    // skip pattern above for KnowledgeUnitContractError).
    if (request.extractorKeys && request.extractorKeys.length > 0) {
      const db = getAsDb();
      if (!db) throw new Error("ASDB unavailable");
      for (const extractorKey of request.extractorKeys) {
        const extractor = getExtractor(extractorKey);
        if (!extractor) continue;
        for (let i = 0; i < insertedUnitIds.length; i++) {
          const unitId = insertedUnitIds[i];
          const unitInput = inputs[i];
          if (!unitInput) continue;
          try {
            const extractions = await extractor.extract({
              workspaceId: request.workspaceId,
              unitId,
              unitType: unitInput.unitType,
              contentText: unitInput.contentText,
              contentJson: unitInput.contentJson ?? null,
            });
            for (const ext of extractions) {
              try {
                await db.insert(agsExtractionResults).values({
                  workspaceId: request.workspaceId,
                  unitId,
                  extractorKey,
                  extractionType: ext.extractionType,
                  payloadJson: ext.payloadJson,
                  payloadHash: ext.payloadHash ?? null,
                });
                counters.extractionsCreated += 1;
              } catch {
                // One extraction insert failure must not cascade —
                // continue to the next extraction. The job still
                // succeeds for the rest.
              }
            }
          } catch {
            // Extractor logic error on this unit. Skip — other units
            // may still extract successfully.
          }
        }
      }
    }

    await completeJob({ jobId, status: "succeeded", ...counters });
    return { jobId, status: "succeeded", ...counters, failureReason: null };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await completeJob({
      jobId,
      status: "failed",
      ...counters,
      failureReason: reason,
    });
    return { jobId, status: "failed", ...counters, failureReason: reason };
  }
}

async function persistArtifact(input: {
  workspaceId: number;
  sourceConnectorKey: string;
  contentHash: string;
  sourceUri: string | null;
  contentType: string;
  sizeBytes: number;
}): Promise<{ id: number; created: boolean }> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  // Idempotent: unique on (workspaceId, contentHash).
  const existing = await db
    .select()
    .from(agsIngestionArtifacts)
    .where(
      and(
        eq(agsIngestionArtifacts.workspaceId, input.workspaceId),
        eq(agsIngestionArtifacts.contentHash, input.contentHash),
      ),
    )
    .limit(1);
  if (existing.length > 0) return { id: existing[0].id, created: false };
  const [row] = await db
    .insert(agsIngestionArtifacts)
    .values({
      workspaceId: input.workspaceId,
      sourceConnectorKey: input.sourceConnectorKey,
      sourceUri: input.sourceUri,
      contentType: input.contentType,
      contentHash: input.contentHash,
      sizeBytes: input.sizeBytes,
    })
    .returning({ id: agsIngestionArtifacts.id });
  return { id: row.id, created: true };
}
