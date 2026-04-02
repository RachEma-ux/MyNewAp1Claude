/**
 * Code Studio — OpenCode Runtime Configuration
 */

import { OPENCODE_DEFAULT_URL } from "../shared/constants";
import { getSetting } from "../repository";
import type { OpenCodeConfig } from "./types";

export function getOpenCodeConfig(): OpenCodeConfig {
  return {
    url: process.env.OPENCODE_URL || OPENCODE_DEFAULT_URL,
    username: process.env.OPENCODE_SERVER_USERNAME || "opencode",
    password: process.env.OPENCODE_SERVER_PASSWORD || "",
  };
}

export function getOpenCodeBaseUrl(): string {
  return getOpenCodeConfig().url;
}

export function getOpenCodeAuthHeaders(): Record<string, string> {
  const config = getOpenCodeConfig();
  if (!config.password) return {};
  const encoded = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  return { Authorization: `Basic ${encoded}` };
}

/**
 * Read the user-selected provider config from the code_settings table.
 * Returns null if no provider has been configured yet.
 */
export async function getProviderConfig(): Promise<{
  catalogImportId: number;
  name: string;
  config: Record<string, any>;
} | null> {
  const row = await getSetting("opencode_provider");
  if (!row || !row.value) return null;
  const val = row.value as any;
  if (!val.catalogImportId || !val.name) return null;
  return {
    catalogImportId: val.catalogImportId,
    name: val.name,
    config: val.config ?? {},
  };
}
