/**
 * Media pipeline — metadata extractor.
 *
 * Receives a worker-decoded media payload (probe output) and shapes
 * it into `data_acquisition_media_assets` row form. Pure function.
 */

import type { InsertDataAcquisitionMediaAsset } from "../../../../../drizzle/schema";
import { classifyMedia } from "./mediaClassifier";

export interface RawMediaProbe {
  mimeType?: string;
  filename?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  codec?: string;
  rawLocation?: string;
  metadata?: Record<string, unknown>;
}

export function extractMediaMetadata(
  itemId: number,
  probe: RawMediaProbe,
): InsertDataAcquisitionMediaAsset {
  const cls = classifyMedia({ mimeType: probe.mimeType, filename: probe.filename });
  return {
    itemId,
    mediaType: cls.kind,
    durationSec: probe.durationSec ?? null,
    width: probe.width ?? null,
    height: probe.height ?? null,
    codec: probe.codec ?? null,
    rawLocation: probe.rawLocation ?? null,
    metadataJson: probe.metadata ?? null,
  };
}
