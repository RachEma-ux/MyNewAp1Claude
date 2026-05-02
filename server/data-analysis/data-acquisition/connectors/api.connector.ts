/**
 * Generic HTTP API connector.
 *
 * No global env vars — auth/headers/baseURL live on the source row's
 * `configJson`. The connector reads the source row at call time and
 * delegates to `runApiSync` (pure global fetch). Reports `available`
 * unconditionally; per-source mis-configuration surfaces as failed
 * runs at acquisition time.
 */

import { runApiSync } from "../pipelines/api/apiSync";
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

export interface ApiSourceConfig {
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
}

export class GenericApiConnector implements AcquisitionConnector {
  key = "api";
  displayName = "Generic HTTP API";
  sourceTypes = ["api"] as any;
  envVars = [] as string[];
  notes =
    "Auth + endpoint + method live on the source row's configJson; SDK-free fetch.";

  async status(): Promise<ConnectorStatusReport> {
    return {
      status: "available",
      message: "Generic API connector available — config lives on each source.",
    };
  }

  async discover(input: DiscoverInput): Promise<DiscoveredItem[]> {
    const cfg = (input as unknown as { config?: ApiSourceConfig }).config;
    if (!cfg?.endpoint) return [];
    const result = await runApiSync({
      endpoint: cfg.endpoint,
      method: cfg.method ?? "GET",
      headers: cfg.headers,
      body: cfg.body,
    });
    if (result.statusCode === 0) {
      throw new Error(
        `Generic API discovery failed for ${cfg.endpoint}: ${result.errorMessage}`,
      );
    }
    return [
      {
        itemType: "api_record",
        sourceUri: cfg.endpoint,
        rawLocation: cfg.endpoint,
        mimeType: "application/json",
        metadata: {
          method: result.method,
          statusCode: result.statusCode,
          durationMs: result.durationMs,
          response: result.responseJson,
        },
      },
    ];
  }

  async acquire(input: AcquireInput): Promise<AcquiredItem[]> {
    const items = await this.discover(input as unknown as DiscoverInput);
    const acquiredAt = new Date().toISOString();
    return items.map((it) => ({ ...it, acquiredAt }));
  }
}
