/**
 * Extensions admin mutation UI source-scan — PR-V1-173.
 *
 * Adds per-row approve + setStatus mutation UIs to
 * ExtensionsAdminPanel (#914). Verifies the action column + mutation
 * wiring + governance taxonomy + cache invalidation + error surface.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-173 — extensions admin mutation UI", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );

  it("imports useState + trpc.useUtils", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain('import { useState } from "react"');
    expect(src).toContain("trpc.useUtils()");
  });

  it("wires approve + setStatus mutations", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.extensions.approve.useMutation",
    );
    expect(src).toContain(
      "trpc.agentStudio.extensions.setStatus.useMutation",
    );
  });

  it("invalidates the list query on mutation success", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain(
      "utils.agentStudio.extensions.list.invalidate({ workspaceId })",
    );
  });

  it("approve button only renders for pending_approval rows", () => {
    const src = readFileSync(file, "utf8");
    expect(
      /ext\.governanceStatus\s*===\s*"pending_approval"/.test(src),
    ).toBe(true);
  });

  it("approve requires + validates a positive integer actor user ID", () => {
    const src = readFileSync(file, "utf8");
    expect(
      /Number\.parseInt\(actorUserId,\s*10\)/.test(src),
    ).toBe(true);
    expect(/!Number\.isFinite\(uid\)\s*\|\|\s*uid\s*<=\s*0/.test(src)).toBe(
      true,
    );
  });

  it("setStatus exposes the closed 5-value governance taxonomy in a select", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain('const EXTENSION_GOVERNANCE_STATUSES = [');
    for (const status of [
      "pending_approval",
      "approved",
      "rejected",
      "disabled",
      "revoked",
    ]) {
      expect(src).toContain(`"${status}"`);
    }
    expect(/EXTENSION_GOVERNANCE_STATUSES\.map\(\(s\)\s*=>/.test(src)).toBe(
      true,
    );
  });

  it("setStatus skips no-op changes when next === current", () => {
    const src = readFileSync(file, "utf8");
    expect(/if\s*\(\s*next\s*===\s*ext\.governanceStatus\s*\)\s*return/.test(src)).toBe(
      true,
    );
  });

  it("mutation errors surface via mutationError state", () => {
    const src = readFileSync(file, "utf8");
    expect(/setMutationError\(err\.message\)/.test(src)).toBe(true);
  });

  it("Actor user ID input + Actions column header are rendered", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain('id="extensions-admin-actor-user-id"');
    expect(src).toContain(">Actions<");
  });
});
