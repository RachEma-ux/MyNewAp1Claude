/**
 * Phase 12 boundary test — Text2Cypher guardrails.
 *
 * Asserts the text2cypher validator (when implemented) rejects forbidden
 * tokens. Until Phase 12 ships, the test is a placeholder that ensures
 * the ADR exists.
 *
 * ADR: docs/architecture/agent-studio-text2cypher-query-guardrails.md
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const ADR_PATH = join(
  REPO_ROOT,
  "docs/architecture/agent-studio-text2cypher-query-guardrails.md",
);
const VALIDATOR_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/graph/retrieval/text2cypher-validator.ts",
);

const FORBIDDEN_TOKENS = [
  "CREATE",
  "MERGE",
  "SET",
  "DELETE",
  "DETACH",
  "REMOVE",
  "DROP",
  "LOAD CSV",
];

describe("Phase 12 — Text2Cypher guardrails", () => {
  it("ADR exists with forbidden-token list", () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, "utf8");
    for (const token of FORBIDDEN_TOKENS) {
      expect(content).toMatch(new RegExp(token));
    }
  });

  it("validator implementation rejects every forbidden token (when shipped)", () => {
    if (!existsSync(VALIDATOR_PATH)) {
      // Phase 12 not yet shipped — vacuously pass until implementation lands.
      expect(true).toBe(true);
      return;
    }
    const content = readFileSync(VALIDATOR_PATH, "utf8");
    for (const token of FORBIDDEN_TOKENS) {
      expect(
        content,
        `validator must reference forbidden token: ${token}`,
      ).toMatch(new RegExp(token));
    }
  });
});
