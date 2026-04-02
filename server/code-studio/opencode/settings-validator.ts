/**
 * Code Studio — OpenCode Settings Validator
 *
 * Validates OpenCode runtime and TUI config against known schema rules.
 * Based on https://opencode.ai/config.json and https://opencode.ai/tui.json
 */

export interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ── Runtime Config Validation ─────────────────────────────────────────────

const LOG_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"];
const SHARE_MODES = ["manual", "auto", "disabled"];
const PERMISSION_ACTIONS = ["ask", "allow", "deny"];
const AGENT_MODES = ["primary", "subagent", "all"];

export function validateRuntimeConfig(config: Record<string, any>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!config || typeof config !== "object") {
    errors.push({ path: "", message: "Config must be an object", severity: "error" });
    return { valid: false, errors, warnings };
  }

  // logLevel
  if (config.logLevel !== undefined) {
    if (typeof config.logLevel !== "string" || !LOG_LEVELS.includes(config.logLevel)) {
      errors.push({ path: "logLevel", message: `Must be one of: ${LOG_LEVELS.join(", ")}`, severity: "error" });
    }
  }

  // model / small_model
  for (const field of ["model", "small_model"]) {
    if (config[field] !== undefined) {
      if (typeof config[field] !== "string") {
        errors.push({ path: field, message: "Must be a string (format: provider/model-id)", severity: "error" });
      } else if (!config[field].includes("/")) {
        warnings.push({ path: field, message: "Expected format: provider/model-id", severity: "warning" });
      }
    }
  }

  // default_agent
  if (config.default_agent !== undefined && typeof config.default_agent !== "string") {
    errors.push({ path: "default_agent", message: "Must be a string", severity: "error" });
  }

  // share
  if (config.share !== undefined) {
    if (typeof config.share !== "string" || !SHARE_MODES.includes(config.share)) {
      errors.push({ path: "share", message: `Must be one of: ${SHARE_MODES.join(", ")}`, severity: "error" });
    }
  }

  // snapshot
  if (config.snapshot !== undefined && typeof config.snapshot !== "boolean") {
    errors.push({ path: "snapshot", message: "Must be a boolean", severity: "error" });
  }

  // autoupdate
  if (config.autoupdate !== undefined) {
    if (typeof config.autoupdate !== "boolean" && config.autoupdate !== "notify") {
      errors.push({ path: "autoupdate", message: 'Must be boolean or "notify"', severity: "error" });
    }
  }

  // server
  if (config.server !== undefined) {
    validateServerConfig(config.server, errors, warnings);
  }

  // provider
  if (config.provider !== undefined) {
    validateProviderConfig(config.provider, errors, warnings);
  }

  // agent
  if (config.agent !== undefined) {
    validateAgentConfig(config.agent, errors, warnings);
  }

  // permission
  if (config.permission !== undefined) {
    validatePermissionConfig(config.permission, errors, warnings);
  }

  // compaction
  if (config.compaction !== undefined) {
    validateCompactionConfig(config.compaction, errors, warnings);
  }

  // watcher
  if (config.watcher !== undefined) {
    if (config.watcher.ignore !== undefined && !Array.isArray(config.watcher.ignore)) {
      errors.push({ path: "watcher.ignore", message: "Must be an array of glob strings", severity: "error" });
    }
  }

  // mcp
  if (config.mcp !== undefined && typeof config.mcp !== "object") {
    errors.push({ path: "mcp", message: "Must be an object", severity: "error" });
  }

  // plugin
  if (config.plugin !== undefined && !Array.isArray(config.plugin)) {
    errors.push({ path: "plugin", message: "Must be an array", severity: "error" });
  }

  // instructions
  if (config.instructions !== undefined && !Array.isArray(config.instructions)) {
    errors.push({ path: "instructions", message: "Must be an array of path strings", severity: "error" });
  }

  // disabled_providers / enabled_providers
  for (const field of ["disabled_providers", "enabled_providers"]) {
    if (config[field] !== undefined && !Array.isArray(config[field])) {
      errors.push({ path: field, message: "Must be an array of provider IDs", severity: "error" });
    }
  }

  // command
  if (config.command !== undefined) {
    validateCommandConfig(config.command, errors, warnings);
  }

  // formatter
  if (config.formatter !== undefined && typeof config.formatter !== "object") {
    errors.push({ path: "formatter", message: "Must be an object", severity: "error" });
  }

  // skills
  if (config.skills !== undefined) {
    if (typeof config.skills !== "object") {
      errors.push({ path: "skills", message: "Must be an object", severity: "error" });
    } else {
      if (config.skills.paths !== undefined && !Array.isArray(config.skills.paths)) {
        errors.push({ path: "skills.paths", message: "Must be an array of paths", severity: "error" });
      }
      if (config.skills.urls !== undefined && !Array.isArray(config.skills.urls)) {
        errors.push({ path: "skills.urls", message: "Must be an array of URLs", severity: "error" });
      }
    }
  }

  // experimental
  if (config.experimental !== undefined && typeof config.experimental !== "object") {
    errors.push({ path: "experimental", message: "Must be an object", severity: "error" });
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateServerConfig(server: any, errors: ValidationError[], warnings: ValidationError[]) {
  if (typeof server !== "object") {
    errors.push({ path: "server", message: "Must be an object", severity: "error" });
    return;
  }
  if (server.port !== undefined) {
    if (typeof server.port !== "number" || server.port < 1 || server.port > 65535) {
      errors.push({ path: "server.port", message: "Must be a number between 1 and 65535", severity: "error" });
    }
  }
  if (server.hostname !== undefined && typeof server.hostname !== "string") {
    errors.push({ path: "server.hostname", message: "Must be a string", severity: "error" });
  }
  if (server.mdns !== undefined && typeof server.mdns !== "boolean") {
    errors.push({ path: "server.mdns", message: "Must be a boolean", severity: "error" });
  }
  if (server.mdnsDomain !== undefined && typeof server.mdnsDomain !== "string") {
    errors.push({ path: "server.mdnsDomain", message: "Must be a string", severity: "error" });
  }
  if (server.cors !== undefined && !Array.isArray(server.cors)) {
    errors.push({ path: "server.cors", message: "Must be an array of origin URLs", severity: "error" });
  }
}

function validateProviderConfig(provider: any, errors: ValidationError[], warnings: ValidationError[]) {
  if (typeof provider !== "object") {
    errors.push({ path: "provider", message: "Must be an object", severity: "error" });
    return;
  }
  for (const [key, val] of Object.entries(provider)) {
    if (typeof val !== "object" || val === null) {
      errors.push({ path: `provider.${key}`, message: "Each provider must be an object", severity: "error" });
      continue;
    }
    const p = val as Record<string, any>;
    if (p.options?.timeout !== undefined) {
      if (typeof p.options.timeout !== "number" && p.options.timeout !== false) {
        errors.push({ path: `provider.${key}.options.timeout`, message: "Must be a number or false", severity: "error" });
      }
    }
  }
}

function validateAgentConfig(agent: any, errors: ValidationError[], warnings: ValidationError[]) {
  if (typeof agent !== "object") {
    errors.push({ path: "agent", message: "Must be an object", severity: "error" });
    return;
  }
  for (const [key, val] of Object.entries(agent)) {
    if (typeof val !== "object" || val === null) {
      errors.push({ path: `agent.${key}`, message: "Each agent must be an object", severity: "error" });
      continue;
    }
    const a = val as Record<string, any>;
    if (a.mode !== undefined && !AGENT_MODES.includes(a.mode)) {
      errors.push({ path: `agent.${key}.mode`, message: `Must be one of: ${AGENT_MODES.join(", ")}`, severity: "error" });
    }
    if (a.temperature !== undefined) {
      if (typeof a.temperature !== "number" || a.temperature < 0 || a.temperature > 1) {
        errors.push({ path: `agent.${key}.temperature`, message: "Must be a number between 0 and 1", severity: "error" });
      }
    }
    if (a.top_p !== undefined) {
      if (typeof a.top_p !== "number" || a.top_p < 0 || a.top_p > 1) {
        errors.push({ path: `agent.${key}.top_p`, message: "Must be a number between 0 and 1", severity: "error" });
      }
    }
    if (a.steps !== undefined && (typeof a.steps !== "number" || a.steps < 1)) {
      errors.push({ path: `agent.${key}.steps`, message: "Must be a positive number", severity: "error" });
    }
    if (a.disable !== undefined && typeof a.disable !== "boolean") {
      errors.push({ path: `agent.${key}.disable`, message: "Must be a boolean", severity: "error" });
    }
    if (a.hidden !== undefined && typeof a.hidden !== "boolean") {
      errors.push({ path: `agent.${key}.hidden`, message: "Must be a boolean", severity: "error" });
    }
  }
}

function validatePermissionConfig(permission: any, errors: ValidationError[], warnings: ValidationError[]) {
  if (typeof permission === "string") {
    if (!PERMISSION_ACTIONS.includes(permission)) {
      errors.push({ path: "permission", message: `Global permission must be one of: ${PERMISSION_ACTIONS.join(", ")}`, severity: "error" });
    }
    return;
  }
  if (typeof permission !== "object") {
    errors.push({ path: "permission", message: "Must be a string or object", severity: "error" });
    return;
  }
  for (const [key, val] of Object.entries(permission)) {
    if (typeof val === "string") {
      if (!PERMISSION_ACTIONS.includes(val)) {
        errors.push({ path: `permission.${key}`, message: `Must be one of: ${PERMISSION_ACTIONS.join(", ")}`, severity: "error" });
      }
    } else if (typeof val === "object" && val !== null) {
      // Nested pattern-based rules
      for (const [pattern, action] of Object.entries(val as Record<string, any>)) {
        if (typeof action !== "string" || !PERMISSION_ACTIONS.includes(action)) {
          errors.push({ path: `permission.${key}.${pattern}`, message: `Must be one of: ${PERMISSION_ACTIONS.join(", ")}`, severity: "error" });
        }
      }
    } else {
      errors.push({ path: `permission.${key}`, message: "Must be a string or pattern object", severity: "error" });
    }
  }
}

function validateCompactionConfig(compaction: any, errors: ValidationError[], warnings: ValidationError[]) {
  if (typeof compaction !== "object") {
    errors.push({ path: "compaction", message: "Must be an object", severity: "error" });
    return;
  }
  if (compaction.auto !== undefined && typeof compaction.auto !== "boolean") {
    errors.push({ path: "compaction.auto", message: "Must be a boolean", severity: "error" });
  }
  if (compaction.prune !== undefined && typeof compaction.prune !== "boolean") {
    errors.push({ path: "compaction.prune", message: "Must be a boolean", severity: "error" });
  }
  if (compaction.reserved !== undefined) {
    if (typeof compaction.reserved !== "number" || compaction.reserved < 0) {
      errors.push({ path: "compaction.reserved", message: "Must be a non-negative number", severity: "error" });
    }
  }
}

function validateCommandConfig(command: any, errors: ValidationError[], warnings: ValidationError[]) {
  if (typeof command !== "object") {
    errors.push({ path: "command", message: "Must be an object", severity: "error" });
    return;
  }
  for (const [key, val] of Object.entries(command)) {
    if (typeof val !== "object" || val === null) {
      errors.push({ path: `command.${key}`, message: "Each command must be an object", severity: "error" });
      continue;
    }
    const c = val as Record<string, any>;
    if (!c.template || typeof c.template !== "string") {
      errors.push({ path: `command.${key}.template`, message: "Template is required and must be a string", severity: "error" });
    }
  }
}

// ── TUI Config Validation ─────────────────────────────────────────────────

const DIFF_STYLES = ["auto", "stacked"];

export function validateTuiConfig(config: Record<string, any>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!config || typeof config !== "object") {
    errors.push({ path: "", message: "TUI config must be an object", severity: "error" });
    return { valid: false, errors, warnings };
  }

  // theme
  if (config.theme !== undefined && typeof config.theme !== "string") {
    errors.push({ path: "theme", message: "Must be a string", severity: "error" });
  }

  // diff_style
  if (config.diff_style !== undefined) {
    if (typeof config.diff_style !== "string" || !DIFF_STYLES.includes(config.diff_style)) {
      errors.push({ path: "diff_style", message: `Must be one of: ${DIFF_STYLES.join(", ")}`, severity: "error" });
    }
  }

  // scroll_speed
  if (config.scroll_speed !== undefined) {
    if (typeof config.scroll_speed !== "number" || config.scroll_speed < 0.001) {
      errors.push({ path: "scroll_speed", message: "Must be a number >= 0.001", severity: "error" });
    }
  }

  // scroll_acceleration
  if (config.scroll_acceleration !== undefined) {
    if (typeof config.scroll_acceleration !== "object") {
      errors.push({ path: "scroll_acceleration", message: "Must be an object", severity: "error" });
    } else if (config.scroll_acceleration.enabled !== undefined && typeof config.scroll_acceleration.enabled !== "boolean") {
      errors.push({ path: "scroll_acceleration.enabled", message: "Must be a boolean", severity: "error" });
    }
  }

  // keybinds
  if (config.keybinds !== undefined) {
    if (typeof config.keybinds !== "object") {
      errors.push({ path: "keybinds", message: "Must be an object", severity: "error" });
    } else {
      for (const [key, val] of Object.entries(config.keybinds)) {
        if (typeof val !== "string") {
          errors.push({ path: `keybinds.${key}`, message: "Each keybind must be a string", severity: "error" });
        }
      }
    }
  }

  // plugin / plugin_enabled
  if (config.plugin !== undefined && !Array.isArray(config.plugin)) {
    errors.push({ path: "plugin", message: "Must be an array", severity: "error" });
  }
  if (config.plugin_enabled !== undefined && typeof config.plugin_enabled !== "object") {
    errors.push({ path: "plugin_enabled", message: "Must be an object", severity: "error" });
  }

  return { valid: errors.length === 0, errors, warnings };
}
