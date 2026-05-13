// Golden Questions live engine factory — env parser + boundary scan.
//
// The factory is the one module in the Golden Questions surface that
// composes the GraphRepository / OpenRouter Model Access / MCP
// dispatcher boundaries. This test:
//
//   1. Exercises `parseLiveEnv()` — pure, no boundary touch — across
//      every documented failure mode.
//   2. Source-scans `live-engine-factory.ts` to enforce the hard
//      rules from CLAUDE.md:
//      - No `neo4j-driver` import outside the GraphRepository tree.
//      - No raw `process.env.*_API_KEY` reads (Plan v3 D1 — provider
//        credentials must flow through `withProviderCredential`).
//      - Imports `getGraphRepository` (graph access).
//      - Imports `dispatchMcpToolCall` (MCP boundary).
//      - Imports `execute` from `openrouter/model-access` (model
//        boundary).
//      - No raw `neo4j` connection construction.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseLiveEnv } from "../../../../server/agent-studio/services/graph-skill/golden-questions/live-engine-factory.js";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const FACTORY_PATH = join(
  REPO_ROOT,
  "server",
  "agent-studio",
  "services",
  "graph-skill",
  "golden-questions",
  "live-engine-factory.ts",
);

const SRC = readFileSync(FACTORY_PATH, "utf8");

describe("parseLiveEnv", () => {
  const VALID = {
    GOLDEN_Q_LIVE: "true",
    GOLDEN_Q_LIVE_PROVIDER_CONNECTION_ID: "42",
    GOLDEN_Q_LIVE_MODEL_REF: "anthropic/claude-3-5-sonnet",
    GOLDEN_Q_LIVE_WORKSPACE_ID: "7",
    GOLDEN_Q_LIVE_ACTOR_ID: "13",
  };

  it("returns ok with parsed integers when all env vars are set", () => {
    const res = parseLiveEnv(VALID);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.providerConnectionId).toBe(42);
      expect(res.config.modelRef).toBe("anthropic/claude-3-5-sonnet");
      expect(res.config.workspaceId).toBe(7);
      expect(res.config.actorId).toBe(13);
    }
  });

  it("fails when GOLDEN_Q_LIVE is not 'true'", () => {
    const res = parseLiveEnv({ ...VALID, GOLDEN_Q_LIVE: "false" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/GOLDEN_Q_LIVE is not 'true'/);
  });

  it("fails when GOLDEN_Q_LIVE is unset", () => {
    const env = { ...VALID } as Record<string, string | undefined>;
    delete env.GOLDEN_Q_LIVE;
    const res = parseLiveEnv(env as NodeJS.ProcessEnv);
    expect(res.ok).toBe(false);
  });

  it("fails listing every missing required var", () => {
    const res = parseLiveEnv({ GOLDEN_Q_LIVE: "true" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/GOLDEN_Q_LIVE_PROVIDER_CONNECTION_ID/);
      expect(res.reason).toMatch(/GOLDEN_Q_LIVE_MODEL_REF/);
      expect(res.reason).toMatch(/GOLDEN_Q_LIVE_WORKSPACE_ID/);
      expect(res.reason).toMatch(/GOLDEN_Q_LIVE_ACTOR_ID/);
    }
  });

  it("fails when providerConnectionId is not a positive integer", () => {
    const res = parseLiveEnv({
      ...VALID,
      GOLDEN_Q_LIVE_PROVIDER_CONNECTION_ID: "0",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/positive integer/);
  });

  it("fails when workspaceId is non-numeric", () => {
    const res = parseLiveEnv({
      ...VALID,
      GOLDEN_Q_LIVE_WORKSPACE_ID: "abc",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/WORKSPACE_ID/);
  });

  it("fails when actorId is non-numeric", () => {
    const res = parseLiveEnv({
      ...VALID,
      GOLDEN_Q_LIVE_ACTOR_ID: "x",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/ACTOR_ID/);
  });
});

describe("live-engine-factory.ts boundary scan", () => {
  it("does not import neo4j-driver", () => {
    expect(SRC).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(SRC).not.toMatch(/require\(\s*["']neo4j-driver["']/);
  });

  it("does not read process.env API-key vars directly", () => {
    // Plan v3 D1: provider credentials flow through withProviderCredential.
    // The factory imports execute() from model-access which uses
    // withProviderCredential internally; this file MUST NOT shortcut.
    expect(SRC).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
    expect(SRC).not.toMatch(/process\.env\.OPENROUTER_API_KEY/);
    expect(SRC).not.toMatch(/process\.env\.ANTHROPIC_API_KEY/);
    expect(SRC).not.toMatch(/process\.env\.OPENAI_API_KEY/);
  });

  it("imports getGraphRepository (graph-access chokepoint)", () => {
    expect(SRC).toMatch(/getGraphRepository/);
  });

  it("imports dispatchMcpToolCall (MCP chokepoint)", () => {
    expect(SRC).toMatch(/dispatchMcpToolCall/);
  });

  it("imports execute from openrouter/model-access (model chokepoint)", () => {
    expect(SRC).toMatch(/openrouter\/model-access/);
    expect(SRC).toMatch(/modelAccessExecute|execute\s+as\s+modelAccessExecute|\bexecute\b/);
  });

  it("does not directly construct a neo4j driver instance", () => {
    expect(SRC).not.toMatch(/neo4j\.driver\s*\(/);
  });

  it("does not write to graph state (no graph-mutation call sites)", () => {
    // Read-only by Graph Agent Lite contract — no
    // upsertNode/upsertEdge/insertNode/insertEdge invocations.
    expect(SRC).not.toMatch(/\binsertNode\b\s*\(/);
    expect(SRC).not.toMatch(/\binsertEdge\b\s*\(/);
    expect(SRC).not.toMatch(/\bupsertNode\b\s*\(/);
    expect(SRC).not.toMatch(/\bupsertEdge\b\s*\(/);
  });
});

describe("script CLI boundary — run-golden-questions.ts", () => {
  const SCRIPT_PATH = join(
    REPO_ROOT,
    "scripts",
    "agent-studio",
    "run-golden-questions.ts",
  );
  const SCRIPT = readFileSync(SCRIPT_PATH, "utf8");

  it("does not read process.env API-key vars directly (Plan v3 D1)", () => {
    expect(SCRIPT).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("dispatches via the factory parseLiveEnv + buildLiveEngine path", () => {
    expect(SCRIPT).toMatch(/parseLiveEnv/);
    expect(SCRIPT).toMatch(/buildLiveEngine/);
  });

  it("preserves dry-run as default mode", () => {
    expect(SCRIPT).toMatch(/mode:\s*"dry-run"/);
  });

  it("emits machine-readable JSON sidecar in live mode", () => {
    expect(SCRIPT).toMatch(/formatLiveReportJson|jsonOutput|\.json/);
  });

  it("exits non-zero when overall verdict is FAIL", () => {
    expect(SCRIPT).toMatch(/process\.exit\(summary\.overallPassed \? 0 : 1\)/);
  });

  it("exits with code 2 on live-mode config error", () => {
    expect(SCRIPT).toMatch(/process\.exit\(2\)/);
  });
});
