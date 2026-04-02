/**
 * Code Studio — OpenCode Runtime Configuration
 */

import { OPENCODE_DEFAULT_URL } from "../shared/constants";
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
