/**
 * Code Studio — OpenCode Provider Key Sync
 *
 * Syncs API keys from the app's providers table into OpenCode's
 * auth.json (~/.local/share/opencode/auth.json).
 *
 * This is the single source of truth mechanism:
 *   App DB (providers table) → auth.json → all OpenCode instances
 *
 * Any OpenCode session (Web IDE, job pipeline, manual CLI) on this
 * machine will inherit the keys without needing manual env vars.
 */

import * as fs from "fs";
import * as path from "path";

const AUTH_JSON_PATH = process.env.OPENCODE_AUTH_PATH
  || path.join(process.env.HOME || "/home", ".local/share/opencode/auth.json");

// Map app provider types to OpenCode provider IDs
const PROVIDER_MAP: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  groq: "groq",
};

// Map provider types to the env vars OpenCode serve mode actually reads
const PROVIDER_ENV_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  groq: "GROQ_API_KEY",
};

/**
 * Read provider API keys from the app DB and write them to
 * OpenCode's auth.json. Preserves existing credentials not
 * managed by the app.
 */
export async function syncProviderKeysToOpenCode(): Promise<{
  synced: string[];
  errors: string[];
}> {
  const synced: string[] = [];
  const errors: string[] = [];

  try {
    const { getDb } = await import("../../_core/db");
    const db = getDb();
    const rows = await db.execute(
      `SELECT type, config::text FROM providers WHERE enabled = true`
    ) as any;

    // Read existing auth.json
    let auth: Record<string, any> = {};
    try {
      const raw = fs.readFileSync(AUTH_JSON_PATH, "utf-8");
      auth = JSON.parse(raw);
    } catch { /* no file or invalid — start fresh */ }

    // Sync each provider
    for (const row of rows.rows || rows || []) {
      const appType = row.type as string;
      const ocProvider = PROVIDER_MAP[appType];
      if (!ocProvider) continue;

      try {
        const config = typeof row.config === "string" ? JSON.parse(row.config) : row.config;
        if (config?.apiKey) {
          auth[ocProvider] = { apiKey: config.apiKey };
          synced.push(ocProvider);
        }
      } catch {
        errors.push(`Failed to parse config for ${appType}`);
      }
    }

    // Write auth.json (used by CLI/TUI mode)
    const dir = path.dirname(AUTH_JSON_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(AUTH_JSON_PATH, JSON.stringify(auth, null, 2), "utf-8");

    // Also set env vars on the current process so that any OpenCode serve
    // instance spawned from here inherits the latest keys without restart.
    for (const row of rows.rows || rows || []) {
      const appType = row.type as string;
      const envVar = PROVIDER_ENV_MAP[appType];
      if (!envVar) continue;
      try {
        const config = typeof row.config === "string" ? JSON.parse(row.config) : row.config;
        if (config?.apiKey) {
          process.env[envVar] = config.apiKey;
        }
      } catch { /* skip */ }
    }

  } catch (err: any) {
    errors.push(`DB access failed: ${err.message}`);
  }

  return { synced, errors };
}

/**
 * Check if auth.json has a key for a given provider.
 */
export function hasProviderKey(provider: string): boolean {
  try {
    const raw = fs.readFileSync(AUTH_JSON_PATH, "utf-8");
    const auth = JSON.parse(raw);
    return !!(auth[provider]?.apiKey);
  } catch {
    return false;
  }
}
