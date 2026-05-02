/**
 * Webhook / event acquisition connector.
 *
 * Items arrive via HTTP webhooks. This connector exposes a "ready"
 * status (no external dependency) and accepts inline payloads passed
 * through the public-API `runAcquisition` action when an HTTP receiver
 * is wired in front of it.
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

export class WebhookConnector implements AcquisitionConnector {
  key = "webhook";
  displayName = "Webhook / Event";
  sourceTypes = ["webhook"] as any;

  async status(): Promise<ConnectorStatusReport> {
    return {
      status: "available",
      message:
        "Webhook connector ready. HTTP receiver routes to runAcquisition.",
    };
  }

  async discover(_input: DiscoverInput): Promise<DiscoveredItem[]> {
    return [];
  }

  async acquire(input: AcquireInput): Promise<AcquiredItem[]> {
    const inline = ((input as any).payload as DiscoveredItem[] | undefined) ?? [];
    const acquiredAt = new Date().toISOString();
    return inline.map((item) => ({
      ...item,
      itemType: item.itemType ?? "webhook_event",
      acquiredAt,
    }));
  }
}
