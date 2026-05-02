/**
 * Web crawl / HTTP scrape connector.
 *
 * No env vars by default; politeness rules, allowlist, robots.txt
 * enforcement live on the source row's `configJson`. The connector
 * uses the `pipelines/web/crawler.ts` primitive (global `fetch`) for
 * single-page fetches; multi-page crawls happen on the worker.
 */

import { fetchPage } from "../pipelines/web/crawler";
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

export interface WebSourceConfig {
  startUrl: string;
  allowlist?: string[];
  userAgent?: string;
  timeoutMs?: number;
}

export class WebConnector implements AcquisitionConnector {
  key = "web";
  displayName = "Web Crawl / HTTP Scrape";
  sourceTypes = ["web"] as any;
  envVars = [] as string[];
  notes = "Single-page fetch via fetchPage(); recursive crawl runs on the worker.";

  async status(): Promise<ConnectorStatusReport> {
    return {
      status: "available",
      message: "Web connector available — config per source.",
    };
  }

  async discover(input: DiscoverInput): Promise<DiscoveredItem[]> {
    const cfg = (input as unknown as { config?: WebSourceConfig }).config;
    if (!cfg?.startUrl) return [];
    const res = await fetchPage({
      url: cfg.startUrl,
      userAgent: cfg.userAgent,
      timeoutMs: cfg.timeoutMs,
    });
    if (res.httpStatus === 0) {
      throw new Error(
        `Web connector fetch failed for ${cfg.startUrl}: ${res.errorMessage}`,
      );
    }
    return [
      {
        itemType: "web_page",
        sourceUri: cfg.startUrl,
        rawLocation: cfg.startUrl,
        sizeBytes: res.contentLength,
        mimeType: "text/html",
        metadata: {
          httpStatus: res.httpStatus,
          fetchedAt: res.fetchedAt.toISOString(),
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
