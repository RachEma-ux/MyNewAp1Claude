/**
 * KGRA Agent — Internal route table (metadata).
 *
 * Capsule's `mod.tsx` renders `KGRAAgentPage` directly. This file
 * lists the canonical path owned by KGRA Agent so
 * `check:module-route-inventory` can verify the manifest's
 * `routeInventory` matches the capsule's actual mount surface.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const KGRAAgentPage = lazy(() => import("./pages/KGRAAgentPage"));

export interface KgraAgentRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const kgraAgentRoutes: KgraAgentRouteEntry[] = [
  { path: "/data-analysis/kgra-agent", component: KGRAAgentPage, label: "KGRA Agent" },
];
