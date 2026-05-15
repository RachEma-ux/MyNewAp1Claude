/**
 * Vault template-instantiation queries — mount + shape source-scan.
 * PR-V1-164.
 *
 * Verifies the 3 newly-exposed query procedures on `vaultRouter`
 * are declared with the right verb + Zod input shape + delegate to
 * the existing service helpers. The behavioral tests for those
 * helpers already exist in `tests/agent-studio/vault-template-
 * instantiation*.test.ts`.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("Phase 15-δ follow-up — vault template-instantiation queries mount", () => {
  const routerFile = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/router.ts",
  );

  it("router imports the 3 service helpers", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(src).toContain("listInstantiationsByTemplate");
    expect(src).toContain("listInstantiationsByNote");
    expect(src).toContain("countDistinctDigestsForTemplate");
  });

  it("router declares the 3 procedures as protectedProcedure queries", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(/listInstantiationsByTemplate:\s*protectedProcedure[\s\S]{0,400}\.query\(/.test(src)).toBe(
      true,
    );
    expect(/listInstantiationsByNote:\s*protectedProcedure[\s\S]{0,400}\.query\(/.test(src)).toBe(
      true,
    );
    expect(/countDistinctDigestsForTemplate:\s*protectedProcedure[\s\S]{0,400}\.query\(/.test(src)).toBe(
      true,
    );
  });

  it("inputs are Zod-validated with positive-integer ids + bounded limit", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(/templateId:\s*z\.number\(\)\.int\(\)\.positive\(\)/.test(src)).toBe(true);
    expect(/limit:\s*z\.number\(\)\.int\(\)\.positive\(\)\.max\(500\)/.test(src)).toBe(
      true,
    );
    expect(/noteId:\s*z\.number\(\)\.int\(\)\.positive\(\)/.test(src)).toBe(true);
  });

  it("countDistinctDigestsForTemplate returns the structured response shape", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(/templateId:\s*input\.templateId,\s*\n\s*distinctDigests:/.test(src)).toBe(
      true,
    );
  });
});
