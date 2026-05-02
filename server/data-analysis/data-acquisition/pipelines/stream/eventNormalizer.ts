/**
 * Stream pipeline — event normalizer.
 *
 * Maps a decoded stream record into the InsertDataAcquisitionStreamEvent
 * shape. Pure function; service persists.
 */

import type { InsertDataAcquisitionStreamEvent } from "../../../../../drizzle/schema";
import type { DecodedStreamRecord } from "./streamDecoder";

export function normalizeStreamEvent(
  itemId: number,
  record: DecodedStreamRecord,
): InsertDataAcquisitionStreamEvent {
  return {
    itemId,
    streamKey: record.streamKey,
    partition: record.partition ?? null,
    offset: record.offset ?? null,
    eventType: record.eventType ?? null,
    eventTime: record.eventTime ?? null,
    payloadJson: record.payloadJson ?? null,
    headersJson: record.headersJson ?? null,
  };
}
