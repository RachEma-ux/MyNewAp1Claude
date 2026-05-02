/**
 * Object storage pipeline — object discovery normalizer.
 *
 * Connectors (S3, GCS, Azure Blob) hand us a list of objects with bucket,
 * key, size, and contentType. This function shapes the list into
 * DiscoveredItem entries the universal intake gate consumes.
 */

import type { DiscoveredItem } from "../../dataAcquisition.types";

export interface RawObject {
  bucket?: string;
  key: string;
  size?: number;
  contentType?: string;
  checksum?: string;
  lastModified?: string | number | Date;
}

export function normalizeObjects(raw: RawObject[]): DiscoveredItem[] {
  return raw.map((o) => {
    const lower = o.key.toLowerCase();
    const itemType: DiscoveredItem["itemType"] = lower.match(
      /\.(jpg|jpeg|png|gif|tiff|tif|webp|mp3|mp4|wav|mov|m4a|flac|webm)$/,
    )
      ? "media_asset"
      : "document";
    return {
      itemType,
      sourceUri: o.bucket ? `s3://${o.bucket}/${o.key}` : o.key,
      rawLocation: o.key,
      sizeBytes: o.size,
      mimeType: o.contentType,
      checksum: o.checksum,
      metadata: {
        bucket: o.bucket,
        key: o.key,
        lastModified: o.lastModified,
      },
    };
  });
}
