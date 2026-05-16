/**
 * Inbox page — T-F.107 (T-F.6-α).
 *
 * First operator surface for the personal workspace inbox
 * (`ags_workspace_user_notifications`). Reaches `/agent-studio/inbox`
 * via the canonical 4-site shell wiring (lazy import in
 * `AgentStudioShell.tsx`, path parser in the same file, sidebar
 * entry in `AgentStudioSidebar.tsx`, route case in `routes.tsx`).
 *
 * Per precedent (o)-discriminator: the server already exposes
 * `getMyInbox`, `listMyNotifications`, mark-read, dismiss,
 * by-kind-bulk, and unread-count procedures — zero new server work
 * needed for the α-shell. The page consumes `getMyInbox` and
 * surfaces the `byKind` breakdown so operators see the live
 * `notificationKind` taxonomy that's been writing to the table.
 */

import { InboxPanel } from "../components/InboxPanel";

export default function InboxPage() {
  return (
    <div className="space-y-4 p-4">
      <h2 className="text-lg font-semibold">Inbox</h2>
      <InboxPanel />
    </div>
  );
}
