/**
 * Communication — Provided ports (read-side).
 *
 * Other modules may consume Communication via these typed ports.
 * Implementation lives in the Communication module and is exposed
 * through the Module Gateway.
 */

import type { CommunicationSummary } from "./contracts";

export interface CommunicationReadPort {
  /** Workspace-scoped summary used by Digital HQ + dashboard. */
  summary(workspaceId: number): Promise<CommunicationSummary>;
}

export interface CommunicationNotificationsPort {
  /** Create a user-facing notification on behalf of another module. */
  createNotification(input: {
    workspaceId: number;
    userId: number;
    sourceModule?: string;
    eventType: string;
    title: string;
    body?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: number }>;
}
