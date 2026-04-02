/**
 * Code Studio — OpenCode Config Generator
 *
 * Generates normalized opencode.json and tui.json payloads
 * from Code Studio profile state. Handles secret redaction for previews.
 */

const SENSITIVE_KEY_PATTERNS = [
  "password", "secret", "token", "key", "apikey", "api_key",
  "apisecret", "accesstoken", "refreshtoken", "credentials",
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Generate a normalized opencode.json config from a draft profile.
 * Strips undefined/null values and empty objects for a clean output.
 */
export function generateRuntimeConfig(draft: Record<string, any>): Record<string, any> {
  const config: Record<string, any> = {};

  // $schema
  config.$schema = "https://opencode.ai/config.json";

  // Simple scalar fields
  const scalarFields = [
    "logLevel", "model", "small_model", "default_agent",
    "share", "snapshot", "autoupdate", "username",
  ];
  for (const field of scalarFields) {
    if (draft[field] !== undefined && draft[field] !== null && draft[field] !== "") {
      config[field] = draft[field];
    }
  }

  // Array fields
  const arrayFields = ["disabled_providers", "enabled_providers", "instructions", "plugin"];
  for (const field of arrayFields) {
    if (Array.isArray(draft[field]) && draft[field].length > 0) {
      config[field] = draft[field];
    }
  }

  // Object sections — include if non-empty
  const objectSections = [
    "server", "provider", "agent", "command", "formatter",
    "permission", "compaction", "watcher", "mcp", "skills", "experimental",
  ];
  for (const section of objectSections) {
    if (draft[section] && typeof draft[section] === "object" && Object.keys(draft[section]).length > 0) {
      config[section] = draft[section];
    }
  }

  return config;
}

/**
 * Generate a normalized tui.json config from a draft profile.
 */
export function generateTuiConfig(draft: Record<string, any>): Record<string, any> {
  const config: Record<string, any> = {};

  config.$schema = "https://opencode.ai/tui.json";

  if (draft.theme !== undefined && draft.theme !== "") {
    config.theme = draft.theme;
  }
  if (draft.diff_style !== undefined && draft.diff_style !== "") {
    config.diff_style = draft.diff_style;
  }
  if (draft.scroll_speed !== undefined && draft.scroll_speed !== null) {
    config.scroll_speed = draft.scroll_speed;
  }
  if (draft.scroll_acceleration && typeof draft.scroll_acceleration === "object") {
    config.scroll_acceleration = draft.scroll_acceleration;
  }
  if (draft.keybinds && typeof draft.keybinds === "object" && Object.keys(draft.keybinds).length > 0) {
    config.keybinds = draft.keybinds;
  }
  if (Array.isArray(draft.plugin) && draft.plugin.length > 0) {
    config.plugin = draft.plugin;
  }
  if (draft.plugin_enabled && typeof draft.plugin_enabled === "object" && Object.keys(draft.plugin_enabled).length > 0) {
    config.plugin_enabled = draft.plugin_enabled;
  }

  return config;
}

/**
 * Redact sensitive values in a config object for preview/logging.
 * Uses the {{secret:...}} reference pattern from the platform secrets system.
 */
export function redactConfigSecrets(config: Record<string, any>): Record<string, any> {
  return redactDeep(config);
}

function redactDeep(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    // Redact secret references
    if (/^\{\{secret:[a-zA-Z0-9_-]+\}\}$/.test(obj)) {
      return "***REDACTED***";
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactDeep);
  }
  if (typeof obj !== "object") return obj;

  const redacted: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key) && typeof value === "string") {
      redacted[key] = "***REDACTED***";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactDeep(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Convert generated config to JSONC string for display/download.
 */
export function configToJsonc(config: Record<string, any>, comment?: string): string {
  const header = comment ? `// ${comment}\n` : "";
  return header + JSON.stringify(config, null, 2);
}
