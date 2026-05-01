/**
 * Frontend Module Registry — holds client manifests.
 *
 * Modules import this and register themselves at app boot. The registry
 * is the source of truth for the route composer and nav composer.
 */

import type { ClientModuleManifest } from "./types";

const manifests = new Map<string, ClientModuleManifest>();

export function registerClientModule(manifest: ClientModuleManifest): void {
  if (manifests.has(manifest.key)) return; // idempotent
  manifests.set(manifest.key, manifest);
}

export function listClientModules(): ClientModuleManifest[] {
  return [...manifests.values()].filter((m) => {
    if (typeof m.enabled === "function") {
      try {
        return m.enabled();
      } catch {
        return false;
      }
    }
    return true;
  });
}

export function getClientModule(key: string): ClientModuleManifest | undefined {
  return manifests.get(key);
}

export function __resetClientRegistryForTests(): void {
  manifests.clear();
}
