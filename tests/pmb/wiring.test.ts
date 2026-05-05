/**
 * Plan v3 Phase 43 — gateway-action wiring assertions.
 *
 * Static codebase scans that lock in the registered set of Plan v3
 * gateway actions across the four affected modules. Each test reads
 * a manifest/boot file and asserts the expected `registerPublicApi({
 *   action: "<key>", ... })` literal exists.
 *
 * Why source-string scans rather than booting modules:
 *   - Booting `agentStudio` triggers ASDB connection probes, the Phase 10
 *     scheduler, MCP self-attach, and the Phase 40 event subscribers.
 *     None of that is needed to verify "is the action key wired."
 *   - Source-string scans match the same regex `check:wiring`'s inventory
 *     uses (`scripts/check-module-wiring.ts`), so test pass ↔ wiring
 *     check pass for the action set Plan v3 cares about.
 *   - Failures point directly at the missing action key — no module-boot
 *     stack trace to dig through.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();

function read(p: string): string {
  return readFileSync(join(REPO_ROOT, p), "utf8");
}

function expectAllActionsRegistered(srcPath: string, actionKeys: string[]) {
  const src = read(srcPath);
  const missing: string[] = [];
  for (const key of actionKeys) {
    // Match `action: "<key>"` literal (single or double quotes).
    const re = new RegExp(`action\\s*:\\s*["']${key.replace(/\./g, "\\.")}["']`);
    if (!re.test(src)) missing.push(key);
  }
  expect(
    missing,
    `Missing registerPublicApi entries in ${srcPath}: ${missing.join(", ")}`,
  ).toEqual([]);
}

// ────────────────────────────────────────────────────────────────────
// Provider Connections
// ────────────────────────────────────────────────────────────────────

describe("Phase 43 wiring — Provider Connections public gateway actions", () => {
  it("registers the four no-secret read actions in manifest.ts", () => {
    expectAllActionsRegistered("server/provider-connections/manifest.ts", [
      "providerConnections.listActiveForProvider",
      "providerConnections.getConnectionStatus",
      "providerConnections.validateConnection",
      "providerConnections.getBindingEligibility",
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────
// AI Types
// ────────────────────────────────────────────────────────────────────

describe("Phase 43 wiring — AI Types provider/model + register actions", () => {
  it("registers catalog.publish, providerModels.listAvailable, catalog.register in manifest.ts", () => {
    expectAllActionsRegistered("server/ai-types/manifest.ts", [
      "aiTypes.catalog.publish",
      "aiTypes.providerModels.listAvailable",
      "aiTypes.catalog.register",
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Agent Studio — provider bindings
// ────────────────────────────────────────────────────────────────────

describe("Phase 43 wiring — Agent Studio provider binding actions", () => {
  it("registers all six binding lifecycle actions in boot.ts", () => {
    expectAllActionsRegistered("server/agent-studio/boot.ts", [
      "agentStudio.providerBindings.list",
      "agentStudio.providerBindings.create",
      "agentStudio.providerBindings.update",
      "agentStudio.providerBindings.remove",
      "agentStudio.providerBindings.validate",
      "agentStudio.providerBindings.resolveForRun",
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────
// OpenRouter — Model Access (D4)
// ────────────────────────────────────────────────────────────────────

describe("Phase 43 wiring — OpenRouter Model Access actions", () => {
  it("registers config.update + modelAccess.{execute,stream,validateBinding} in manifest.ts", () => {
    expectAllActionsRegistered("server/openrouter/manifest.ts", [
      "openRouter.config.update",
      "openRouter.modelAccess.execute",
      "openRouter.modelAccess.stream",
      "openRouter.modelAccess.validateBinding",
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Agent Studio — Export Catalog (Stage 8 + 10 additions)
// ────────────────────────────────────────────────────────────────────

describe("Phase 43 wiring — Agent Studio Export Catalog actions", () => {
  it("registers all six export-catalog actions in boot.ts", () => {
    expectAllActionsRegistered("server/agent-studio/boot.ts", [
      "agentStudio.exportCatalog.listCandidates",
      "agentStudio.exportCatalog.getCandidate",
      "agentStudio.exportCatalog.exportCandidate",
      "agentStudio.exportCatalog.markImported",
      "agentStudio.exportCatalog.reconcileImports",
      // Plan v3 Phase 41 — bulk drift scan + repair.
      "agentStudio.exportCatalog.reconcileSync",
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────
// AI Types — Import from Agent Studio (Phase 36)
// ────────────────────────────────────────────────────────────────────

describe("Phase 43 wiring — AI Types import-from-Agent-Studio surface", () => {
  it("exports listImportableAgentStudioCandidates and importAgentStudioCandidate", () => {
    // The Phase 36 import flow is consumed by the AI Types tRPC router
    // (Phase 35 UI surface). It is intentionally NOT a gateway action —
    // it is the AI Types-side *consumer* that calls
    // `agentStudio.exportCatalog.*` via gatewayCall. We assert the
    // public functions exist.
    const src = read("server/ai-types/import-from-agent-studio.ts");
    expect(src).toMatch(
      /export\s+async\s+function\s+listImportableAgentStudioCandidates\b/,
    );
    expect(src).toMatch(
      /export\s+async\s+function\s+importAgentStudioCandidate\b/,
    );
  });

  it("uses gatewayCall to reach Agent Studio (no direct cross-module imports)", () => {
    const src = read("server/ai-types/import-from-agent-studio.ts");
    expect(src).toMatch(/gatewayCall\b/);
    // Forbid any direct `from "../agent-studio` import.
    expect(src).not.toMatch(/from\s+["'][^"']*\.\.\/agent-studio/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Governance action key map — completeness across all 22 actions
// ────────────────────────────────────────────────────────────────────

describe("Phase 43 wiring — governance action-key-map covers every governance-tracked Plan v3 action", () => {
  // Only governance-tracked actions need an action-key-map entry. Public
  // APIs without a governance descriptor (e.g. low-risk read actions
  // registered via `registerPublicApi` but absent from the manifest's
  // `governanceActions` array) are intentionally omitted from the map.
  // The Provider Connections trio (`listActiveForProvider`,
  // `getConnectionStatus`, `validateConnection`) is the visible example —
  // they are no-secret read actions that don't carry governance permission.
  const GOVERNANCE_TRACKED_ACTIONS = [
    // Provider Connections — only the binding-eligibility check is
    // governance-tracked; the other three Phase 2 read actions are
    // public-API but not governed.
    "providerConnections.getBindingEligibility",
    // AI Types
    "aiTypes.catalog.publish",
    "aiTypes.providerModels.listAvailable",
    "aiTypes.catalog.register",
    // Agent Studio — provider bindings
    "agentStudio.providerBindings.list",
    "agentStudio.providerBindings.create",
    "agentStudio.providerBindings.update",
    "agentStudio.providerBindings.remove",
    "agentStudio.providerBindings.validate",
    "agentStudio.providerBindings.resolveForRun",
    // OpenRouter Model Access
    "openRouter.config.update",
    "openRouter.modelAccess.execute",
    "openRouter.modelAccess.stream",
    "openRouter.modelAccess.validateBinding",
    // AS Export Catalog
    "agentStudio.exportCatalog.listCandidates",
    "agentStudio.exportCatalog.getCandidate",
    "agentStudio.exportCatalog.exportCandidate",
    "agentStudio.exportCatalog.markImported",
    "agentStudio.exportCatalog.reconcileImports",
    "agentStudio.exportCatalog.reconcileSync",
  ];

  it("every governance-tracked action has an entry in server/governance/action-key-map.ts", () => {
    const src = read("server/governance/action-key-map.ts");
    const missing: string[] = [];
    for (const key of GOVERNANCE_TRACKED_ACTIONS) {
      // Action keys map to themselves: `"key": "key"` literal pair.
      const re = new RegExp(`["']${key.replace(/\./g, "\\.")}["']`);
      if (!re.test(src)) missing.push(key);
    }
    expect(
      missing,
      `Missing action-key-map entries: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("Provider Connections public-read actions are intentionally NOT in the action-key-map", () => {
    // Regression guard: if a future PR adds these to the map, the test
    // forces the author to either confirm the policy change or roll back.
    const src = read("server/governance/action-key-map.ts");
    const NON_GOVERNED_PUBLIC = [
      "providerConnections.listActiveForProvider",
      "providerConnections.getConnectionStatus",
      "providerConnections.validateConnection",
    ];
    for (const key of NON_GOVERNED_PUBLIC) {
      const re = new RegExp(`["']${key.replace(/\./g, "\\.")}["']`);
      expect(
        src,
        `${key} unexpectedly added to action-key-map — confirm governance policy change`,
      ).not.toMatch(re);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// Receipt-required descriptors carry the receipt flag
// ────────────────────────────────────────────────────────────────────

describe("Phase 43 wiring — receipt-required descriptors are registered with receiptRequired=true", () => {
  // The Plan v3 Receipt Policy (Phase 20) marks these actions as
  // receiptRequired at the descriptor level (the gateway enforces the
  // receipt before invoking the handler).
  //
  // Note: openRouter.modelAccess.{execute,stream} are intentionally
  // *not* listed here — they use Phase 20's hybrid policy with
  // `receiptRequired: false` at the descriptor and handler-level
  // per-intent enforcement via `enforceModelAccessReceipt`. That's
  // covered by `manifest-receipt-policy.test.ts` already.
  const RECEIPT_REQUIRED = [
    {
      file: "server/agent-studio/boot.ts",
      action: "agentStudio.agent.publish",
    },
    {
      file: "server/agent-studio/boot.ts",
      action: "agentStudio.run.execute",
    },
    {
      file: "server/agent-studio/boot.ts",
      action: "agentStudio.exportCatalog.exportCandidate",
    },
    {
      file: "server/agent-studio/boot.ts",
      action: "agentStudio.exportCatalog.reconcileImports",
    },
    {
      file: "server/agent-studio/boot.ts",
      action: "agentStudio.exportCatalog.reconcileSync",
    },
    {
      file: "server/ai-types/manifest.ts",
      action: "aiTypes.catalog.publish",
    },
    {
      file: "server/ai-types/manifest.ts",
      action: "aiTypes.catalog.register",
    },
    {
      file: "server/openrouter/manifest.ts",
      action: "openRouter.config.update",
    },
  ];

  it("each receipt-required action has `receiptRequired: true` in its descriptor", () => {
    // Locate the registerPublicApi block by `action: "<key>"` literal,
    // then scan a window large enough to cover Plan v3's biggest
    // handler (~50 lines / ~2500 chars).
    const offenders: string[] = [];
    for (const { file, action } of RECEIPT_REQUIRED) {
      const src = read(file);
      const actionRe = new RegExp(
        `action\\s*:\\s*["']${action.replace(/\./g, "\\.")}["']`,
      );
      const m = actionRe.exec(src);
      if (!m) {
        offenders.push(`${file}: action ${action} not found`);
        continue;
      }
      const window = src.slice(m.index, m.index + 2500);
      if (!/receiptRequired\s*:\s*true/.test(window)) {
        offenders.push(`${file}: ${action} missing receiptRequired:true`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
// `events.emits` covers the Stage 10 catalog lifecycle events
// ────────────────────────────────────────────────────────────────────

describe("Phase 43 wiring — events.emits declares Stage 10 catalog lifecycle", () => {
  it("AI Types manifest emits registered + published + deprecated", () => {
    const src = read("server/ai-types/manifest.ts");
    // The manifest's events block lists each event as a string literal.
    expect(src).toMatch(/["']aiTypes\.catalog\.registered["']/);
    expect(src).toMatch(/["']aiTypes\.catalog\.published["']/);
    expect(src).toMatch(/["']aiTypes\.catalog\.deprecated["']/);
  });

  it("Agent Studio manifest consumes the three catalog events (Phase 40)", () => {
    const src = read("server/agent-studio/manifest.ts");
    expect(src).toMatch(/consumes\s*:\s*\[[\s\S]*aiTypes\.catalog\.registered/);
    expect(src).toMatch(/aiTypes\.catalog\.published/);
    expect(src).toMatch(/aiTypes\.catalog\.deprecated/);
  });

  it("Agent Studio boot.ts has subscribeEvent calls for all three event types", () => {
    const src = read("server/agent-studio/boot.ts");
    expect(src).toMatch(
      /subscribeEvent\s*\(\s*["']aiTypes\.catalog\.registered["']/,
    );
    expect(src).toMatch(
      /subscribeEvent\s*\(\s*["']aiTypes\.catalog\.published["']/,
    );
    expect(src).toMatch(
      /subscribeEvent\s*\(\s*["']aiTypes\.catalog\.deprecated["']/,
    );
  });
});
