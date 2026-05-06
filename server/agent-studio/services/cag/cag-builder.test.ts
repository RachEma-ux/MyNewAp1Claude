/**
 * RAC Phase 1B — CAG builder/validator/renderer unit tests.
 *
 * No DB; the builder/validator/renderer are pure transformations.
 */

import { describe, it, expect } from "vitest";
import {
  buildCapabilityPack,
  type BuildPackInput,
} from "./builder";
import { validatePackContent } from "./validator";
import {
  renderCapabilityPack,
  MANDATORY_ASSERTIONS,
  CAG_MAX_PROMPT_TOKENS,
  estimateTokens,
} from "./renderer";
import { classifyTool, readRiskClass } from "./risk-classifier";
import type { CapabilityPackContent } from "./types";

const baseInput: BuildPackInput = {
  workspaceId: 2,
  agentId: 1,
  draftSnapshot: {
    agentDraftId: 1,
    name: "Agent Studio Expert",
    role: "advisor",
    scope: "guides users through Agent Studio configuration",
    mission: "help users ship reliable agents",
  },
  skills: [
    { id: 10, name: "ConfigureAgent", description: "Walk users through draft setup." },
    { id: 11, name: "DiagnoseFailures", description: "Inspect run traces for failures." },
  ],
  mcpServers: [
    {
      serverId: 100,
      serverName: "studio",
      snapshotVersion: 3,
      tools: [
        { name: "calculator", description: "Arithmetic.", riskClass: "read_only" },
        { name: "current_time", description: "UTC timestamp.", riskClass: "read_only" },
      ],
    },
  ],
};

// ── risk-classifier ──────────────────────────────────────────────────

describe("CAG risk-classifier", () => {
  it("reads riskClass from manifest when present", () => {
    expect(readRiskClass({ name: "x", riskClass: "destructive" })).toBe("destructive");
  });

  it("falls back to provisional table for built-in tools", () => {
    expect(readRiskClass({ name: "calculator" })).toBe("read_only");
    expect(readRiskClass({ name: "url_parser" })).toBe("read_only");
  });

  it("returns 'quarantined' for unknown tools without manifest class", () => {
    expect(readRiskClass({ name: "unknown_thing" })).toBe("quarantined");
  });

  it("classifyTool sets sandboxRequired iff code_execution", () => {
    expect(classifyTool({ name: "shell", riskClass: "code_execution" }).sandboxRequired).toBe(true);
    expect(classifyTool({ name: "calculator" }).sandboxRequired).toBe(false);
  });

  it("classifyTool defaults approvalRequired for write/destructive/etc", () => {
    expect(classifyTool({ name: "x", riskClass: "destructive" }).approvalRequired).toBe(true);
    expect(classifyTool({ name: "x", riskClass: "external_side_effect" }).approvalRequired).toBe(true);
    expect(classifyTool({ name: "x", riskClass: "governance_sensitive" }).approvalRequired).toBe(true);
    expect(classifyTool({ name: "calculator" }).approvalRequired).toBe(false);
  });

  it("classifyTool respects explicit approvalRequired override", () => {
    expect(
      classifyTool({ name: "x", riskClass: "read_only", approvalRequired: true })
        .approvalRequired,
    ).toBe(true);
  });
});

// ── builder ───────────────────────────────────────────────────────────

describe("CAG builder", () => {
  it("produces a pack with identity, skills, tools, and sources", () => {
    const out = buildCapabilityPack(baseInput);
    expect(out.content.identity.name).toBe("Agent Studio Expert");
    expect(out.content.identity.agentId).toBe(1);
    expect(out.content.skills).toHaveLength(2);
    expect(out.content.tools).toHaveLength(2);
    expect(out.content.tools[0].riskClass).toBe("read_only");
    expect(out.content.sources.length).toBeGreaterThan(0);
    expect(out.warnings).toHaveLength(0);
  });

  it("strips quarantined tools and records a warning", () => {
    const out = buildCapabilityPack({
      ...baseInput,
      mcpServers: [
        {
          serverId: 100,
          serverName: "studio",
          snapshotVersion: 1,
          tools: [
            { name: "calculator", riskClass: "read_only" },
            { name: "mystery_tool" }, // no manifest class → quarantined
          ],
        },
      ],
    });
    expect(out.content.tools.map((t) => t.name)).toEqual(["calculator"]);
    expect(out.warnings.some((w) => /mystery_tool/.test(w) && /quarantined/.test(w))).toBe(true);
  });

  it("strips credential_sensitive tools", () => {
    const out = buildCapabilityPack({
      ...baseInput,
      mcpServers: [
        {
          serverId: 100,
          serverName: "studio",
          snapshotVersion: 1,
          tools: [{ name: "fetch_secret", riskClass: "credential_sensitive" }],
        },
      ],
    });
    expect(out.content.tools).toHaveLength(0);
    expect(out.warnings.some((w) => /credential surface forbidden/.test(w))).toBe(true);
  });

  it("source manifest hash is stable across identical inputs (drives reuse)", () => {
    const a = buildCapabilityPack(baseInput);
    const b = buildCapabilityPack(baseInput);
    expect(a.sourceManifest).toEqual(b.sourceManifest);
  });

  it("source manifest hash changes when MCP snapshot version changes", () => {
    const a = buildCapabilityPack(baseInput);
    const b = buildCapabilityPack({
      ...baseInput,
      mcpServers: [{ ...baseInput.mcpServers[0], snapshotVersion: 4 }],
    });
    const aMcp = a.sourceManifest.find((e) => e.sourceType === "mcp_snapshot")!;
    const bMcp = b.sourceManifest.find((e) => e.sourceType === "mcp_snapshot")!;
    expect(aMcp.hash).not.toBe(bMcp.hash);
  });

  it("emits a source manifest entry per skill and per mcp server", () => {
    const out = buildCapabilityPack(baseInput);
    const types = out.sourceManifest.map((e) => e.sourceType).sort();
    expect(types).toEqual(["agent_draft", "mcp_snapshot", "skill", "skill"]);
  });
});

// ── validator ─────────────────────────────────────────────────────────

describe("CAG validator", () => {
  function basePack(): CapabilityPackContent {
    return {
      identity: { agentId: 1, agentDraftId: 1, name: "X", role: null, scope: null },
      mission: null,
      skills: [],
      tools: [
        {
          name: "calculator",
          serverId: 1,
          serverName: "studio",
          summary: "",
          riskClass: "read_only",
          approvalRequired: false,
          sandboxRequired: false,
        },
      ],
      sources: [],
    };
  }

  it("passes a clean pack", () => {
    expect(validatePackContent(basePack()).ok).toBe(true);
  });

  it("rejects secret-shaped fields anywhere in the tree", () => {
    const p = basePack();
    (p.identity as unknown as Record<string, unknown>).apiKey = "sk-leak";
    const r = validatePackContent(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => /apiKey/.test(v) && /forbidden/i.test(v))).toBe(true);
    }
  });

  it("rejects nested credential keys (encrypted_pat, x-api-key, Bearer)", () => {
    const p = basePack();
    (p.tools[0] as unknown as Record<string, unknown>).encrypted_pat = "x";
    (p.tools[0] as unknown as Record<string, unknown>)["x-api-key"] = "y";
    const r = validatePackContent(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => /encrypted_pat/.test(v))).toBe(true);
      expect(r.violations.some((v) => /x-api-key/.test(v))).toBe(true);
    }
  });

  it("rejects RAG-chunk-shaped objects (content+embedding+source_chunk_id)", () => {
    const p = basePack();
    (p as unknown as Record<string, unknown>).leak = {
      content: "doc body",
      embedding: [0.1, 0.2],
      source_chunk_id: "abc",
    };
    const r = validatePackContent(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => /resembles a RAG chunk/.test(v))).toBe(true);
    }
  });

  it("rejects raw inputSchema on a tool (D-TOOL-3)", () => {
    const p = basePack();
    (p.tools[0] as unknown as Record<string, unknown>).inputSchema = { type: "object" };
    const r = validatePackContent(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => /inputSchema is forbidden/.test(v))).toBe(true);
    }
  });

  it("rejects example invocations on a tool (D-TOOL-3)", () => {
    const p = basePack();
    (p.tools[0] as unknown as Record<string, unknown>).examples = [{ args: { x: 1 } }];
    const r = validatePackContent(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => /example invocations are forbidden/.test(v))).toBe(true);
    }
  });

  it("rejects code_execution tool that wasn't sandbox-marked", () => {
    const p = basePack();
    p.tools[0] = {
      ...p.tools[0],
      name: "shell",
      riskClass: "code_execution",
      sandboxRequired: false,
    };
    const r = validatePackContent(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.violations.some((v) => /sandboxRequired=true/.test(v)),
      ).toBe(true);
    }
  });
});

// ── renderer ──────────────────────────────────────────────────────────

describe("CAG renderer", () => {
  it("omits the mission line (Collision A regression)", () => {
    const out = buildCapabilityPack(baseInput);
    const sec = renderCapabilityPack(out.content);
    expect(sec.text).not.toContain("help users ship reliable agents");
    expect(sec.text).not.toMatch(/^Mission:/m);
  });

  it("includes all six MANDATORY_ASSERTIONS", () => {
    const out = buildCapabilityPack(baseInput);
    const sec = renderCapabilityPack(out.content);
    expect(MANDATORY_ASSERTIONS.length).toBe(6);
    for (const a of MANDATORY_ASSERTIONS) {
      expect(sec.text).toContain(a);
    }
  });

  it("returns the SystemPromptSection contract shape", () => {
    const out = buildCapabilityPack(baseInput);
    const sec = renderCapabilityPack(out.content);
    expect(sec.id).toBe("capability-pack");
    expect(typeof sec.text).toBe("string");
    expect(sec.tokenEstimate).toBeGreaterThan(0);
    expect(sec.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Array.isArray(sec.warnings)).toBe(true);
  });

  it("contentHash is stable across identical inputs", () => {
    const out = buildCapabilityPack(baseInput);
    const a = renderCapabilityPack(out.content);
    const b = renderCapabilityPack(out.content);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("contentHash changes when tool list changes", () => {
    const a = renderCapabilityPack(buildCapabilityPack(baseInput).content);
    const b = renderCapabilityPack(
      buildCapabilityPack({
        ...baseInput,
        mcpServers: [
          {
            ...baseInput.mcpServers[0],
            tools: [{ name: "calculator", riskClass: "read_only" }],
          },
        ],
      }).content,
    );
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it("emits per-tool risk + approval + sandbox badges and summary", () => {
    const out = buildCapabilityPack({
      ...baseInput,
      mcpServers: [
        {
          serverId: 200,
          serverName: "ops",
          snapshotVersion: 1,
          tools: [
            { name: "deploy_service", description: "Push container.", riskClass: "external_side_effect" },
            { name: "shell", description: "Run shell command.", riskClass: "code_execution" },
          ],
        },
      ],
    });
    const sec = renderCapabilityPack(out.content);
    expect(sec.text).toMatch(/ops::deploy_service.*risk=external_side_effect.*approval-required/);
    expect(sec.text).toMatch(/ops::shell.*risk=code_execution.*sandbox-required/);
    expect(sec.text).toContain("Push container.");
  });

  it("does NOT emit raw inputSchema (D-TOOL-3 regression)", () => {
    // Even if a malformed pack slipped past the validator, the renderer
    // never sees inputSchema in the section because CapabilityPackContent
    // doesn't carry it. This test asserts the rendered text never contains
    // a JSON-schema-shaped string for known tools.
    const out = buildCapabilityPack({
      ...baseInput,
      mcpServers: [
        {
          serverId: 100,
          serverName: "studio",
          snapshotVersion: 1,
          tools: [
            {
              name: "calculator",
              description: "Arithmetic.",
              riskClass: "read_only",
              inputSchema: { type: "object", properties: { a: { type: "number" } } },
            },
          ],
        },
      ],
    });
    const sec = renderCapabilityPack(out.content);
    expect(sec.text).not.toContain('"type"');
    expect(sec.text).not.toContain('"properties"');
  });

  it("truncates tools to fit CAG_MAX_PROMPT_TOKENS budget", () => {
    const fatTools = Array.from({ length: 600 }, (_, i) => ({
      name: `tool_${i}_with_a_reasonably_long_name_to_eat_budget`,
      description: "x".repeat(80),
      riskClass: "write" as const,
    }));
    const out = buildCapabilityPack({
      ...baseInput,
      mcpServers: [
        { serverId: 100, serverName: "studio", snapshotVersion: 1, tools: fatTools },
      ],
    });
    const sec = renderCapabilityPack(out.content);
    expect(sec.tokenEstimate).toBeLessThanOrEqual(CAG_MAX_PROMPT_TOKENS);
    expect(sec.warnings.some((w) => /tools truncated/.test(w))).toBe(true);
    // Mandatory assertions still emitted post-truncation
    for (const a of MANDATORY_ASSERTIONS) expect(sec.text).toContain(a);
  });

  it("estimateTokens uses chars/4 proxy", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("abcdefghi")).toBe(3); // ceil(9/4)=3
  });
});
