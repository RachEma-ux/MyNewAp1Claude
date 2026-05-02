/**
 * Connector registry — lookup by key.
 *
 * Built-in connectors are wired here. Adding a new connector is a
 * one-line entry + a class implementing `AcquisitionConnector`. The
 * registry is in-memory and read-only at runtime.
 */

import { LocalFilesystemConnector } from "./local.connector";
import { ManualFormConnector } from "./manual.connector";
import { WebhookConnector } from "./webhook.connector";
import { createExternalConnector } from "./externalConnector.factory";
import type { AcquisitionConnector } from "./connector.types";

const REGISTRY = new Map<string, AcquisitionConnector>();

function register(connector: AcquisitionConnector) {
  REGISTRY.set(connector.key, connector);
}

// Real connectors
register(new LocalFilesystemConnector());
register(new ManualFormConnector());
register(new WebhookConnector());

// External connectors — report `unconfigured` until env vars are populated.
register(
  createExternalConnector({
    key: "s3",
    displayName: "AWS S3 / S3-compatible Object Storage",
    sourceTypes: ["object_storage", "document", "media"],
    envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET"],
  }),
);
register(
  createExternalConnector({
    key: "gdrive",
    displayName: "Google Drive",
    sourceTypes: ["saas", "document"],
    envVars: ["GDRIVE_CLIENT_ID", "GDRIVE_CLIENT_SECRET", "GDRIVE_REFRESH_TOKEN"],
  }),
);
register(
  createExternalConnector({
    key: "github",
    displayName: "GitHub Repository",
    sourceTypes: ["git"],
    envVars: ["GITHUB_TOKEN"],
  }),
);
register(
  createExternalConnector({
    key: "api",
    displayName: "Generic HTTP API",
    sourceTypes: ["api"],
    envVars: [],
    notes:
      "Generic HTTP API connector — config (auth, base URL) lives on the source row.",
  }),
);
register(
  createExternalConnector({
    key: "database",
    displayName: "External Database / CDC",
    sourceTypes: ["database"],
    envVars: [],
    notes:
      "Connection string + CDC parameters live on the source row; runtime libs (pg, mysql2, etc.) loaded on demand.",
  }),
);
register(
  createExternalConnector({
    key: "sensor",
    displayName: "Sensor / IoT (MQTT/CoAP/AMQP)",
    sourceTypes: ["sensor"],
    envVars: ["SENSOR_BROKER_URL"],
  }),
);
register(
  createExternalConnector({
    key: "stream",
    displayName: "Stream (Kafka / Pulsar / Redis Streams)",
    sourceTypes: ["stream"],
    envVars: ["STREAM_BROKER_URL"],
  }),
);
register(
  createExternalConnector({
    key: "saas",
    displayName: "SaaS Connector (Notion / Slack / Confluence)",
    sourceTypes: ["saas"],
    envVars: [],
    notes:
      "Specific SaaS provider auth lives on the source row; pick provider via config.",
  }),
);
register(
  createExternalConnector({
    key: "web",
    displayName: "Web Crawl / HTTP Scrape",
    sourceTypes: ["web"],
    envVars: [],
    notes:
      "Politeness rules, allowlist, robots.txt enforcement live on the source row.",
  }),
);
register(
  createExternalConnector({
    key: "objectStorage",
    displayName: "Object Storage (generic S3 / Azure Blob / GCS)",
    sourceTypes: ["object_storage"],
    envVars: [],
    notes: "Pick provider via source config.",
  }),
);

export function getConnector(key: string): AcquisitionConnector | undefined {
  return REGISTRY.get(key);
}

export function listConnectors(): AcquisitionConnector[] {
  return Array.from(REGISTRY.values());
}

export function listConnectorKeys(): string[] {
  return Array.from(REGISTRY.keys());
}
