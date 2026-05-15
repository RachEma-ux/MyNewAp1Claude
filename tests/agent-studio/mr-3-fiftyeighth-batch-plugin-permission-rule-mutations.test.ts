/**
 * MR-3 fifty-eighth batch — repository.ts agsDraftPlugins +
 * agsDraftPermissionRules mutations Path-B consumers Cat B→A via
 * two new helpers: resolvePluginRoutedConn + resolvePermissionRuleRoutedConn.
 * PR-V1-128.
 *
 * 6 mutations migrated (two parallel triples):
 *   - savePlugin (UPDATE: pluginId, INSERT: draftId)
 *   - removePlugin (pluginId)
 *   - replacePlugins (draftId)
 *   - savePermissionRule (UPDATE: ruleId, INSERT: draftId)
 *   - removePermissionRule (ruleId)
 *   - replacePermissionRules (draftId)
 *
 * Sixteenth + seventeenth sister helpers. With this batch the
 * Phase-0b child-table migration arc concludes — all 6 draft-scoped
 * child tables (Hooks, McpServers, Skills, Subagents, Plugins,
 * PermissionRules) are Path-B-migrated.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

function extractFunctionBody(src: string, fnName: string): string {
  const decl = new RegExp(
    `\\n\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${fnName}\\s*[<(]`,
  );
  const declMatch = src.match(decl);
  if (!declMatch || declMatch.index === undefined) return "";
  const start = declMatch.index;
  const declEnd = start + declMatch[0].length;
  const afterDecl = src.slice(declEnd);
  const nextMatch = afterDecl.match(
    /\n\s*(?:export\s+)?(?:async\s+)?function\s+\w+\s*[<(]/,
  );
  const end =
    nextMatch && nextMatch.index !== undefined
      ? declEnd + nextMatch.index
      : src.length;
  return stripComments(src.slice(start, end));
}

describe("MR-3 fifty-eighth batch — Plugin + PermissionRule mutations Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines both sister helpers", () => {
    expect(
      /async\s+function\s+resolvePluginRoutedConn\s*\(/.test(src),
    ).toBe(true);
    expect(
      /async\s+function\s+resolvePermissionRuleRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolvePluginRoutedConn does pluginId→draftId lookup on agsDraftPlugins then chains", () => {
    const body = extractFunctionBody(src, "resolvePluginRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsDraftPlugins/.test(body)).toBe(true);
    expect(/resolveDraftRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("resolvePermissionRuleRoutedConn does ruleId→draftId lookup on agsDraftPermissionRules then chains", () => {
    const body = extractFunctionBody(src, "resolvePermissionRuleRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsDraftPermissionRules/.test(body)).toBe(true);
    expect(/resolveDraftRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("savePlugin UPDATE branch routes via resolvePluginRoutedConn; INSERT branch routes via resolveDraftRoutedConn", () => {
    const body = extractFunctionBody(src, "savePlugin");
    expect(
      /resolvePluginRoutedConn\s*\(\s*lookupConn\s*,\s*input\.pluginId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*input\.draftId\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("removePlugin routes via resolvePluginRoutedConn(pluginId)", () => {
    const body = extractFunctionBody(src, "removePlugin");
    expect(
      /resolvePluginRoutedConn\s*\(\s*lookupConn\s*,\s*pluginId\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.delete\s*\(\s*agsDraftPlugins\s*\)/.test(body),
    ).toBe(true);
  });

  it("replacePlugins routes via resolveDraftRoutedConn(draftId)", () => {
    const body = extractFunctionBody(src, "replacePlugins");
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*draftId\s*\)/.test(body),
    ).toBe(true);
  });

  it("savePermissionRule UPDATE branch routes via resolvePermissionRuleRoutedConn; INSERT branch routes via resolveDraftRoutedConn", () => {
    const body = extractFunctionBody(src, "savePermissionRule");
    expect(
      /resolvePermissionRuleRoutedConn\s*\(\s*lookupConn\s*,\s*input\.ruleId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*input\.draftId\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("removePermissionRule routes via resolvePermissionRuleRoutedConn(ruleId)", () => {
    const body = extractFunctionBody(src, "removePermissionRule");
    expect(
      /resolvePermissionRuleRoutedConn\s*\(\s*lookupConn\s*,\s*ruleId\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("replacePermissionRules routes via resolveDraftRoutedConn(draftId)", () => {
    const body = extractFunctionBody(src, "replacePermissionRules");
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*draftId\s*\)/.test(body),
    ).toBe(true);
  });
});
