/**
 * Helper for external-system connectors that require credentials.
 *
 * They never fake success — when their env vars are missing they
 * report `unconfigured` and discover/acquire return empty arrays
 * accompanied by a thrown error explaining the missing config (so
 * the calling service records a `failed`/`degraded` run row).
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
import type { SourceType } from "../dataAcquisition.constants";

export function createExternalConnector(opts: {
  key: string;
  displayName: string;
  sourceTypes: SourceType[];
  envVars: string[];
  notes?: string;
}): AcquisitionConnector {
  const missing = () =>
    opts.envVars.filter((envVar) => !process.env[envVar]);

  return {
    key: opts.key,
    displayName: opts.displayName,
    sourceTypes: opts.sourceTypes,
    envVars: opts.envVars,
    notes: opts.notes,

    async status(): Promise<ConnectorStatusReport> {
      const m = missing();
      if (m.length > 0) {
        return {
          status: "unconfigured",
          message: `${opts.displayName} connector requires env vars: ${m.join(
            ", ",
          )}.`,
        };
      }
      return {
        status: "available",
        message: `${opts.displayName} connector configured.`,
      };
    },

    async discover(_input: DiscoverInput): Promise<DiscoveredItem[]> {
      const m = missing();
      if (m.length > 0) {
        throw new Error(
          `${opts.displayName} connector unconfigured — missing env vars: ${m.join(
            ", ",
          )}`,
        );
      }
      // No real client implemented in this PR — discovery returns empty
      // until the connector implementation lands. This is intentional:
      // we never fake successful integration with external systems.
      return [];
    },

    async acquire(_input: AcquireInput): Promise<AcquiredItem[]> {
      const m = missing();
      if (m.length > 0) {
        throw new Error(
          `${opts.displayName} connector unconfigured — missing env vars: ${m.join(
            ", ",
          )}`,
        );
      }
      return [];
    },
  };
}
