/**
 * Source connector registry — D-UI-1 layer #1.
 *
 * Only one default connector ships in MVP: `inline_buffer` — the caller
 * passes raw bytes + content-type directly. This is enough for:
 *   - file uploads (the upload endpoint hands bytes to the service)
 *   - test fixtures
 *   - tRPC mutations that accept base64 / utf-8 payloads
 *
 * Future connectors (HTTP fetch, MCP source, S3, Drive) plug in here
 * without touching the upper layers.
 */

import { createHash } from "crypto";
import type { SourceConnector, SourceConnectorInput, RawArtifact } from "./types";

export const inlineBufferConnector: SourceConnector = {
  key: "inline_buffer",
  description:
    "Direct byte-injection connector — the caller hands the bytes; no fetch happens. Used by file-upload endpoints + tests.",
  async fetch(input: SourceConnectorInput): Promise<RawArtifact> {
    const cfg = input.config as {
      bytes?: Buffer | string | Uint8Array;
      bytesBase64?: string;
      contentType?: string;
      sourceUri?: string | null;
      metadata?: Record<string, unknown>;
    };
    const bytes = resolveBytes(cfg);
    if (!bytes) {
      throw new Error(
        "inline_buffer connector requires `bytes`, a Uint8Array, a string, or `bytesBase64` on config",
      );
    }
    const contentType = cfg.contentType ?? "application/octet-stream";
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    return {
      bytes,
      contentType,
      sourceUri: cfg.sourceUri ?? null,
      contentHash,
      metadata: cfg.metadata ?? {},
    };
  },
};

function resolveBytes(cfg: {
  bytes?: Buffer | string | Uint8Array;
  bytesBase64?: string;
}): Buffer | null {
  if (cfg.bytes instanceof Buffer) return cfg.bytes;
  if (cfg.bytes instanceof Uint8Array) return Buffer.from(cfg.bytes);
  if (typeof cfg.bytes === "string") return Buffer.from(cfg.bytes, "utf-8");
  if (typeof cfg.bytesBase64 === "string") {
    return Buffer.from(cfg.bytesBase64, "base64");
  }
  return null;
}

const connectors = new Map<string, SourceConnector>();

export function registerSourceConnector(connector: SourceConnector): void {
  connectors.set(connector.key, connector);
}

export function clearSourceConnectors(): void {
  connectors.clear();
}

export function getSourceConnector(key: string): SourceConnector | undefined {
  return connectors.get(key);
}

export function listSourceConnectors(): ReadonlyArray<SourceConnector> {
  return [...connectors.values()];
}

let defaultsRegistered = false;

export function registerDefaultSourceConnectors(): void {
  if (defaultsRegistered) return;
  registerSourceConnector(inlineBufferConnector);
  defaultsRegistered = true;
}

export function resetSourceConnectorsToDefaults(): void {
  clearSourceConnectors();
  defaultsRegistered = false;
  registerDefaultSourceConnectors();
}
