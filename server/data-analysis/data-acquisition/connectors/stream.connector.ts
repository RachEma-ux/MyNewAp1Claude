/**
 * Stream connector — Kafka / Pulsar / Redis Streams.
 *
 * Reports `unconfigured` until `STREAM_BROKER_URL` is present. The
 * actual subscription + decoding runs on the worker via
 * `pipelines/stream/streamDecoder.ts` + `eventNormalizer.ts`.
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

const ENV_VARS = ["STREAM_BROKER_URL"];

export class StreamConnector implements AcquisitionConnector {
  key = "stream";
  displayName = "Stream (Kafka / Pulsar / Redis Streams)";
  sourceTypes = ["stream"] as any;
  envVars = ENV_VARS;
  notes = "Stream consumer runs on the worker.";

  private missing(): string[] {
    return ENV_VARS.filter((v) => !process.env[v]);
  }

  async status(): Promise<ConnectorStatusReport> {
    const m = this.missing();
    if (m.length > 0) {
      return {
        status: "unconfigured",
        message: `Stream connector requires env vars: ${m.join(", ")}.`,
      };
    }
    return {
      status: "available",
      message: "Stream connector configured.",
      url: process.env.STREAM_BROKER_URL,
    };
  }

  async discover(_input: DiscoverInput): Promise<DiscoveredItem[]> {
    const m = this.missing();
    if (m.length > 0) {
      throw new Error(
        `Stream connector unconfigured — missing env vars: ${m.join(", ")}`,
      );
    }
    return [];
  }

  async acquire(_input: AcquireInput): Promise<AcquiredItem[]> {
    const m = this.missing();
    if (m.length > 0) {
      throw new Error(
        `Stream connector unconfigured — missing env vars: ${m.join(", ")}`,
      );
    }
    return [];
  }
}
