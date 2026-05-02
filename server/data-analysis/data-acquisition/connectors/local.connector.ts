/**
 * Local filesystem connector.
 *
 * Discovers files in a local directory (`source.config.path`). Always
 * "available" because no external credentials are required.
 */

import { promises as fs } from "fs";
import path from "path";

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

const MAX_DISCOVERY = 1000;

export class LocalFilesystemConnector implements AcquisitionConnector {
  key = "local";
  displayName = "Local Filesystem";
  sourceTypes = ["document", "media", "object_storage"] as const as any;

  async status(): Promise<ConnectorStatusReport> {
    return { status: "available", message: "Local filesystem connector ready." };
  }

  async discover(input: DiscoverInput): Promise<DiscoveredItem[]> {
    const dir = ((input as any).path as string | undefined) ?? process.cwd();
    const items: DiscoveredItem[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (items.length >= MAX_DISCOVERY) break;
        if (!entry.isFile()) continue;
        const full = path.join(dir, entry.name);
        const stat = await fs.stat(full);
        items.push({
          itemType: "document",
          sourceUri: `file://${full}`,
          rawLocation: full,
          sizeBytes: stat.size,
          metadata: { name: entry.name, ext: path.extname(entry.name) },
        });
      }
    } catch (err) {
      // Discovery errors are surfaced via the calling service as a failed run.
      throw new Error(
        `Local discover failed for ${dir}: ${(err as Error).message}`,
      );
    }
    return items;
  }

  async acquire(_input: AcquireInput): Promise<AcquiredItem[]> {
    // Local files are already at their `rawLocation`; "acquire" is a no-op
    // beyond stamping `acquiredAt`. The caller passes the items it already
    // discovered; we just timestamp them.
    const acquiredAt = new Date().toISOString();
    return [];
  }
}
