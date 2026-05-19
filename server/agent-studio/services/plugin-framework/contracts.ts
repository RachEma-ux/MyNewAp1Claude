/**
 * Plugin framework — closed contracts.
 *
 * Slice 25 of the no-deferral catalogue (2026-05-19). Opens the V2
 * plugin-framework scope per Phase 26 of the canonical roadmap. This
 * file declares the boundary contracts:
 *   - PluginManifest: what a plugin declares (id, version, permissions,
 *     entry, dependencies)
 *   - PluginCapability: closed taxonomy of what a plugin can do
 *   - PluginInstallRecord: persistence shape for installed plugins
 *   - PluginExecutionRequest / PluginExecutionResult: invocation shape
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - All tool calls go through the existing MCP dispatcher. Plugins
 *     register tool definitions but execute via dispatchMcpToolCall.
 *   - All model calls go through OpenRouter via execute()/stream()/embed().
 *   - All approval-gated actions go through evaluateGovernance().
 *
 * This is the FIRST slice — contracts + a manifest registry + an
 * installed-plugins record. Sandbox execution + dependency resolution
 * + marketplace listing land in follow-on slices (Phase 26-β / γ /
 * δ per the roadmap).
 *
 * ADR: docs/architecture/agent-studio-native-graph-workspace.md
 *      Phase 26 "Plugin framework / marketplace" (V2.x scope).
 */

/**
 * Closed-taxonomy capability surface. A plugin must declare every
 * capability it intends to use; install-time governance gates check
 * the declared set against the workspace's allow-list.
 */
export const PLUGIN_CAPABILITIES = [
  "read_vault",
  "write_vault",
  "read_graph",
  "write_graph",
  "register_tool",
  "register_skill_pack",
  "register_lens",
  "register_cron",
  "read_kb",
  "write_kb",
  "emit_telemetry",
  "consume_telemetry",
] as const;
export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export function isPluginCapability(s: unknown): s is PluginCapability {
  return (
    typeof s === "string" &&
    (PLUGIN_CAPABILITIES as readonly string[]).includes(s)
  );
}

export const PLUGIN_LIFECYCLE_STATUSES = [
  "draft",
  "installed",
  "enabled",
  "disabled",
  "uninstalled",
  "rejected",
] as const;
export type PluginLifecycleStatus =
  (typeof PLUGIN_LIFECYCLE_STATUSES)[number];

/**
 * The declarative manifest a plugin ships in its `plugin.json`. Same
 * shape as the marketplace publish payload but with capability-set
 * + entry-point fields specific to runtime install.
 */
export interface PluginManifest {
  /** Stable plugin identifier (kebab-case, namespace/name format). */
  readonly id: string;
  /** Semver string. */
  readonly version: string;
  readonly displayName: string;
  readonly description?: string;
  readonly author?: string;
  /** Capabilities the plugin will use at runtime. Govenance gate
   *  rejects manifests that declare capabilities not in the workspace
   *  allow-list. */
  readonly capabilities: ReadonlyArray<PluginCapability>;
  /** Plugin entry point — module name within the plugin bundle that
   *  exports `register(ctx)` / `activate(ctx)` / `deactivate(ctx)`. */
  readonly entry: string;
  /** Other plugin ids + min versions this plugin requires. */
  readonly dependencies?: ReadonlyArray<{ id: string; minVersion: string }>;
  /** Whether the plugin's `register` step has side-effects on the
   *  workspace that need to be reversed on uninstall. */
  readonly idempotentRegister?: boolean;
}

/**
 * Persistence shape for an installed plugin. Lives in
 * `ags_installed_plugins` (declared in a future slice — the table
 * isn't shipped here to keep the slice small).
 */
export interface PluginInstallRecord {
  readonly id: number;
  readonly pluginId: string;
  readonly version: string;
  readonly status: PluginLifecycleStatus;
  readonly manifest: PluginManifest;
  readonly installedAt: Date;
  readonly installedByUserId?: number;
  /** Hashed manifest + bundle digest at install time. Drift check
   *  during activation refuses to load a plugin whose bundle has
   *  been swapped underneath. */
  readonly bundleHash: string;
  /** Per-install permission overrides — workspace admin can deny
   *  specific capabilities even if the manifest declares them. */
  readonly grantedCapabilities: ReadonlyArray<PluginCapability>;
}

/**
 * Runtime invocation request for a plugin's `register` / `activate` /
 * `deactivate` hook. The plugin framework is responsible for routing
 * tool-call / model-call / approval-gated actions through the existing
 * single chokepoints; the plugin code itself never reaches `neo4j-driver`,
 * `dispatchMcpToolCall`, or OpenRouter directly.
 */
export interface PluginExecutionRequest {
  readonly install: PluginInstallRecord;
  readonly hook: "register" | "activate" | "deactivate";
  /** Workspace context — passed to the plugin so it can scope its
   *  side-effects. */
  readonly workspaceId: number;
  /** Operator user who triggered this lifecycle transition. */
  readonly triggeredByUserId: number;
}

export interface PluginExecutionResult {
  readonly hook: "register" | "activate" | "deactivate";
  readonly status: "completed" | "failed" | "rejected";
  readonly errorMessage?: string;
  /** Capabilities the plugin actually used during the hook. Caller
   *  cross-checks against `install.grantedCapabilities`; mismatch is
   *  recorded as a `plugin_capability_overreach` failure event. */
  readonly usedCapabilities: ReadonlyArray<PluginCapability>;
  readonly durationMs: number;
}

/**
 * Permission-denied shape. Thrown by the framework when a plugin
 * attempts a capability that's not in `install.grantedCapabilities`.
 */
export class PluginCapabilityDeniedError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly capability: PluginCapability,
  ) {
    super(
      `plugin "${pluginId}" attempted capability "${capability}" which is not in its granted set`,
    );
    this.name = "PluginCapabilityDeniedError";
  }
}
