/**
 * MR-3 fifty-fifth batch — repository.ts agsDraftMcpServers
 * mutations Path-B consumers Cat B→A via new
 * `resolveMcpServerRoutedConn` helper.
 * PR-V1-125.
 *
 * 6 mutations migrated:
 *   - saveMcpServer (UPDATE: serverId, INSERT: draftId)
 *   - removeMcpServer (serverId)
 *   - updateMcpServerStatus (serverId)
 *   - setMcpServerEnabled (serverId)
 *   - updateMcpServerOAuth (serverId)
 *   - replaceMcpServers (draftId)
 *
 * Thirteenth sister helper: resolveMcpServerRoutedConn.
 *
 * Out of scope: recordMcpTransition (writes to agsMcpTransitions,
 * needs its own resolver and trim DELETE handling — own batch).
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

describe("MR-3 fifty-fifth batch — McpServer mutations Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveMcpServerRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveMcpServerRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveMcpServerRoutedConn does serverId→draftId lookup on agsDraftMcpServers then chains into resolveDraftRoutedConn", () => {
    const body = extractFunctionBody(src, "resolveMcpServerRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsDraftMcpServers/.test(body)).toBe(true);
    expect(/resolveDraftRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("saveMcpServer UPDATE branch routes via resolveMcpServerRoutedConn", () => {
    const body = extractFunctionBody(src, "saveMcpServer");
    expect(
      /resolveMcpServerRoutedConn\s*\(\s*lookupConn\s*,\s*input\.serverId\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("saveMcpServer INSERT branch routes via resolveDraftRoutedConn(input.draftId)", () => {
    const body = extractFunctionBody(src, "saveMcpServer");
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*input\.draftId\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  const serverIdMutations = [
    "removeMcpServer",
    "updateMcpServerStatus",
    "setMcpServerEnabled",
    "updateMcpServerOAuth",
  ];

  it.each(serverIdMutations)(
    "%s routes via resolveMcpServerRoutedConn(lookupConn, serverId)",
    (fnName) => {
      const body = extractFunctionBody(src, fnName);
      expect(body.length).toBeGreaterThan(0);
      expect(
        /resolveMcpServerRoutedConn\s*\(\s*lookupConn\s*,\s*serverId\s*\)/.test(
          body,
        ),
      ).toBe(true);
    },
  );

  it("replaceMcpServers routes via resolveDraftRoutedConn(draftId)", () => {
    const body = extractFunctionBody(src, "replaceMcpServers");
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*draftId\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\s*\.delete\s*\(\s*agsDraftMcpServers\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.insert\s*\(\s*agsDraftMcpServers\s*\)/.test(body),
    ).toBe(true);
  });
});
