/**
 * Acquisition connector contract.
 *
 * Real connectors (local, manual, webhook) implement `discover` /
 * `acquire` against actual local resources. External-system
 * connectors (S3, Google Drive, GitHub, Kafka, MQTT, Notion, Slack,
 * Confluence) report `status: "unconfigured"` until their env vars
 * are populated and never fake successful integration.
 */

import type {
  ConnectorStatus,
  SourceType,
} from "../dataAcquisition.constants";
import type {
  AcquireInput,
  AcquiredItem,
  DiscoverInput,
  DiscoveredItem,
} from "../dataAcquisition.types";

export interface ConnectorStatusReport {
  status: ConnectorStatus;
  message: string;
  url?: string;
}

export interface AcquisitionConnector {
  /** Stable connector key, e.g. `local`, `s3`, `github`. */
  key: string;
  /** Source types this connector serves. */
  sourceTypes: SourceType[];
  /** Human label. */
  displayName: string;
  /** Env vars this connector consults (used for unconfigured detection). */
  envVars?: string[];
  /** Free-form notes (worker dependency, etc.). */
  notes?: string;

  /** Cheap status probe — never throws. */
  status(): Promise<ConnectorStatusReport>;
  /** Discover items the source exposes. */
  discover(input: DiscoverInput): Promise<DiscoveredItem[]>;
  /** Acquire content for items already discovered. */
  acquire(input: AcquireInput): Promise<AcquiredItem[]>;
}
