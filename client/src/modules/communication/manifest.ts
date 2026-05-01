/**
 * Communication — Frontend Module Manifest
 *
 * Wires the canonical Communication routes (`/communication/*`).
 * App.tsx still owns the top-level Switch but registers ModuleRoutes
 * after its own routes; the routes here also appear directly in
 * App.tsx so wouter can resolve them. Keeping both in sync is the
 * convention used by every other client module.
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const CommunicationDashboardPage = lazy(
  () => import("./pages/CommunicationDashboardPage"),
);
const CommunicationChatPage = lazy(
  () => import("./pages/CommunicationChatPage"),
);
const CommunicationConversationsPage = lazy(
  () => import("./pages/CommunicationConversationsPage"),
);
const CommunicationVideoMeetingPage = lazy(
  () => import("./pages/CommunicationVideoMeetingPage"),
);
const CommunicationNotificationsPage = lazy(
  () => import("./pages/CommunicationNotificationsPage"),
);

export const communicationClientManifest: ClientModuleManifest = {
  key: "communication",
  name: "Communication",
  routes: [
    {
      path: "/communication",
      label: "Communication",
      component: CommunicationDashboardPage,
    },
    {
      path: "/communication/chat",
      label: "Chat",
      component: CommunicationChatPage,
    },
    {
      path: "/communication/conversations",
      label: "Conversations",
      component: CommunicationConversationsPage,
    },
    {
      path: "/communication/video-meeting",
      label: "Video Meeting",
      component: CommunicationVideoMeetingPage,
    },
    {
      path: "/communication/notifications",
      label: "Notifications",
      component: CommunicationNotificationsPage,
    },
  ],
  navigation: [
    { group: "communication", label: "Communication", order: 5 },
  ],
  requiredPermissions: ["communication.read"],
};
