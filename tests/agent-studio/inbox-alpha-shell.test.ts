/**
 * Inbox α-shell — T-F.107 (T-F.6-α).
 *
 * First operator surface for `ags_workspace_user_notifications`.
 * Source-scan integrity test: locks the canonical 4-site shell
 * wiring + InboxPanel consumption shape + breakdown card
 * (precedent (o)-discriminator territory opener via the
 * `notificationKind` column).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(rel: string): string {
  return readFileSync(resolve(__dirname, "../..", rel), "utf8");
}

describe("Inbox α-shell (T-F.107 / T-F.6-α)", () => {
  it("InboxPage renders InboxPanel under the canonical h2 + p-4 wrapper", () => {
    const src = read("client/src/modules/agent-studio/pages/InboxPage.tsx");
    expect(src).toMatch(/from\s+["']\.\.\/components\/InboxPanel["']/);
    expect(src).toMatch(/<h2[^>]*>Inbox<\/h2>/);
    expect(src).toMatch(/<InboxPanel\s*\/>/);
  });

  it("InboxPanel consumes getMyInbox with a stable limit", () => {
    const src = read(
      "client/src/modules/agent-studio/components/InboxPanel.tsx",
    );
    expect(src).toMatch(
      /trpc\.agentStudio\.workspaceObservability\.getMyInbox\.useQuery/,
    );
    expect(src).toMatch(/INBOX_LIMIT\s*=\s*\d+/);
  });

  it("InboxPanel renders unread-total + by-kind breakdown cards (precedent (o)-discriminator surface)", () => {
    const src = read(
      "client/src/modules/agent-studio/components/InboxPanel.tsx",
    );
    expect(src).toMatch(/data-testid=["']inbox-unread-total-card["']/);
    expect(src).toMatch(/data-testid=["']inbox-unread-total["']/);
    expect(src).toMatch(/data-testid=["']inbox-by-kind-card["']/);
    expect(src).toMatch(
      /data-testid=\{`inbox-by-kind-row-\$\{kind\}`\}/,
    );
    expect(src).toMatch(/Unread by notification kind/);
  });

  it("InboxPanel renders notifications list with per-row testids + read indicator + payload pre", () => {
    const src = read(
      "client/src/modules/agent-studio/components/InboxPanel.tsx",
    );
    expect(src).toMatch(/data-testid=["']inbox-list-card["']/);
    expect(src).toMatch(/data-testid=\{`inbox-row-\$\{n\.id\}`\}/);
    expect(src).toMatch(
      /data-testid=\{`inbox-row-read-indicator-\$\{n\.id\}`\}/,
    );
    expect(src).toMatch(/data-testid=\{`inbox-row-kind-\$\{n\.id\}`\}/);
    expect(src).toMatch(
      /data-testid=\{`inbox-row-payload-\$\{n\.id\}`\}/,
    );
  });

  it("InboxPanel ships the honest α-shell banner naming live + deferred mutations", () => {
    // The banner copy evolves as slices land (lesson 79: banner is
    // the live deferral ledger). Keep the assertion liberal: must
    // have the banner testid AND must reference both mark-read and
    // dismiss somewhere in the surface — that's the α invariant.
    const src = read(
      "client/src/modules/agent-studio/components/InboxPanel.tsx",
    );
    expect(src).toMatch(/data-testid=["']inbox-banner["']/);
    expect(src).toMatch(/mark-read/);
    expect(src).toMatch(/dismiss/);
  });

  it("InboxPanel handles loading / error / empty states with distinct testids", () => {
    const src = read(
      "client/src/modules/agent-studio/components/InboxPanel.tsx",
    );
    expect(src).toMatch(/data-testid=["']inbox-loading["']/);
    expect(src).toMatch(/data-testid=["']inbox-error["']/);
    expect(src).toMatch(/data-testid=["']inbox-by-kind-empty["']/);
    expect(src).toMatch(/data-testid=["']inbox-list-empty["']/);
  });

  it("AgentStudioShell wires InboxPage at 4 sites (lazy import + path parse + nav case + render case)", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );
    expect(src).toMatch(
      /const\s+InboxPage\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\.\/pages\/InboxPage["']\s*\)\s*\)/,
    );
    expect(src).toMatch(
      /path\.startsWith\(["']\/agent-studio\/inbox["']\)[\s\S]{0,200}view:\s*["']inbox["']\s*as\s*any/,
    );
    expect(src).toMatch(
      /\(key as string\)\s*===\s*["']inbox["'][\s\S]{0,150}navigate\(["']\/agent-studio\/inbox["']\)/,
    );
    expect(src).toMatch(
      /case\s+["']inbox["']\s*as\s*any\s*:\s*[\s\S]{0,100}<InboxPage\s*\/>/,
    );
  });

  it("AgentStudioSidebar adds inbox to the view union AND ships Inbox group with Inbox icon", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );
    expect(src).toMatch(/\|\s*["']inbox["']/);
    expect(src).toMatch(/Inbox,?\n\}\s+from\s+["']lucide-react["']/);
    expect(src).toMatch(
      /label:\s*["']Inbox["'][\s\S]{0,400}key:\s*["']inbox["'][\s\S]{0,200}icon:\s*Inbox/,
    );
  });

  it("routes.tsx registers /agent-studio/inbox", () => {
    const src = read("client/src/modules/agent-studio/routes.tsx");
    expect(src).toMatch(
      /\{\s*path:\s*["']\/agent-studio\/inbox["'],\s*component:\s*AgentStudioShell/,
    );
  });
});
