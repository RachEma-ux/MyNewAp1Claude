/**
 * Boot Sync — Capabilities
 *
 * Loads config/capabilities.yaml and upserts any missing capability rows.
 * Does NOT touch roles, memberships, or constraints — safe to call on every boot.
 */

import { loadCapabilitiesCatalog } from "./loaders";
import { upsertCapabilities } from "../../db/workspace-rbac";

export async function syncCapabilitiesOnBoot(): Promise<void> {
  try {
    const catalog = loadCapabilitiesCatalog();
    const inserted = await upsertCapabilities(catalog.capabilities);

    if (inserted > 0) {
      console.log(`[CapabilitySync] Synced ${inserted} new capabilities (${catalog.capabilities.length} total)`);
    } else {
      console.log(`[CapabilitySync] All ${catalog.capabilities.length} capabilities already present`);
    }
  } catch (error: any) {
    console.warn(`[CapabilitySync] Skipped — ${error.message}`);
  }
}
