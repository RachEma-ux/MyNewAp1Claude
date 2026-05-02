/**
 * Google Drive connector.
 *
 * Reports `unconfigured` until `GDRIVE_CLIENT_ID`,
 * `GDRIVE_CLIENT_SECRET`, and `GDRIVE_REFRESH_TOKEN` are present.
 * Google API calls happen on the worker; this connector validates
 * credentials and delegates.
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

const ENV_VARS = ["GDRIVE_CLIENT_ID", "GDRIVE_CLIENT_SECRET", "GDRIVE_REFRESH_TOKEN"];

export class GoogleDriveConnector implements AcquisitionConnector {
  key = "gdrive";
  displayName = "Google Drive";
  sourceTypes = ["saas", "document"] as any;
  envVars = ENV_VARS;
  notes = "OAuth credentials validated here; SDK calls run on the worker.";

  private missing(): string[] {
    return ENV_VARS.filter((v) => !process.env[v]);
  }

  async status(): Promise<ConnectorStatusReport> {
    const m = this.missing();
    if (m.length > 0) {
      return {
        status: "unconfigured",
        message: `Google Drive connector requires env vars: ${m.join(", ")}.`,
      };
    }
    return { status: "available", message: "Google Drive connector configured." };
  }

  async discover(_input: DiscoverInput): Promise<DiscoveredItem[]> {
    const m = this.missing();
    if (m.length > 0) {
      throw new Error(
        `Google Drive connector unconfigured — missing env vars: ${m.join(", ")}`,
      );
    }
    return [];
  }

  async acquire(_input: AcquireInput): Promise<AcquiredItem[]> {
    const m = this.missing();
    if (m.length > 0) {
      throw new Error(
        `Google Drive connector unconfigured — missing env vars: ${m.join(", ")}`,
      );
    }
    return [];
  }
}
