/**
 * Sensor / IoT pipeline — normalizer.
 *
 * Takes a raw sensor payload (whatever shape the connector produced)
 * and emits a `data_acquisition_sensor_readings`-shaped row. Pure
 * function; the caller persists.
 */

import type { InsertDataAcquisitionSensorReading } from "../../../../../drizzle/schema";

export interface SensorRawReading {
  deviceId?: string;
  metricKey: string;
  value: number | string;
  unit?: string;
  qualityFlag?: string;
  recordedAt?: string | number | Date;
  metadata?: Record<string, unknown>;
}

export function normalizeSensorReading(
  itemId: number,
  raw: SensorRawReading,
): InsertDataAcquisitionSensorReading {
  return {
    itemId,
    deviceId: raw.deviceId ?? null,
    metricKey: raw.metricKey,
    value: String(raw.value),
    unit: raw.unit ?? null,
    qualityFlag: raw.qualityFlag ?? null,
    recordedAt: raw.recordedAt ? new Date(raw.recordedAt) : null,
    metadataJson: raw.metadata ?? null,
  };
}

export function normalizeSensorBatch(
  itemId: number,
  raws: SensorRawReading[],
): InsertDataAcquisitionSensorReading[] {
  return raws.map((r) => normalizeSensorReading(itemId, r));
}
