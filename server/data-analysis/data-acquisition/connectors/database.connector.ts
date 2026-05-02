/**
 * Generic external database / CDC connector.
 *
 * No global env vars — connection strings + CDC settings live on the
 * source row's `configJson`. Actual DB connections (pg, mysql2,
 * mongodb, etc.) and CDC stream consumers (Debezium, wal2json) run on
 * the worker.
 *
 * Reports `available` because per-source connection-string validation
 * happens at acquire time.
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

export class ExternalDatabaseConnector implements AcquisitionConnector {
  key = "database";
  displayName = "External Database / CDC";
  sourceTypes = ["database"] as any;
  envVars = [] as string[];
  notes = "Connection string + CDC parameters live on the source row.";

  async status(): Promise<ConnectorStatusReport> {
    return {
      status: "available",
      message: "External database connector available — config per source.",
    };
  }

  async discover(_input: DiscoverInput): Promise<DiscoveredItem[]> {
    // Schema introspection runs on the worker.
    return [];
  }

  async acquire(_input: AcquireInput): Promise<AcquiredItem[]> {
    return [];
  }
}
