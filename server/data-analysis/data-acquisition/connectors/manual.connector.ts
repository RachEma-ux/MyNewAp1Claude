/**
 * Manual / form acquisition connector.
 *
 * Items are submitted via the public-API `runAcquisition` action with
 * an inline payload (`config.payload`). No external system; always
 * available.
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

export class ManualFormConnector implements AcquisitionConnector {
  key = "manual";
  displayName = "Manual / Form";
  sourceTypes = ["manual_form"] as any;

  async status(): Promise<ConnectorStatusReport> {
    return { status: "available", message: "Manual connector ready." };
  }

  async discover(_input: DiscoverInput): Promise<DiscoveredItem[]> {
    // Manual sources don't auto-discover; users push items.
    return [];
  }

  async acquire(input: AcquireInput): Promise<AcquiredItem[]> {
    const inline = ((input as any).payload as DiscoveredItem[] | undefined) ?? [];
    const acquiredAt = new Date().toISOString();
    return inline.map((item) => ({
      ...item,
      itemType: item.itemType ?? "form_submission",
      acquiredAt,
    }));
  }
}
