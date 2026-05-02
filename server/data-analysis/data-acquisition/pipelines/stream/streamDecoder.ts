/**
 * Stream pipeline — decoder.
 *
 * Decodes a raw broker payload into a known shape. The connector tells
 * us the stream key; the decoder normalises offset/partition/headers.
 * No external broker SDK is imported — production decoding lives on
 * the worker; this layer handles already-fetched payloads.
 */

export interface RawStreamRecord {
  streamKey: string;
  partition?: number | null;
  offset?: string | number | null;
  eventType?: string;
  eventTime?: string | number | Date;
  payload?: Record<string, unknown> | string;
  headers?: Record<string, unknown>;
}

export interface DecodedStreamRecord {
  streamKey: string;
  partition: number | null;
  offset: string | null;
  eventType: string | null;
  eventTime: Date | null;
  payloadJson: Record<string, unknown> | null;
  headersJson: Record<string, unknown> | null;
}

export function decodeStreamRecord(raw: RawStreamRecord): DecodedStreamRecord {
  let payloadJson: Record<string, unknown> | null = null;
  if (typeof raw.payload === "string") {
    try {
      payloadJson = JSON.parse(raw.payload);
    } catch {
      payloadJson = { raw: raw.payload };
    }
  } else if (raw.payload && typeof raw.payload === "object") {
    payloadJson = raw.payload;
  }
  const offset =
    raw.offset === null || raw.offset === undefined ? null : String(raw.offset);
  const partition =
    raw.partition === null || raw.partition === undefined ? null : Number(raw.partition);
  const eventTime = raw.eventTime ? new Date(raw.eventTime) : null;
  return {
    streamKey: raw.streamKey,
    partition,
    offset,
    eventType: raw.eventType ?? null,
    eventTime,
    payloadJson,
    headersJson: raw.headers ?? null,
  };
}
