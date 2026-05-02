/**
 * Generic object-storage connector (Azure Blob / GCS / MinIO / etc.).
 *
 * Distinct from `s3.connector.ts` in that it accepts a provider key on
 * the source row's `configJson.provider` and delegates to the worker.
 * No global env vars; per-source credentials live in `configJson`.
 */

import type {
  AcquireInput,
  AcquiredItem,
  DiscoverInput,
  DiscoveredItem,
} from "../dataAcquisition.types";
import type {
  AcquisitionConnector,
  ConnectorStatusReport,
} from "./connector.types";

export const SUPPORTED_OBJECT_STORAGE_PROVIDERS = [
  "azure_blob",
  "gcs",
  "minio",
  "wasabi",
  "backblaze_b2",
] as const;

export class ObjectStorageConnector implements AcquisitionConnector {
  key = "objectStorage";
  displayName = "Object Storage (Azure Blob / GCS / MinIO / etc.)";
  sourceTypes = ["object_storage"] as any;
  envVars = [] as string[];
  notes = "Per-source provider + credentials in configJson; SDK calls on the worker.";

  async status(): Promise<ConnectorStatusReport> {
    return {
      status: "available",
      message: "Object storage connector available — pick provider per source.",
    };
  }

  async discover(_input: DiscoverInput): Promise<DiscoveredItem[]> {
    return [];
  }

  async acquire(_input: AcquireInput): Promise<AcquiredItem[]> {
    return [];
  }
}
