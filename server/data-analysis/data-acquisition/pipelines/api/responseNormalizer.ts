/**
 * API pipeline — response normalizer.
 *
 * Converts an `ApiSyncResult` into the InsertDataAcquisitionApiRecord
 * row shape. Pure function.
 */

import type { InsertDataAcquisitionApiRecord } from "../../../../../drizzle/schema";
import type { ApiSyncResult } from "./apiSync";

export function normalizeApiResponse(
  itemId: number,
  result: ApiSyncResult,
): InsertDataAcquisitionApiRecord {
  return {
    itemId,
    endpoint: result.endpoint,
    method: result.method,
    statusCode: result.statusCode,
    requestJson: result.requestJson ?? null,
    responseJson: result.responseJson ?? null,
    durationMs: result.durationMs,
    fetchedAt: result.fetchedAt,
  };
}
