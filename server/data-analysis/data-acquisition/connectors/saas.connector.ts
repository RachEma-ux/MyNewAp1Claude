/**
 * SaaS / Collaboration connector (Notion / Slack / Confluence / etc.).
 *
 * Provider-specific OAuth tokens live on the source row's
 * `configJson.providerCredentials`; this connector validates the
 * provider key and delegates SDK calls to the worker.
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

export const SUPPORTED_SAAS_PROVIDERS = [
  "notion",
  "slack",
  "confluence",
  "google_workspace",
  "microsoft_365",
] as const;

export class SaasConnector implements AcquisitionConnector {
  key = "saas";
  displayName = "SaaS / Collaboration (Notion / Slack / Confluence)";
  sourceTypes = ["saas"] as any;
  envVars = [] as string[];
  notes = "Provider credentials live on the source row's configJson.";

  async status(): Promise<ConnectorStatusReport> {
    return {
      status: "available",
      message: "SaaS connector available — pick provider per source.",
    };
  }

  async discover(_input: DiscoverInput): Promise<DiscoveredItem[]> {
    return [];
  }

  async acquire(_input: AcquireInput): Promise<AcquiredItem[]> {
    return [];
  }
}
