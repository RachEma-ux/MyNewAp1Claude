/**
 * PMT Engine — Notification Helpers
 * Emit activity log entries for the notification system to consume.
 */

import { logActivity } from "../registry";

export async function notifyWatchers(params: {
  workspaceId: number;
  workItemId: number;
  event: string;
  actorId: number;
}) {
  await logActivity({
    workspaceId: params.workspaceId,
    moduleKey: "pmt",
    actorId: params.actorId,
    action: `notification.${params.event}`,
    targetType: "task",
    targetId: params.workItemId,
  });
}

export async function notifyAssignee(params: {
  workspaceId: number;
  workItemId: number;
  event: string;
  actorId: number;
}) {
  await logActivity({
    workspaceId: params.workspaceId,
    moduleKey: "pmt",
    actorId: params.actorId,
    action: `notification.assignee.${params.event}`,
    targetType: "task",
    targetId: params.workItemId,
  });
}

export async function notifyMentioned(params: {
  workspaceId: number;
  userIds: number[];
  workItemId: number;
  actorId: number;
}) {
  await logActivity({
    workspaceId: params.workspaceId,
    moduleKey: "pmt",
    actorId: params.actorId,
    action: "notification.mentioned",
    targetType: "task",
    targetId: params.workItemId,
    metadata: { mentionedUserIds: params.userIds },
  });
}
