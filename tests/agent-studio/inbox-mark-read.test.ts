/**
 * Inbox mark-read — T-F.108 (T-F.6-β).
 *
 * Stacked on T-F.107 α-shell. Adds per-row "Mark read" mutation
 * gated to unread rows; consumes existing
 * `agentStudio.workspaceObservability.markNotificationRead` tRPC.
 *
 * Source-scan locks:
 * - mutation wiring + composite invalidation on success
 * - per-row error scoping via errorId companion slice (lesson 67)
 * - button gated on `!n.read` (read rows don't get the affordance)
 * - per-row pending UX via mutation.variables?.notificationId === n.id
 * - banner refreshed from α "read-only first surface" → β "mark-read live"
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

describe("Inbox mark-read β-slice (T-F.108 / T-F.6-β)", () => {
  it("uses markNotificationRead mutation + onSuccess invalidates getMyInbox composite", () => {
    const src = readPanel();
    expect(src).toMatch(
      /trpc\.agentStudio\.workspaceObservability\.markNotificationRead\.useMutation/,
    );
    expect(src).toMatch(
      /onSuccess[\s\S]{0,300}utils\.agentStudio\.workspaceObservability\.getMyInbox\.invalidate\(\)/,
    );
  });

  it("ships per-row error scoping via errorId companion slice (lesson 67)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[markReadError,\s*setMarkReadError\][\s\S]{0,150}useState<string\s*\|\s*null>\(null\)/,
    );
    expect(src).toMatch(
      /const\s+\[markReadErrorRowId,\s*setMarkReadErrorRowId\][\s\S]{0,200}useState<number\s*\|\s*null>\(\s*null/,
    );
    expect(src).toMatch(
      /onError[\s\S]{0,300}setMarkReadError\(err\.message\)[\s\S]{0,200}setMarkReadErrorRowId\(vars\.notificationId\)/,
    );
  });

  it("Mark-read button gated on !n.read with per-row testid + pending UX", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{!n\.read\s*\?\s*\([\s\S]{0,1200}data-testid=\{`inbox-row-mark-read-\$\{n\.id\}`\}/,
    );
    expect(src).toMatch(
      /disabled=\{[\s\S]{0,200}markReadMutation\.isPending[\s\S]{0,200}markReadMutation\.variables\?\.notificationId\s*===\s*n\.id/,
    );
    expect(src).toMatch(
      /markReadMutation\.variables\?\.notificationId\s*===\s*n\.id[\s\S]{0,80}\?\s*"Marking…"\s*:\s*"Mark read"/,
    );
  });

  it("per-row error message rendered only when markReadErrorRowId matches", () => {
    const src = readPanel();
    expect(src).toMatch(
      /markReadError\s*!=\s*null\s*&&\s*markReadErrorRowId\s*===\s*n\.id[\s\S]{0,400}data-testid=\{`inbox-row-mark-read-error-\$\{n\.id\}`\}/,
    );
    expect(src).toMatch(/Mark-read failed:/);
  });

  it("banner removed α copy and names live mark-read", () => {
    // β named "Inbox β"; γ extends to "Inbox γ". Both must include
    // mark-read as live. The α "read-only first surface" copy must
    // be gone in any post-α banner.
    const src = readPanel();
    expect(src).toMatch(/Inbox\s+(β|γ):/);
    expect(src).toMatch(/mark-read[\s\S]{0,80}live/);
    expect(src).not.toMatch(/Inbox α-shell:/);
  });

  it("clicking Mark-read clears the prior error state before firing", () => {
    const src = readPanel();
    expect(src).toMatch(
      /onClick=\{\(\)\s*=>\s*\{\s*setMarkReadError\(null\);\s*setMarkReadErrorRowId\(null\);\s*markReadMutation\.mutate\(\{\s*notificationId:\s*n\.id\s*\}\)/,
    );
  });
});
