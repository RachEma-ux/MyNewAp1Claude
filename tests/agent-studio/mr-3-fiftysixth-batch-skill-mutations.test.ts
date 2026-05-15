/**
 * MR-3 fifty-sixth batch — repository.ts agsDraftSkills mutations
 * Path-B consumers Cat B→A via new `resolveSkillRoutedConn` helper.
 * PR-V1-126.
 *
 * 3 mutations migrated:
 *   - attachSkill(input.draftId) → resolveDraftRoutedConn
 *   - removeSkill(skillId) → resolveSkillRoutedConn
 *   - replaceSkills(draftId) → resolveDraftRoutedConn
 *
 * Fourteenth sister helper: resolveSkillRoutedConn.
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

describe("MR-3 fifty-sixth batch — Skill mutations Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveSkillRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveSkillRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveSkillRoutedConn does skillId→draftId lookup on agsDraftSkills then chains into resolveDraftRoutedConn", () => {
    const body = extractFunctionBody(src, "resolveSkillRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsDraftSkills/.test(body)).toBe(true);
    expect(/resolveDraftRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("attachSkill routes via resolveDraftRoutedConn(input.draftId)", () => {
    const body = extractFunctionBody(src, "attachSkill");
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*input\.draftId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsDraftSkills\s*\)/.test(body),
    ).toBe(true);
  });

  it("removeSkill routes via resolveSkillRoutedConn(skillId)", () => {
    const body = extractFunctionBody(src, "removeSkill");
    expect(
      /resolveSkillRoutedConn\s*\(\s*lookupConn\s*,\s*skillId\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.delete\s*\(\s*agsDraftSkills\s*\)/.test(body),
    ).toBe(true);
  });

  it("replaceSkills routes via resolveDraftRoutedConn(draftId)", () => {
    const body = extractFunctionBody(src, "replaceSkills");
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*draftId\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\s*\.delete\s*\(\s*agsDraftSkills\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.insert\s*\(\s*agsDraftSkills\s*\)/.test(body),
    ).toBe(true);
  });
});
