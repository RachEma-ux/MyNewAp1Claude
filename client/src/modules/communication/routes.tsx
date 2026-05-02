/**
 * Communication — Internal route table.
 *
 * Each entry maps a canonical Communication path to its lazy-loaded
 * page component. The capsule's `mod.tsx` mounts these inside a
 * `<Switch>`. The list MUST stay in sync with
 * `manifest.routeInventory` — `check:module-route-inventory`
 * enforces this in strict mode.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

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

export interface CommunicationRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const communicationRoutes: CommunicationRouteEntry[] = [
  { path: "/communication", component: CommunicationDashboardPage, label: "Overview" },
  { path: "/communication/chat", component: CommunicationChatPage, label: "Chat" },
  {
    path: "/communication/conversations",
    component: CommunicationConversationsPage,
    label: "Conversations",
  },
  {
    path: "/communication/video-meeting",
    component: CommunicationVideoMeetingPage,
    label: "Video Meeting",
  },
  {
    path: "/communication/notifications",
    component: CommunicationNotificationsPage,
    label: "Notifications",
  },
];
