/**
 * Communication — Frontend Module Manifest (capsule shape).
 *
 * Communication is the pilot Module Client Capsule. The manifest:
 *   - declares the canonical subtree (`/communication`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory` so AWI and
 *     `check:module-route-inventory` know the full surface
 *   - lists legacy redirects under `compatibilityRoutes` so the
 *     baseline / ownership-map generators can mark them as
 *     compatibility-redirect rather than duplicate canonical
 *
 * App.tsx no longer mounts Communication pages. The capsule renders
 * via `<ModuleRoutes />` once `client.ts` registers this manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const CommunicationCapsule = lazy(() => import("./mod"));

export const communicationClientManifest: ClientModuleManifest = {
  key: "communication",
  name: "Communication",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/communication",
  capsuleEntrypoint: CommunicationCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/communication",
    "/communication/chat",
    "/communication/conversations",
    "/communication/video-meeting",
    "/communication/notifications",
  ],
  compatibilityRoutes: [
    {
      from: "/chat",
      to: "/communication/chat",
      reason: "legacy deep link",
    },
    {
      from: "/conversations",
      to: "/communication/conversations",
      reason: "legacy deep link",
    },
    {
      from: "/video-meeting",
      to: "/communication/video-meeting",
      reason: "legacy deep link",
    },
  ],
  deprecatedRoutes: [],

  /* ---- Legacy field — empty for capsule modules ---- */
  // The composer ignores `routes[]` when `baseRoute + capsuleEntrypoint`
  // are present; we leave it empty to match the capsule shape.
  routes: [],

  navigation: [
    { group: "communication", label: "Communication", order: 5 },
  ],
  requiredPermissions: ["communication.read"],
};
