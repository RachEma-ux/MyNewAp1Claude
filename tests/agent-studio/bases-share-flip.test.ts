/**
 * Bases per-row Share-flip — θ-slice (T-F.97 / T-F.2-θ).
 *
 * Fourth and final Bases CRUD mutation, closing the roadmap §Phase
 * 24 acceptance "Bases MVP works (create / share / version)" at
 * 4-of-4 (create ✓ δ, version ✓ Phase-16-inherited, rename ✓ ε,
 * share ✓ θ). Single-click toggle that flips a base between
 * `personal` ↔ `workspace_shared` via the existing service-level
 * `updateSavedView()` (which has accepted `visibility` since
 * Phase 16-α; only the tRPC Zod schema was missing it).
 *
 * No two-step confirm — the action is reversible (operator flips
 * back instantly), unlike delete; precedent (lesson 64) applies
 * specifically to NON-reversible operations.
 *
 * Source-scan integrity test locks: tRPC Zod schema accepts
 * visibility enum, mutation state slices + per-row error scoping,
 * isShared derivation, nextShareVisibility flip logic, button
 * label + testid, per-row pending pattern, mutation invocation
 * shape (id + visibility only), and the per-row error row.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/BasesPanel.tsx",
    ),
    "utf8",
  );
}

function readRouter(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../server/agent-studio/services/vault/router.ts",
    ),
    "utf8",
  );
}

describe("Bases Share-flip θ-slice (T-F.97 / T-F.2-θ)", () => {
  it("vault.updateSavedView tRPC Zod schema accepts visibility enum (server-side delta)", () => {
    const src = readRouter();
    expect(src).toMatch(
      /updateSavedView:\s*protectedProcedure[\s\S]{0,600}visibility:\s*z[\s\S]{0,200}\.enum\(\s*\[\s*"personal",\s*"workspace_shared"\s*\]\s*\)[\s\S]{0,80}\.optional\(\)/,
    );
  });

  it("panel holds shareError + shareErrorBaseId state slices (per-row scoping)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[shareError,\s*setShareError\]\s*=\s*useState<string\s*\|\s*null>/,
    );
    expect(src).toMatch(
      /const\s+\[shareErrorBaseId,\s*setShareErrorBaseId\]\s*=\s*useState<number\s*\|\s*null>/,
    );
  });

  it("shareMutation uses updateSavedView; onSuccess invalidates list + clears error; onError scopes error to the failing row", () => {
    const src = readPanel();
    expect(src).toMatch(
      /shareMutation\s*=\s*[\s\S]{0,300}updateSavedView\.useMutation/,
    );
    expect(src).toMatch(
      /shareMutation[\s\S]{0,800}utils\.agentStudio\.vault\.listVisibleSavedViews\.invalidate/,
    );
    expect(src).toMatch(
      /shareMutation[\s\S]{0,800}onSuccess[\s\S]{0,500}setShareError\(null\)[\s\S]{0,200}setShareErrorBaseId\(null\)/,
    );
    expect(src).toMatch(
      /shareMutation[\s\S]{0,800}onError:\s*\(err,\s*variables\)\s*=>\s*\{[\s\S]{0,300}setShareError\(err\.message\)[\s\S]{0,200}setShareErrorBaseId\(variables\.id\)/,
    );
  });

  it("isShared derived from b.visibility; nextShareVisibility flips correctly", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+isShared\s*=\s*b\.visibility\s*===\s*"workspace_shared"/,
    );
    expect(src).toMatch(
      /const\s+nextShareVisibility:\s*"personal"\s*\|\s*"workspace_shared"\s*=[\s\S]{0,200}isShared\s*\?\s*"personal"\s*:\s*"workspace_shared"/,
    );
  });

  it("isSharePending resolves per-row via mutation.variables.id", () => {
    const src = readPanel();
    expect(src).toMatch(
      /isSharePending\s*=[\s\S]{0,200}shareMutation\.isPending\s*&&\s*shareMutation\.variables\?\.id\s*===\s*b\.id/,
    );
  });

  it("Share button has testid + label varies by current visibility", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid=\{`bases-row-share-\$\{b\.id\}`\}/);
    expect(src).toMatch(/Make personal/);
    expect(src).toMatch(/Share with workspace/);
    expect(src).toMatch(/isSharePending[\s\S]{0,200}Updating…/);
  });

  it("Share button invokes mutation with id + visibility only — no other fields", () => {
    const src = readPanel();
    expect(src).toMatch(
      /shareMutation\.mutate\(\{[\s\S]{0,200}id:\s*b\.id[\s\S]{0,200}visibility:\s*nextShareVisibility/,
    );
    // No other fields spread into the mutation — keep the visibility
    // flip pure (don't risk a name/columns clobber from stale state).
    expect(src).not.toMatch(/shareMutation\.mutate\([\s\S]{0,300}name:/);
    expect(src).not.toMatch(/shareMutation\.mutate\([\s\S]{0,300}filters:/);
  });

  it("per-row error row appears only for the failing row (per-row scoping)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /shareError\s*!==\s*null\s*&&\s*shareErrorBaseId\s*===\s*b\.id[\s\S]{0,400}data-testid=\{`bases-row-share-error-row-\$\{b\.id\}`\}/,
    );
    expect(src).toMatch(/data-testid=\{`bases-row-share-error-\$\{b\.id\}`\}/);
  });

  it("Share button is NOT gated behind a two-step confirm (reversible action — lesson 64 explicitly excludes reversible ops)", () => {
    const src = readPanel();
    // Button onClick fires mutation directly (single click), not
    // openShareConfirm or similar gating helper.
    expect(src).toMatch(
      /data-testid=\{`bases-row-share-\$\{b\.id\}`\}[\s\S]{0,600}onClick=\{\(\)\s*=>\s*shareMutation\.mutate/,
    );
    // No openShareConfirm helper should exist.
    expect(src).not.toMatch(/function\s+openShareConfirm/);
    // No confirmShareBaseId state should exist.
    expect(src).not.toMatch(/confirmShareBaseId/);
  });
});
