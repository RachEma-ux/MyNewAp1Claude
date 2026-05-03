/**
 * AI Agent Studio — Boot-time seed for the 5 legacy fixture agents
 *
 * Mirrors the seed-agent-studio-expert.ts pattern exactly: idempotent
 * boot-time insert into asdb (Agent Studio's own DB), no cross-module
 * reads or writes, no dependency on scripts/seed-agents.ts (the legacy
 * agents module's seed which targets a different DB and a different
 * schema).
 *
 * The five fixtures originate from scripts/seed-agents.ts (Research
 * Analyst, Compliance Sentinel, Ideation Studio, Workflow Operator,
 * Runtime Monitor) but are re-authored here against the Studio's own
 * contracts — agsAgents + agsAgentDrafts. Fields without a Studio
 * equivalent (creationMode, anatomy, capabilities.custom, dailyBudget,
 * sandboxConstraints, expiresAt) are intentionally dropped.
 *
 * Each fixture creates: 1 ags_agents row + 1 ags_agent_drafts row,
 * back-wired via current_draft_id. No tools, skills, MCP bindings, or
 * permission rules — these are simple text-only fixture agents.
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "./connection";
import {
  agsAgents,
  agsAgentDrafts,
} from "../../../drizzle/tables/agent-studio";

interface Fixture {
  internalKey: string;
  name: string;
  description: string;
  agentClass: "assistant" | "specialist" | "orchestrator";
  tags: string[];
  systemInstructions: string;
  providerConfig: {
    provider: string;
    model: string;
    temperature: number;
    apiKeyEnvVar: string;
  };
}

const FIXTURES: Fixture[] = [
  {
    internalKey: "research-analyst-alpha",
    name: "Research Analyst Alpha",
    description: "Focused on research synthesis and structured analysis.",
    agentClass: "assistant",
    tags: ["research", "analysis", "fixture"],
    systemInstructions:
      "You are a research analyst. Synthesize source material into structured findings, compare evidence, and present concise analysis with explicit uncertainty.",
    providerConfig: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.3,
      apiKeyEnvVar: "OPENAI_API_KEY",
    },
  },
  {
    internalKey: "compliance-review-sentinel",
    name: "Compliance Review Sentinel",
    description: "Policy and compliance review agent.",
    agentClass: "specialist",
    tags: ["compliance", "review", "fixture"],
    systemInstructions:
      "You are a compliance reviewer. Assess outputs against policy, identify violations conservatively, and return remediation guidance with clear rationale.",
    providerConfig: {
      provider: "openai",
      model: "gpt-4.1",
      temperature: 0.2,
      apiKeyEnvVar: "OPENAI_API_KEY",
    },
  },
  {
    internalKey: "ideation-spark-studio",
    name: "Ideation Spark Studio",
    description: "Brainstorming and creative idea generation.",
    agentClass: "assistant",
    tags: ["ideation", "creative", "fixture"],
    systemInstructions:
      "You are an ideation assistant. Generate diverse concepts, explore alternatives broadly, and expand promising directions without converging too early.",
    providerConfig: {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      temperature: 1.1,
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
    },
  },
  {
    internalKey: "workflow-operator-delta",
    name: "Workflow Operator Delta",
    description: "Workflow-oriented operational agent.",
    agentClass: "orchestrator",
    tags: ["workflow", "operations", "fixture"],
    systemInstructions:
      "You are an automation operator. Execute workflow steps predictably, track operational state, and surface blockers immediately with concise run summaries.",
    providerConfig: {
      provider: "google",
      model: "gemini-2.5-flash",
      temperature: 0.4,
      apiKeyEnvVar: "GOOGLE_API_KEY",
    },
  },
  {
    internalKey: "runtime-monitor-echo",
    name: "Runtime Monitor Echo",
    description: "Event-driven monitoring and alert analysis.",
    agentClass: "specialist",
    tags: ["monitoring", "events", "fixture"],
    systemInstructions:
      "You are a runtime monitoring agent. Analyze incoming alerts, classify severity, correlate obvious signals, and recommend next actions for operators.",
    providerConfig: {
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.1,
      apiKeyEnvVar: "OPENAI_API_KEY",
    },
  },
];

interface SeedResult {
  total: number;
  created: number;
  skipped: number;
  results: Array<{
    name: string;
    internalKey: string;
    created: boolean;
    agentId: number;
  }>;
}

export async function seedLegacyFixtures(): Promise<SeedResult> {
  const db = getAsDb();
  if (!db) {
    return { total: 0, created: 0, skipped: 0, results: [] };
  }

  const results: SeedResult["results"] = [];
  let created = 0;
  let skipped = 0;

  for (const fixture of FIXTURES) {
    const existing = await db
      .select({ id: agsAgents.id })
      .from(agsAgents)
      .where(eq(agsAgents.internalKey, fixture.internalKey))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      results.push({
        name: fixture.name,
        internalKey: fixture.internalKey,
        created: false,
        agentId: existing[0].id,
      });
      continue;
    }

    const [agent] = await db
      .insert(agsAgents)
      .values({
        name: fixture.name,
        internalKey: fixture.internalKey,
        description: fixture.description,
        agentClass: fixture.agentClass,
        visibility: "private",
        lifecycleState: "new",
        environment: "draft",
        tags: fixture.tags,
        metadata: {
          seeded: true,
          source: "server/agent-studio/db/seed-legacy-fixtures.ts",
          fixture: true,
        },
      })
      .returning();

    const [draft] = await db
      .insert(agsAgentDrafts)
      .values({
        agentId: agent.id,
        name: fixture.name,
        description: fixture.description,
        agentClass: fixture.agentClass,
        visibility: "private",
        tags: fixture.tags,
        systemInstructions: fixture.systemInstructions,
        providerConfig: fixture.providerConfig,
        isCurrent: true,
      })
      .returning();

    await db
      .update(agsAgents)
      .set({ currentDraftId: draft.id })
      .where(eq(agsAgents.id, agent.id));

    created++;
    results.push({
      name: fixture.name,
      internalKey: fixture.internalKey,
      created: true,
      agentId: agent.id,
    });
  }

  return { total: FIXTURES.length, created, skipped, results };
}
