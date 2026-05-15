/**
 * MR-3 seventy-second batch — bindings.ts::getAgentProviderBinding
 * Path-A read consumer.
 * PR-V1-142.
 *
 * Tenth read-path Path-X promotion. agsAgentProviderBindings is the
 * Path B primitive's source-of-truth (workspaceId column is non-null);
 * the read now targets the home region under Phase-2 via a pre-
 * projection SELECT keyed by (draftId, role) and then a full-row
 * SELECT on the routed handle.
 *
 * Out of scope: listBindingsForAgent(agentId) is intentionally cross-
 * workspace (Cat C) — fan-out semantics are a Phase-2 ADR decision.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 seventy-second batch — getAgentProviderBinding Path-A", () => {
  const file = resolve(__dirname, "../../server/agent-studio/bindings.ts");
  const src = readFileSync(file, "utf8");

  it("getAgentProviderBinding pre-projects workspaceId then routes the full SELECT", () => {
    const startIdx = src.indexOf("export async function getAgentProviderBinding");
    expect(startIdx).toBeGreaterThan(-1);
    const remainder = src.slice(startIdx + "export async function getAgentProviderBinding".length);
    const nextExportIdx = remainder.indexOf("export async function ");
    const endIdx =
      nextExportIdx >= 0
        ? startIdx + "export async function getAgentProviderBinding".length + nextExportIdx
        : src.length;
    const body = src.slice(startIdx, endIdx);

    expect(
      /lookupDb\s*\n?\s*\.select\s*\(\s*\{\s*workspaceId:\s*agsAgentProviderBindings\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*wsRows\[0\]\.workspaceId\s*\)\s*\?\?\s*lookupDb/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /db\s*\n?\s*\.select\s*\(\s*\)\s*\n?\s*\.from\s*\(\s*agsAgentProviderBindings\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });
});
