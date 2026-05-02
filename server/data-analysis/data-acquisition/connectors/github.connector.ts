/**
 * GitHub repository connector.
 *
 * Reports `unconfigured` until `GITHUB_TOKEN` is present. Repository
 * walk and content fetches happen on the worker.
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

const ENV_VARS = ["GITHUB_TOKEN"];

export class GitHubConnector implements AcquisitionConnector {
  key = "github";
  displayName = "GitHub Repository";
  sourceTypes = ["git"] as any;
  envVars = ENV_VARS;
  notes = "GITHUB_TOKEN validated here; tree walk + blob fetch run on the worker.";

  private missing(): string[] {
    return ENV_VARS.filter((v) => !process.env[v]);
  }

  async status(): Promise<ConnectorStatusReport> {
    const m = this.missing();
    if (m.length > 0) {
      return {
        status: "unconfigured",
        message: `GitHub connector requires env vars: ${m.join(", ")}.`,
      };
    }
    return { status: "available", message: "GitHub connector configured." };
  }

  async discover(_input: DiscoverInput): Promise<DiscoveredItem[]> {
    const m = this.missing();
    if (m.length > 0) {
      throw new Error(
        `GitHub connector unconfigured — missing env vars: ${m.join(", ")}`,
      );
    }
    return [];
  }

  async acquire(_input: AcquireInput): Promise<AcquiredItem[]> {
    const m = this.missing();
    if (m.length > 0) {
      throw new Error(
        `GitHub connector unconfigured — missing env vars: ${m.join(", ")}`,
      );
    }
    return [];
  }
}
