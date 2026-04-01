/**
 * WF-ORCHESTRATOR — Governance-Complete Agent Seed
 *
 * Creates 4 WF-ORCHESTRATOR agents that pass ALL 10 execution gates:
 *   1. Entry exists              ✓ catalog_entries row
 *   2. Entry is executable type  ✓ entryType = "agent"
 *   3. Published tag             ✓ tags includes "published"
 *   4. Review approved           ✓ reviewState = "approved"
 *   5. Status active             ✓ status = "active"
 *   6. Bundle exists             ✓ publish_bundles row (active)
 *   7. Callable flag             ✓ config.callable = true
 *   8. Config schema valid       ✓ catalogAgentExecutionConfigSchema passes
 *   9. Source agent exists       ✓ agents table row
 *  10. Provider resolved         ✓ providerId set on entry + snapshot
 *
 * Idempotent: skips if catalog entries with name LIKE 'wf.orchestrator.%' exist.
 */

import { createHash } from "crypto";
import { eq, like } from "drizzle-orm";
import { getDb } from "../db/connection";
import { createCatalogEntry, createPublishBundle } from "../ai-types/db";
import { agents } from "../../drizzle/tables/agents";
import { providers } from "../../drizzle/tables/providers";
import { catalogEntries } from "../../drizzle/tables/catalog";
import { getWfDb } from "./connection";
import { wfCatalogImports } from "../../drizzle/tables/wfdb";

// ── Agent Definitions ───────────────────────────────────────────────

interface OrchestratorDef {
  key: string;            // e.g. "classifier"
  name: string;           // display name
  catalogName: string;    // e.g. "wf.orchestrator.classifier"
  roleClass: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
}

const ORCHESTRATOR_AGENTS: OrchestratorDef[] = [
  {
    key: "classifier",
    name: "WF-Orchestrator — Classifier",
    catalogName: "wf.orchestrator.classifier",
    roleClass: "analyst",
    description: "Classifies and routes incoming workflow requests based on intent, urgency, and domain.",
    systemPrompt:
      "You are a Classifier agent in the WF-Orchestrator crew. " +
      "Your role is to analyze incoming workflow requests and classify them by intent (approval, query, escalation, report), " +
      "urgency (critical, high, normal, low), and domain (finance, HR, engineering, compliance). " +
      "Output a structured classification with confidence scores. Be concise and decisive.",
    capabilities: ["classification", "routing"],
  },
  {
    key: "summarizer",
    name: "WF-Orchestrator — Summarizer",
    catalogName: "wf.orchestrator.summarizer",
    roleClass: "analyst",
    description: "Summarizes workflow outputs and execution results into concise reports.",
    systemPrompt:
      "You are a Summarizer agent in the WF-Orchestrator crew. " +
      "Your role is to take workflow execution outputs, logs, and results and produce clear, concise summaries. " +
      "Highlight key decisions made, actions taken, blockers encountered, and final outcomes. " +
      "Use bullet points and keep summaries under 200 words unless more detail is requested.",
    capabilities: ["summarization", "reporting"],
  },
  {
    key: "planner",
    name: "WF-Orchestrator — Planner",
    catalogName: "wf.orchestrator.planner",
    roleClass: "assistant",
    description: "Plans workflow step sequences and dependencies for execution.",
    systemPrompt:
      "You are a Planner agent in the WF-Orchestrator crew. " +
      "Your role is to analyze a workflow goal and break it into a sequence of executable steps with clear dependencies. " +
      "Consider parallel execution opportunities, resource constraints, and failure recovery paths. " +
      "Output a structured plan with step names, descriptions, dependencies, and estimated complexity.",
    capabilities: ["planning", "dependency-analysis"],
  },
  {
    key: "reviewer",
    name: "WF-Orchestrator — Reviewer",
    catalogName: "wf.orchestrator.reviewer",
    roleClass: "compliance",
    description: "Reviews workflow outputs for quality, compliance, and completeness.",
    systemPrompt:
      "You are a Reviewer agent in the WF-Orchestrator crew. " +
      "Your role is to review workflow outputs and decisions for quality, compliance with policies, and completeness. " +
      "Flag any issues, missing steps, policy violations, or quality concerns. " +
      "Provide a pass/fail verdict with specific findings and recommended remediation actions.",
    capabilities: ["review", "compliance-check"],
  },
];

// ── Provider Resolution ─────────────────────────────────────────────

async function resolveFirstProvider(): Promise<number | null> {
  const db = getDb();
  if (!db) return null;

  const [provider] = await db
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.enabled, true))
    .limit(1);

  return provider?.id ?? null;
}

// ── Idempotency Check ───────────────────────────────────────────────

async function orchestratorsAlreadyExist(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const existing = await db
    .select({ id: catalogEntries.id })
    .from(catalogEntries)
    .where(like(catalogEntries.name, "wf.orchestrator.%"))
    .limit(1);

  return existing.length > 0;
}

// ── Main Seed Function ──────────────────────────────────────────────

export async function seedWfOrchestrators(): Promise<{ seeded: boolean; count: number }> {
  // Idempotency gate
  if (await orchestratorsAlreadyExist()) {
    return { seeded: false, count: 0 };
  }

  // Provider gate — agents can't execute without one
  const providerId = await resolveFirstProvider();
  if (!providerId) {
    console.warn("[WfOrchestrator] No enabled provider found — skipping orchestrator seed");
    return { seeded: false, count: 0 };
  }

  const db = getDb();
  if (!db) throw new Error("Main database not available");

  const wfDb = getWfDb();
  if (!wfDb) throw new Error("WfDB not available");

  let seededCount = 0;

  for (const def of ORCHESTRATOR_AGENTS) {
    // ── Step A: Create agent record ────────────────────────────────
    const [agent] = await db
      .insert(agents)
      .values({
        workspaceId: 1,
        createdBy: 1,
        name: def.name,
        description: def.description,
        tags: ["wf-orchestrator", "maestro", def.key],
        roleClass: def.roleClass,
        lifecycle: { state: "sandbox", version: 1 },
        status: "sandbox",
        systemPrompt: def.systemPrompt,
        modelId: "gpt-4o",
        temperature: "0.5",
        capabilities: { tools: [], actions: [], memory: {} },
        limits: { rateLimit: 100, costLimit: 1.0, executionTimeout: 30000 },
        hasDocumentAccess: false,
        hasToolAccess: false,
        allowedTools: [],
      })
      .returning();

    // ── Step B: Create catalog entry (passes gates 2-5, 7-8, 10) ──
    const config = {
      sourceAgentId: agent.id,
      roleClass: def.roleClass,
      systemPrompt: def.systemPrompt,
      modelId: "gpt-4o",
      temperature: 0.5,
      hasDocumentAccess: false,
      hasToolAccess: false,
      allowedTools: [] as string[],
      callable: true as const,
    };

    const entry = await createCatalogEntry({
      name: def.catalogName,
      displayName: def.name,
      description: def.description,
      entryType: "agent",
      sourceType: "agent",
      sourceId: agent.id,
      category: "orchestration",
      subCategory: "workflow",
      capabilities: def.capabilities,
      scope: "app",
      status: "active",
      origin: "system",
      reviewState: "approved",
      approvedBy: 1,
      approvedAt: new Date(),
      providerId,
      config,
      tags: ["published", "agent", "wf-orchestrator", "maestro"],
      createdBy: 1,
    });

    // ── Step C: Create publish bundle (passes gate 6) ──────────────
    const snapshot = {
      entryId: entry.id,
      name: entry.name,
      displayName: entry.displayName,
      description: entry.description,
      entryType: "agent",
      scope: "app",
      providerId,
      config,
      tags: ["published", "agent", "wf-orchestrator", "maestro"],
      publishedAt: new Date().toISOString(),
      versionLabel: "v1.0.0",
    };

    const snapshotHash = createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex");

    await createPublishBundle({
      catalogEntryId: entry.id,
      versionLabel: "v1.0.0",
      snapshot,
      snapshotHash,
      publishedBy: 1,
      policyDecision: "approved",
    });

    // ── Step D: Auto-import into wf_catalog_imports ────────────────
    await wfDb.insert(wfCatalogImports).values({
      catalogEntryId: entry.id,
      entryType: "agent",
      name: def.name,
      description: def.description,
      category: "orchestration",
      tags: ["wf-orchestrator", "maestro"],
      config: {},
      status: "active",
    });

    seededCount++;
    console.log(`[WfOrchestrator] Seeded: ${def.name} (agent #${agent.id}, catalog #${entry.id})`);
  }

  return { seeded: true, count: seededCount };
}
