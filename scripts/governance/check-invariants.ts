/**
 * Governance Invariant Static Guard
 *
 * Scans source code for patterns that violate AI Types governance invariants.
 * Exits with code 1 if any violation is found — blocks CI.
 *
 * Invariants checked:
 *   1. Domain routers must NOT call createCatalogEntry() directly
 *   2. Runtime availability must use the shared helper, not inline conditions
 *   3. Domain routers must NOT import createCatalogEntry from ../db
 *
 * See: docs/governance/GOVERNANCE_CONTRACT.md
 */

import * as fs from "fs";
import * as path from "path";

interface Violation {
  file: string;
  line: number;
  rule: string;
  text: string;
}

const ROOT = process.cwd();
const violations: Violation[] = [];

// ── Helper: read file lines ──────────────────────────────────────────

function readLines(filePath: string): string[] {
  try {
    return fs.readFileSync(filePath, "utf-8").split("\n");
  } catch {
    return [];
  }
}

// ── Domain router files that must NOT create catalog entries ──────────

const DOMAIN_ROUTERS = [
  "server/routers/agents.ts",
  "server/routers/llm.ts",
  "server/routers/models.ts",
  "server/routers/bots.ts",
  "server/routers/llm-providers.ts",
];

// ── Rule 1: No createCatalogEntry in domain routers ──────────────────

for (const relPath of DOMAIN_ROUTERS) {
  const absPath = path.join(ROOT, relPath);
  const lines = readLines(absPath);

  const fullContent = lines.join("\n");
  const hasImportToCatalog = /importToCatalog/.test(fullContent);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for direct createCatalogEntry calls
    if (/createCatalogEntry\s*\(/.test(line)) {
      // Allow if file has an importToCatalog procedure — the call is part of catalog intake
      if (hasImportToCatalog) continue;

      violations.push({
        file: relPath,
        line: i + 1,
        rule: "INV-1/INV-2: Domain router must not call createCatalogEntry() directly",
        text: line.trim(),
      });
    }

    // Check for import of createCatalogEntry — allowed if file has importToCatalog
    if (/import\s*\{[^}]*createCatalogEntry[^}]*\}\s*from/.test(line) && !hasImportToCatalog) {
      violations.push({
        file: relPath,
        line: i + 1,
        rule: "INV-1/INV-2: Domain router must not import createCatalogEntry",
        text: line.trim(),
      });
    }
  }
}

// ── Rule 2: No inlined availability checks in runtime paths ──────────
//
// We scan for patterns like `status === "active"` combined with
// `reviewState === "approved"` in the same file outside of:
//   - server/ai-types/availability.ts (where the rule IS defined —
//     relocated from server/catalog/availability.ts per the AI Types
//     Standalone Roadmap)
//   - shared/catalog-* helpers (where state/lifecycle is canonically
//     derived)
//   - server/ai-types/validation/router.ts (legitimate validation
//     router that touches the canonical fields directly to enforce
//     the rule for its callers — not an inlined bypass)
//   - test files
//   - docs/scripts

const AVAILABILITY_EXEMPT = [
  "server/ai-types/availability.ts",
  "server/ai-types/validation/router.ts",
  "shared/catalog-state.ts",
  "shared/catalog-execution.ts",
  "shared/catalog-lifecycle.ts",
];

function scanForInlinedAvailability(dir: string) {
  const entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });

  for (const entry of entries) {
    const relPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, dist, test dirs, docs
      if (["node_modules", "dist", ".git", "docs", "scripts"].includes(entry.name)) continue;
      scanForInlinedAvailability(relPath);
      continue;
    }

    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
    if (AVAILABILITY_EXEMPT.some((exempt) => relPath === exempt)) continue;

    const lines = readLines(path.join(ROOT, relPath));
    let hasStatusActive = false;
    let hasReviewApproved = false;
    let statusLine = -1;
    let reviewLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comments
      if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

      // Look for inlined availability patterns that aren't importing from the shared module
      if (/\.status\s*===?\s*["']active["']/.test(line) && !/CATALOG_AVAILABILITY_FILTERS/.test(line) && !/import/.test(line)) {
        hasStatusActive = true;
        statusLine = i + 1;
      }
      if (/\.reviewState\s*===?\s*["']approved["']/.test(line) && !/CATALOG_AVAILABILITY_FILTERS/.test(line) && !/import/.test(line)) {
        hasReviewApproved = true;
        reviewLine = i + 1;
      }
    }

    // Only flag if BOTH conditions are inlined in the same file (likely an availability bypass)
    if (hasStatusActive && hasReviewApproved) {
      violations.push({
        file: relPath,
        line: statusLine,
        rule: "INV-4/INV-5: Inlined availability check — use server/ai-types/availability.ts helpers instead",
        text: `Found status==="active" (line ${statusLine}) and reviewState==="approved" (line ${reviewLine}) in same file`,
      });
    }
  }
}

// Scan server/ and shared/ directories
scanForInlinedAvailability("server");
scanForInlinedAvailability("shared");

// ── Report ───────────────────────────────────────────────────────────

console.log("════════════════════════════════════════════════════════");
console.log("  Governance Invariant Static Guard");
console.log("════════════════════════════════════════════════════════");
console.log();

if (violations.length === 0) {
  console.log("PASS: No governance invariant violations detected.");
  console.log();
  console.log("Checked:");
  console.log(`  - ${DOMAIN_ROUTERS.length} domain routers for createCatalogEntry usage`);
  console.log("  - server/ and shared/ for inlined availability checks");
  console.log();
  process.exit(0);
} else {
  console.log(`FAIL: ${violations.length} governance invariant violation(s) detected.`);
  console.log();

  for (const v of violations) {
    console.log(`  [${v.rule}]`);
    console.log(`    File: ${v.file}:${v.line}`);
    console.log(`    Text: ${v.text}`);
    console.log();
  }

  console.log("See: docs/governance/GOVERNANCE_CONTRACT.md");
  console.log("════════════════════════════════════════════════════════");
  process.exit(1);
}
