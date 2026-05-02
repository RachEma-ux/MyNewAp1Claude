/**
 * Sensor / IoT connector.
 *
 * Reports `unconfigured` until `SENSOR_BROKER_URL` is present. MQTT /
 * CoAP / AMQP subscriptions run on the worker — this connector is the
 * source-of-truth for the broker URL and per-source topic config.
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

const ENV_VARS = ["SENSOR_BROKER_URL"];

export class SensorConnector implements AcquisitionConnector {
  key = "sensor";
  displayName = "Sensor / IoT (MQTT/CoAP/AMQP)";
  sourceTypes = ["sensor"] as any;
  envVars = ENV_VARS;
  notes = "MQTT/CoAP/AMQP subscription runs on the worker.";

  private missing(): string[] {
    return ENV_VARS.filter((v) => !process.env[v]);
  }

  async status(): Promise<ConnectorStatusReport> {
    const m = this.missing();
    if (m.length > 0) {
      return {
        status: "unconfigured",
        message: `Sensor connector requires env vars: ${m.join(", ")}.`,
      };
    }
    return {
      status: "available",
      message: "Sensor connector configured.",
      url: process.env.SENSOR_BROKER_URL,
    };
  }

  async discover(_input: DiscoverInput): Promise<DiscoveredItem[]> {
    const m = this.missing();
    if (m.length > 0) {
      throw new Error(
        `Sensor connector unconfigured — missing env vars: ${m.join(", ")}`,
      );
    }
    return [];
  }

  async acquire(_input: AcquireInput): Promise<AcquiredItem[]> {
    const m = this.missing();
    if (m.length > 0) {
      throw new Error(
        `Sensor connector unconfigured — missing env vars: ${m.join(", ")}`,
      );
    }
    return [];
  }
}
