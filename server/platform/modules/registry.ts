/**
 * Module Registry — Platform Modular
 *
 * The registry holds module manifests and exposes read-only views of
 * module metadata, runtime state, and health.
 *
 * It is intentionally synchronous and side-effect-free. The Runtime
 * Manager is responsible for boot/health side effects.
 *
 * Note: this is the *platform-modular* registry. There is a separate
 * legacy "workspace modules" concept under `server/modules/registry.ts`
 * — that one tracks per-workspace module enablement (PMT, Knowledge,
 * Agents, etc.) and is unrelated. Both can coexist.
 */

import type {
  ModuleKey,
  ModuleManifest,
  ModuleRuntimeState,
  ModuleRuntimeStateName,
  ModuleHealthReport,
} from "./types";
import { getPortRegistry } from "../ports";
import { registerDefaultPortDeclarations } from "../ports/default-declarations";

class ModuleRegistry {
  private manifests = new Map<ModuleKey, ModuleManifest>();
  private states = new Map<ModuleKey, ModuleRuntimeState>();
  private portsSeeded = false;

  register(manifest: ModuleManifest): void {
    if (!manifest.key) {
      throw new Error("[ModuleRegistry] Manifest missing 'key'");
    }
    if (this.manifests.has(manifest.key)) {
      const existing = this.manifests.get(manifest.key);
      if (existing && existing.version === manifest.version) {
        // Idempotent re-register (e.g. tsx watch-mode re-import).
        return;
      }
      throw new Error(
        `[ModuleRegistry] Duplicate manifest for '${manifest.key}' (existing v${existing?.version}, new v${manifest.version})`,
      );
    }
    this.validate(manifest);
    this.manifests.set(manifest.key, manifest);
    this.states.set(manifest.key, {
      key: manifest.key,
      state: this.isEnabled(manifest) ? "registered" : "disabled",
    });
    this.seedPortRegistry();
    this.registerManifestPorts(manifest);
  }

  registerAll(manifests: Iterable<ModuleManifest>): void {
    for (const m of manifests) this.register(m);
  }

  get(key: ModuleKey): ModuleManifest | undefined {
    return this.manifests.get(key);
  }

  list(): ModuleManifest[] {
    return [...this.manifests.values()];
  }

  /** All modules excluding the disabled ones. */
  listEnabled(): ModuleManifest[] {
    return this.list().filter((m) => this.isEnabled(m));
  }

  state(key: ModuleKey): ModuleRuntimeState | undefined {
    return this.states.get(key);
  }

  states_(): ModuleRuntimeState[] {
    return [...this.states.values()];
  }

  setState(key: ModuleKey, state: ModuleRuntimeStateName, patch: Partial<ModuleRuntimeState> = {}): void {
    const existing = this.states.get(key);
    if (!existing) {
      this.states.set(key, { key, state, ...patch });
      return;
    }
    this.states.set(key, { ...existing, ...patch, state });
  }

  setHealth(key: ModuleKey, report: ModuleHealthReport): void {
    const existing = this.states.get(key);
    if (!existing) {
      this.states.set(key, { key, state: "running", lastHealth: report });
      return;
    }
    this.states.set(key, { ...existing, lastHealth: report });
  }

  /** Resolve a topological boot order respecting `dependsOn`. */
  resolveBootOrder(): ModuleManifest[] {
    const remaining = new Map(this.listEnabled().map((m) => [m.key, m]));
    const out: ModuleManifest[] = [];
    const visiting = new Set<ModuleKey>();

    const visit = (key: ModuleKey, stack: ModuleKey[]) => {
      const m = remaining.get(key);
      if (!m) return;
      if (visiting.has(key)) {
        throw new Error(
          `[ModuleRegistry] Circular dependency detected: ${[...stack, key].join(" -> ")}`,
        );
      }
      visiting.add(key);
      const deps = m.runtime.dependsOn ?? [];
      for (const dep of deps) {
        if (remaining.has(dep)) visit(dep, [...stack, key]);
      }
      visiting.delete(key);
      remaining.delete(key);
      out.push(m);
    };

    for (const key of [...remaining.keys()]) visit(key, []);
    return out;
  }

  private seedPortRegistry(): void {
    if (this.portsSeeded) return;
    try {
      registerDefaultPortDeclarations(getPortRegistry());
      this.portsSeeded = true;
    } catch (err) {
      // Re-seeding with the same shape is a no-op; only schema drift
      // throws. Surface the error so it can't be swallowed silently.
      throw err;
    }
  }

  private registerManifestPorts(manifest: ModuleManifest): void {
    if (!manifest.runtimePorts || manifest.runtimePorts.length === 0) return;
    const ports = getPortRegistry();
    for (const decl of manifest.runtimePorts) {
      ports.registerDeclaration({ ...decl, moduleKey: manifest.key });
    }
  }

  private isEnabled(manifest: ModuleManifest): boolean {
    if (manifest.enabled === undefined) return true;
    if (typeof manifest.enabled === "function") {
      try {
        return !!manifest.enabled();
      } catch {
        return false;
      }
    }
    return !!manifest.enabled;
  }

  private validate(manifest: ModuleManifest): void {
    if (!manifest.name) throw new Error(`[ModuleRegistry] '${manifest.key}' missing name`);
    if (!manifest.version) throw new Error(`[ModuleRegistry] '${manifest.key}' missing version`);
    if (!manifest.runtime) throw new Error(`[ModuleRegistry] '${manifest.key}' missing runtime`);
    if (!manifest.database) throw new Error(`[ModuleRegistry] '${manifest.key}' missing database`);
    const allowedRuntime = ["shared", "embedded", "worker", "external"] as const;
    if (!allowedRuntime.includes(manifest.runtime.mode)) {
      throw new Error(`[ModuleRegistry] '${manifest.key}' invalid runtime mode '${manifest.runtime.mode}'`);
    }
  }
}

let _registry: ModuleRegistry | null = null;
export function getModuleRegistry(): ModuleRegistry {
  if (!_registry) _registry = new ModuleRegistry();
  return _registry;
}

/** Test-only — clears the singleton. Do not call from production code. */
export function __resetModuleRegistryForTests(): void {
  _registry = null;
}

export type { ModuleRegistry };
