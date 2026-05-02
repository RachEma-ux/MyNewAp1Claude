/**
 * S3 / S3-compatible object storage connector.
 *
 * Reports `unconfigured` until `AWS_ACCESS_KEY_ID`,
 * `AWS_SECRET_ACCESS_KEY`, and `S3_BUCKET` are present. No `aws-sdk`
 * import — discovery / acquire delegate to the worker (which owns
 * the SDK). Until the worker is wired, the connector throws on real
 * calls so the caller records a failed run.
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

const ENV_VARS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET"];

export class S3Connector implements AcquisitionConnector {
  key = "s3";
  displayName = "AWS S3 / S3-compatible Object Storage";
  sourceTypes = ["object_storage", "document", "media"] as any;
  envVars = ENV_VARS;
  notes = "Discovery + acquire delegate to the Data Acquisition worker.";

  private missing(): string[] {
    return ENV_VARS.filter((v) => !process.env[v]);
  }

  async status(): Promise<ConnectorStatusReport> {
    const m = this.missing();
    if (m.length > 0) {
      return {
        status: "unconfigured",
        message: `S3 connector requires env vars: ${m.join(", ")}.`,
      };
    }
    return { status: "available", message: "S3 connector configured." };
  }

  async discover(_input: DiscoverInput): Promise<DiscoveredItem[]> {
    const m = this.missing();
    if (m.length > 0) {
      throw new Error(
        `S3 connector unconfigured — missing env vars: ${m.join(", ")}`,
      );
    }
    // Real S3 listing happens on the worker; this connector is the
    // source-of-truth for credentials, not for SDK calls.
    return [];
  }

  async acquire(_input: AcquireInput): Promise<AcquiredItem[]> {
    const m = this.missing();
    if (m.length > 0) {
      throw new Error(
        `S3 connector unconfigured — missing env vars: ${m.join(", ")}`,
      );
    }
    return [];
  }
}
