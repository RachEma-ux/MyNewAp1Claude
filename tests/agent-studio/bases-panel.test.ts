/**
 * Bases panel α-shell — T-F.91 (T-F.2-α).
 *
 * First operator surface for T-F.2 Bases MVP. Source-scan integrity
 * test locks: BASE_VIEW_KIND discriminator string + Phase-16
 * blueprint registration + canonical 4-site shell wiring + the
 * `listVisibleSavedViews` reuse with `viewKind` filter + read-only
 * shell shape (vault picker + stats card + recent-bases list).
 *
 * Per precedent (o) opportunistic α-shell: zero new server work —
 * the discriminator approach reuses the existing `agsVaultSavedViews`
 * table + `listVisibleSavedViews` tRPC per the saved-view docblock
 * that explicitly anticipates additional view kinds without DB churn.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PANEL_PATH =
  "../../client/src/modules/agent-studio/components/BasesPanel.tsx";
const PAGE_PATH = "../../client/src/modules/agent-studio/pages/BasesPage.tsx";
const SHELL_PATH =
  "../../client/src/modules/agent-studio/components/AgentStudioShell.tsx";
const SIDEBAR_PATH =
  "../../client/src/modules/agent-studio/components/AgentStudioSidebar.tsx";
const ROUTES_PATH = "../../client/src/modules/agent-studio/routes.tsx";
const BLUEPRINTS_PATH =
  "../../server/agent-studio/services/vault/view-kind-blueprints.ts";

function read(rel: string): string {
  return readFileSync(resolve(__dirname, rel), "utf8");
}

describe("Bases panel α-shell (T-F.91 / T-F.2-α)", () => {
  it("panel declares BASE_VIEW_KIND discriminator + BASES_LIST_LIMIT", () => {
    const src = read(PANEL_PATH);
    expect(src).toMatch(/const\s+BASE_VIEW_KIND\s*=\s*"base"\s+as\s+const/);
    expect(src).toMatch(/const\s+BASES_LIST_LIMIT\s*=\s*50/);
  });

  it("server-side ViewKindBlueprint registers viewKind='base' alongside the 5 existing canonical kinds", () => {
    const src = read(BLUEPRINTS_PATH);
    expect(src).toMatch(/viewKind:\s*"base"[\s\S]{0,300}displayName:\s*"Base"/);
    // Bases reuse the vault_notes data source (α-shell parity with
    // note_list — richer cell semantics live in V2 follow-ups).
    expect(src).toMatch(
      /viewKind:\s*"base"[\s\S]{0,500}dataSource:\s*"vault_notes"/,
    );
  });

  it("panel reuses the existing listVisibleSavedViews tRPC with viewKind filter (zero new server work)", () => {
    const src = read(PANEL_PATH);
    expect(src).toMatch(
      /trpc\.agentStudio\.vault\.listVisibleSavedViews\.useQuery/,
    );
    expect(src).toMatch(/viewKind:\s*BASE_VIEW_KIND/);
    expect(src).toMatch(/limit:\s*BASES_LIST_LIMIT/);
    // Should NOT introduce a new tRPC namespace for bases — the
    // discriminator approach is the whole point of the α-shell.
    expect(src).not.toMatch(/trpc\.agentStudio\.bases\./);
  });

  it("panel includes vault picker + stats card + recent-bases list", () => {
    const src = read(PANEL_PATH);
    // Vault picker (reuses vault.listMyVaults).
    expect(src).toMatch(/trpc\.agentStudio\.vault\.listMyVaults\.useQuery/);
    expect(src).toMatch(/data-testid="bases-vault-select"/);
    // Totals card.
    expect(src).toMatch(/data-testid="bases-totals"/);
    expect(src).toMatch(/data-testid="bases-totals-count"/);
    // Recent-bases list.
    expect(src).toMatch(/data-testid="bases-list"/);
    expect(src).toMatch(/data-testid="bases-list-empty"/);
    expect(src).toMatch(/data-testid="bases-list-error"/);
    // Top-level container.
    expect(src).toMatch(/data-testid="bases-panel"/);
  });

  it("recent-bases table renders id / name / visibility / version / updated columns", () => {
    const src = read(PANEL_PATH);
    expect(src).toMatch(
      /<thead>[\s\S]{0,600}<th[^>]*>id<\/th>[\s\S]{0,200}<th[^>]*>name<\/th>[\s\S]{0,200}<th[^>]*>visibility<\/th>[\s\S]{0,200}<th[^>]*>version<\/th>[\s\S]{0,200}<th[^>]*>updated<\/th>/,
    );
    expect(src).toMatch(/data-testid=\{`bases-row-\$\{b\.id\}`\}/);
  });

  it("empty-state copy points at the create-flow follow-up slice (β/γ/δ)", () => {
    const src = read(PANEL_PATH);
    expect(src).toMatch(/No bases yet in this vault[\s\S]{0,200}follow-up slice/);
  });

  it("page is a slim wrapper over the panel (separation of concerns)", () => {
    const src = read(PAGE_PATH);
    expect(src).toMatch(/import\s+\{\s*BasesPanel\s*\}/);
    expect(src).toMatch(/<BasesPanel\s*\/?>/);
    expect(src).toMatch(/<h2[^>]*>Bases<\/h2>/);
  });

  it("4-site shell wiring — lazy import in AgentStudioShell", () => {
    const src = read(SHELL_PATH);
    expect(src).toMatch(
      /const\s+BasesPage\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\.\/pages\/BasesPage"\)\)/,
    );
    // Path parser branch.
    expect(src).toMatch(
      /path\.startsWith\("\/agent-studio\/bases"\)[\s\S]{0,300}view:\s*"bases"\s+as\s+any/,
    );
    // Sidebar key navigation.
    expect(src).toMatch(
      /\(key\s+as\s+string\)\s*===\s*"bases"[\s\S]{0,200}navigate\("\/agent-studio\/bases"\)/,
    );
    // Render case.
    expect(src).toMatch(/case\s+"bases"\s+as\s+any:[\s\S]{0,100}<BasesPage\s*\/>/);
  });

  it("4-site shell wiring — sidebar view enum + Bases group", () => {
    const src = read(SIDEBAR_PATH);
    expect(src).toMatch(/\|\s*"bases"/);
    expect(src).toMatch(
      /label:\s*"Bases"[\s\S]{0,400}key:\s*"bases"[\s\S]{0,200}label:\s*"Bases"[\s\S]{0,200}icon:\s*Table2/,
    );
    expect(src).toMatch(/Table2,/);
  });

  it("4-site shell wiring — routes.tsx entry", () => {
    const src = read(ROUTES_PATH);
    expect(src).toMatch(
      /path:\s*"\/agent-studio\/bases"[\s\S]{0,200}label:\s*"Bases"/,
    );
  });
});
