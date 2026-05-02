/**
 * Connector registry — lookup by key.
 *
 * Built-in connectors are registered as standalone classes (Phase-2).
 * Real connectors (`local`, `manual`, `webhook`) implement discovery /
 * acquire against actual local resources. External-system connectors
 * (`s3`, `gdrive`, `github`, `api`, `database`, `sensor`, `stream`,
 * `saas`, `web`, `objectStorage`) report `unconfigured` cleanly when
 * env vars / per-source config is missing — and never fake success.
 *
 * The factory in `externalConnector.factory.ts` remains exported for
 * tests + ad-hoc registrations; it is no longer the default builder.
 */

import { LocalFilesystemConnector } from "./local.connector";
import { ManualFormConnector } from "./manual.connector";
import { WebhookConnector } from "./webhook.connector";
import { S3Connector } from "./s3.connector";
import { GoogleDriveConnector } from "./gdrive.connector";
import { GitHubConnector } from "./github.connector";
import { GenericApiConnector } from "./api.connector";
import { ExternalDatabaseConnector } from "./database.connector";
import { SensorConnector } from "./sensor.connector";
import { StreamConnector } from "./stream.connector";
import { SaasConnector } from "./saas.connector";
import { WebConnector } from "./web.connector";
import { ObjectStorageConnector } from "./objectStorage.connector";
import type { AcquisitionConnector } from "./connector.types";

const REGISTRY = new Map<string, AcquisitionConnector>();

function register(connector: AcquisitionConnector) {
  REGISTRY.set(connector.key, connector);
}

// Real connectors
register(new LocalFilesystemConnector());
register(new ManualFormConnector());
register(new WebhookConnector());

// External connectors — each declares its own env vars + status logic.
register(new S3Connector());
register(new GoogleDriveConnector());
register(new GitHubConnector());
register(new GenericApiConnector());
register(new ExternalDatabaseConnector());
register(new SensorConnector());
register(new StreamConnector());
register(new SaasConnector());
register(new WebConnector());
register(new ObjectStorageConnector());

export function getConnector(key: string): AcquisitionConnector | undefined {
  return REGISTRY.get(key);
}

export function listConnectors(): AcquisitionConnector[] {
  return Array.from(REGISTRY.values());
}

export function listConnectorKeys(): string[] {
  return Array.from(REGISTRY.keys());
}
