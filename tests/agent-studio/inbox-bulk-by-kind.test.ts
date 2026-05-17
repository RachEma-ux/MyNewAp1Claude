/**
 * Inbox bulk-by-kind — T-F.111 (T-F.6-ε).
 *
 * Stacked on T-F.110 δ. Closes the within-Inbox (a) NARROW item
 * from the T-A.28 standing-pattern menu by shipping the two
 * remaining server-supported bulk mutations:
 *
 * - `markAllNotificationsReadByKind` — one-click (lesson 66:
 *   reversible by re-emitting the notification, not destructive)
 * - `dismissAllNotificationsByKind` — two-step confirm (lesson 64:
 *   destructive, removes N rows); explicit `readOnly: false` so the
 *   operator's gesture nukes read AND unread of the selected kind
 *
 * Both consume the δ-shipped `selectedKind` state directly — no
 * new state for "which kind to bulk-act on". The bulk bar appears
 * ONLY when a kind is selected.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/InboxPanel.tsx",
    ),
    "utf8",
  );
}

describe("Inbox bulk-by-kind ε-slice (T-F.111 / T-F.6-ε)", () => {
  it("uses markAllNotificationsReadByKind + invalidates getMyInbox composite", () => {
    const src = readPanel();
    expect(src).toMatch(
      /trpc\.agentStudio\.workspaceObservability\.markAllNotificationsReadByKind\.useMutation/,
    );
    expect(src).toMatch(
      /bulkMarkReadByKindMutation[\s\S]{0,500}onSuccess[\s\S]{0,300}utils\.agentStudio\.workspaceObservability\.getMyInbox\.invalidate\(\)/,
    );
    expect(src).toMatch(
      /setBulkResult\(`Marked \$\{res\.markedCount\} notification\(s\) as read\.`\)/,
    );
  });

  it("uses dismissAllNotificationsByKind with explicit readOnly: false + deletedCount in result copy", () => {
    const src = readPanel();
    expect(src).toMatch(
      /trpc\.agentStudio\.workspaceObservability\.dismissAllNotificationsByKind\.useMutation/,
    );
    expect(src).toMatch(
      /bulkDismissByKindMutation\.mutate\(\{[\s\S]{0,600}readOnly:\s*false/,
    );
    expect(src).toMatch(
      /setBulkResult\(`Dismissed \$\{res\.deletedCount\} notification\(s\)\.`\)/,
    );
  });

  it("bulk bar gated on selectedKind != null + names the selected kind in copy", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{selectedKind\s*!=\s*null\s*\?\s*\([\s\S]{0,500}data-testid=["']inbox-bulk-bar["']/,
    );
    expect(src).toMatch(/data-testid=["']inbox-bulk-bar-kind["']/);
    expect(src).toMatch(/\{selectedKind\}/);
  });

  it("Mark all read is one-click (no confirm) per lesson 66", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=["']inbox-bulk-mark-read-by-kind["'][\s\S]{0,200}\{bulkMarkReadByKindMutation\.isPending\s*\?\s*"Marking…"\s*:\s*"Mark all read"\}/,
    );
    // Click goes straight to mutate (no confirm step):
    expect(src).toMatch(
      /bulkMarkReadByKindMutation\.mutate\(\{\s*notificationKind:\s*selectedKind,?\s*\}\)/,
    );
  });

  it("Dismiss all is two-step confirm per lesson 64 + destructive visual", () => {
    const src = readPanel();
    expect(src).toMatch(
      /!bulkConfirmOpen\s*\?\s*\([\s\S]{0,500}data-testid=["']inbox-bulk-dismiss-by-kind["']/,
    );
    expect(src).toMatch(
      /data-testid=["']inbox-bulk-dismiss-confirm["'][\s\S]{0,800}bg-destructive/,
    );
    expect(src).toMatch(
      /data-testid=["']inbox-bulk-dismiss-confirm-button["']/,
    );
    expect(src).toMatch(/data-testid=["']inbox-bulk-dismiss-cancel["']/);
  });

  it("bulkPending derived from BOTH mutations + disables both buttons", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+bulkPending\s*=[\s\S]{0,200}bulkMarkReadByKindMutation\.isPending[\s\S]{0,150}bulkDismissByKindMutation\.isPending/,
    );
    expect(src).toMatch(
      /disabled=\{bulkPending\s*\|\|\s*bulkConfirmOpen\}/,
    );
  });

  it("bulk result + error surfaces have distinct testids and are mutually exclusive (one nulls the other on success/error)", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid=["']inbox-bulk-result["']/);
    expect(src).toMatch(/data-testid=["']inbox-bulk-error["']/);
    // onSuccess clears error; onError clears result:
    expect(src).toMatch(
      /onSuccess[\s\S]{0,300}setBulkError\(null\)[\s\S]{0,200}setBulkResult/,
    );
    expect(src).toMatch(
      /onError[\s\S]{0,200}setBulkError\(err\.message\)[\s\S]{0,150}setBulkResult\(null\)/,
    );
  });

  it("banner refreshed δ → ε naming bulk-by-kind live AND remaining deferred (workspace-wide dismiss-all)", () => {
    const src = readPanel();
    expect(src).toMatch(/Inbox ε:/);
    expect(src).toMatch(
      /bulk-mark-read-by-kind\s*\+\s*bulk-dismiss-by-kind\s+live/,
    );
    expect(src).not.toMatch(/Inbox δ:/);
  });
});
