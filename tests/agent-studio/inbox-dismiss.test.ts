/**
 * Inbox dismiss — T-F.109 (T-F.6-γ).
 *
 * Stacked on T-F.108 β. Second mutation surface on the Inbox.
 * Consumes existing
 * `agentStudio.workspaceObservability.dismissNotifications` tRPC
 * which takes `notificationIds: number[]`.
 *
 * Per-row two-step confirm per lesson 64 — dismiss is non-reversible
 * from the operator's POV (row vanishes from inbox; recovery means
 * pulling the underlying source surface).
 *
 * Source-scan locks:
 * - dismissNotifications mutation wiring + composite invalidation
 * - per-row confirm state slice + open/cancel helpers
 * - per-row error scoping via errorId companion slice
 * - confirm UI renders only when dismissConfirmRowId === n.id
 * - banner refreshed β → γ ("mark-read + dismiss live")
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

describe("Inbox dismiss γ-slice (T-F.109 / T-F.6-γ)", () => {
  it("uses dismissNotifications mutation + invalidates getMyInbox composite", () => {
    const src = readPanel();
    expect(src).toMatch(
      /trpc\.agentStudio\.workspaceObservability\.dismissNotifications\.useMutation/,
    );
    expect(src).toMatch(
      /dismissMutation[\s\S]{0,400}onSuccess[\s\S]{0,300}utils\.agentStudio\.workspaceObservability\.getMyInbox\.invalidate\(\)/,
    );
  });

  it("ships confirm-state slice + open/cancel helpers", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[dismissConfirmRowId,\s*setDismissConfirmRowId\][\s\S]{0,200}useState<number\s*\|\s*null>\(\s*null/,
    );
    expect(src).toMatch(
      /function\s+openDismissConfirm\(id:\s*number\)[\s\S]{0,250}setDismissConfirmRowId\(id\)/,
    );
    expect(src).toMatch(
      /function\s+cancelDismissConfirm[\s\S]{0,150}setDismissConfirmRowId\(null\)/,
    );
  });

  it("per-row error scoping via dismissError + dismissErrorRowId (lesson 67)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[dismissError,\s*setDismissError\][\s\S]{0,150}useState<string\s*\|\s*null>\(null\)/,
    );
    expect(src).toMatch(
      /const\s+\[dismissErrorRowId,\s*setDismissErrorRowId\][\s\S]{0,200}useState<number\s*\|\s*null>\(\s*null/,
    );
    expect(src).toMatch(
      /onError[\s\S]{0,400}setDismissError\(err\.message\)[\s\S]{0,200}setDismissErrorRowId\(vars\.notificationIds\[0\]\s*\?\?\s*null\)/,
    );
  });

  it("Dismiss… button renders only when confirm NOT open + has per-row testid + pending UX", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{dismissConfirmRowId\s*!==\s*n\.id\s*\?\s*\([\s\S]{0,1500}data-testid=\{`inbox-row-dismiss-\$\{n\.id\}`\}/,
    );
    expect(src).toMatch(
      /onClick=\{\(\)\s*=>\s*openDismissConfirm\(n\.id\)\}/,
    );
  });

  it("confirm UI gated on dismissConfirmRowId === n.id + Confirm + Cancel + per-row testids", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`inbox-row-dismiss-confirm-\$\{n\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`inbox-row-dismiss-confirm-button-\$\{n\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`inbox-row-dismiss-cancel-\$\{n\.id\}`\}/,
    );
    expect(src).toMatch(
      /dismissMutation\.mutate\(\{\s*notificationIds:\s*\[n\.id\]/,
    );
  });

  it("per-row error message rendered only when dismissErrorRowId matches", () => {
    const src = readPanel();
    expect(src).toMatch(
      /dismissError\s*!=\s*null\s*&&\s*dismissErrorRowId\s*===\s*n\.id[\s\S]{0,400}data-testid=\{`inbox-row-dismiss-error-\$\{n\.id\}`\}/,
    );
    expect(src).toMatch(/Dismiss failed:/);
  });

  it("banner refreshed β → γ naming dismiss live AND remaining deferred bulk actions", () => {
    const src = readPanel();
    expect(src).toMatch(/Inbox γ:/);
    expect(src).toMatch(
      /mark-read\s*\+\s*dismiss\s+live[\s\S]{0,400}mark-all-by-kind[\s\S]{0,200}dismiss-all-by-kind[\s\S]{0,200}follow-up/,
    );
    expect(src).not.toMatch(/Inbox β:/);
  });
});
