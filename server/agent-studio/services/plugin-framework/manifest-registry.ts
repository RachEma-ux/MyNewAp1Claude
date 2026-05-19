/**
 * Plugin manifest registry — install-time validation surface.
 *
 * Slice 25 of the no-deferral catalogue (2026-05-19). First piece of
 * the V2 plugin framework Phase 26: validate manifests against the
 * closed capability taxonomy + workspace allow-list before persisting
 * an install record. Pure-validation; no I/O, no DB, no plugin
 * execution — those land in follow-on slices.
 */

import {
  isPluginCapability,
  type PluginCapability,
  type PluginManifest,
} from "./contracts.js";

export interface ManifestValidationOutcome {
  readonly ok: boolean;
  readonly errors: ReadonlyArray<{ field: string; message: string }>;
  /** When ok, the granted capability set after intersecting the
   *  manifest's declared capabilities with the workspace allow-list. */
  readonly grantedCapabilities: ReadonlyArray<PluginCapability>;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}\/[a-z0-9][a-z0-9-]{0,80}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?:\+[a-z0-9.-]+)?$/;

export interface ValidationContext {
  /** Capabilities the workspace admin has pre-approved for plugin
   *  installs. Manifest-declared capabilities outside this set are
   *  ignored (not rejected) — the install is allowed to proceed with
   *  the intersection. */
  readonly workspaceAllowedCapabilities: ReadonlyArray<PluginCapability>;
  /** Manifests of plugins already installed in the workspace — used
   *  to satisfy `dependencies`. */
  readonly installedPlugins: ReadonlyArray<{
    readonly pluginId: string;
    readonly version: string;
  }>;
}

export function validatePluginManifest(
  manifest: unknown,
  ctx: ValidationContext,
): ManifestValidationOutcome {
  const errors: Array<{ field: string; message: string }> = [];

  if (typeof manifest !== "object" || manifest === null) {
    return {
      ok: false,
      errors: [{ field: "(root)", message: "manifest must be an object" }],
      grantedCapabilities: [],
    };
  }
  const m = manifest as Partial<PluginManifest>;

  if (typeof m.id !== "string" || !ID_PATTERN.test(m.id)) {
    errors.push({
      field: "id",
      message:
        "id must match the pattern '<namespace>/<name>' — lowercase letters / digits / hyphens",
    });
  }
  if (typeof m.version !== "string" || !VERSION_PATTERN.test(m.version)) {
    errors.push({
      field: "version",
      message: "version must be a semver string (e.g. '0.1.0')",
    });
  }
  if (typeof m.displayName !== "string" || m.displayName.length === 0) {
    errors.push({ field: "displayName", message: "displayName is required" });
  }
  if (typeof m.entry !== "string" || m.entry.length === 0) {
    errors.push({
      field: "entry",
      message:
        "entry must name the module inside the plugin bundle exposing register / activate / deactivate",
    });
  }
  if (!Array.isArray(m.capabilities)) {
    errors.push({
      field: "capabilities",
      message: "capabilities must be an array (use [] if the plugin needs none)",
    });
  } else {
    for (let i = 0; i < m.capabilities.length; i++) {
      if (!isPluginCapability(m.capabilities[i])) {
        errors.push({
          field: `capabilities[${i}]`,
          message: `unknown capability "${String(m.capabilities[i])}" — not in the closed taxonomy`,
        });
      }
    }
  }
  if (m.dependencies !== undefined) {
    if (!Array.isArray(m.dependencies)) {
      errors.push({
        field: "dependencies",
        message: "dependencies must be an array of { id, minVersion }",
      });
    } else {
      for (let i = 0; i < m.dependencies.length; i++) {
        const d = m.dependencies[i] as { id?: unknown; minVersion?: unknown };
        if (typeof d?.id !== "string" || typeof d?.minVersion !== "string") {
          errors.push({
            field: `dependencies[${i}]`,
            message: "each dependency must declare { id: string, minVersion: string }",
          });
          continue;
        }
        const installed = ctx.installedPlugins.find((p) => p.pluginId === d.id);
        if (!installed) {
          errors.push({
            field: `dependencies[${i}]`,
            message: `required dependency "${d.id}" is not installed in this workspace`,
          });
        } else if (compareSemver(installed.version, d.minVersion) < 0) {
          errors.push({
            field: `dependencies[${i}]`,
            message: `dependency "${d.id}" installed at v${installed.version}; manifest requires ≥ v${d.minVersion}`,
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, grantedCapabilities: [] };
  }

  const declared = (m.capabilities ?? []) as ReadonlyArray<PluginCapability>;
  const allowed = new Set(ctx.workspaceAllowedCapabilities);
  const granted = declared.filter((c) => allowed.has(c));

  return { ok: true, errors: [], grantedCapabilities: granted };
}

/**
 * Strict semver comparison for the dependency resolver. Returns
 * negative if a < b, 0 if equal, positive if a > b. Pre-release tags
 * are compared as plain strings — sufficient for the install-time
 * dependency check; full semver semantics aren't needed here.
 */
function compareSemver(a: string, b: string): number {
  const splitA = a.split(/[-+]/)[0]?.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const splitB = b.split(/[-+]/)[0]?.split(".").map((n) => Number.parseInt(n, 10) || 0);
  if (!splitA || !splitB) return 0;
  for (let i = 0; i < 3; i++) {
    const x = splitA[i] ?? 0;
    const y = splitB[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export { compareSemver as _compareSemverForTests };
