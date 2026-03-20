import "dotenv/config";
import { AgentCreateInputSchema, type AgentCreateInput } from "../shared/schemas/agent-create";
import { createAgentDefinition, getAgentDefinitionByName } from "../server/agents/create-definition";
import { getDb } from "../server/db";

const DEFAULT_CREATED_BY = 1;

const agentFixtures: AgentCreateInput[] = [
  {
    identity: {
      name: "Research Analyst Alpha",
      version: "1.0.0",
      description: "Focused on research synthesis and structured analysis.",
      tags: ["research", "analysis", "fixture"],
    },
    definition: {
      creationMode: "scratch",
      roleClass: "analysis",
      systemPrompt: "You are a research analyst. Synthesize source material into structured findings, compare evidence, and present concise analysis with explicit uncertainty.",
      anatomy: { specialty: "research_synthesis" },
    },
    runtime: {
      modelId: "gpt-4o-mini",
      temperature: 0.3,
    },
    capabilities: {
      hasDocumentAccess: true,
      hasToolAccess: false,
      allowedTools: [],
      custom: { outputStyle: "structured_report" },
    },
    limits: {
      maxTokens: 4000,
      dailyBudget: 50,
      sandboxConstraints: {},
      expiresAt: null,
    },
  },
  {
    identity: {
      name: "Compliance Review Sentinel",
      version: "1.1.0",
      description: "Policy and compliance review agent.",
      tags: ["compliance", "review", "fixture"],
    },
    definition: {
      creationMode: "template",
      roleClass: "compliance",
      systemPrompt: "You are a compliance reviewer. Assess outputs against policy, identify violations conservatively, and return remediation guidance with clear rationale.",
      anatomy: { specialty: "policy_review" },
    },
    runtime: {
      modelId: "gpt-4.1",
      temperature: 0.2,
    },
    capabilities: {
      hasDocumentAccess: true,
      hasToolAccess: true,
      allowedTools: ["text_analysis", "json_parser"],
      custom: { reviewMode: "minimal_safe_tools" },
    },
    limits: {
      maxTokens: 2500,
      dailyBudget: 30,
      sandboxConstraints: { allowExternalCalls: false },
      expiresAt: null,
    },
  },
  {
    identity: {
      name: "Ideation Spark Studio",
      version: "0.9.0",
      description: "Brainstorming and creative idea generation.",
      tags: ["ideation", "creative", "fixture"],
    },
    definition: {
      creationMode: "conversation",
      roleClass: "ideation",
      systemPrompt: "You are an ideation assistant. Generate diverse concepts, explore alternatives broadly, and expand promising directions without converging too early.",
      anatomy: { specialty: "creative_brainstorming" },
    },
    runtime: {
      modelId: "claude-sonnet-4-5",
      temperature: 1.1,
    },
    capabilities: {
      hasDocumentAccess: false,
      hasToolAccess: false,
      allowedTools: [],
      custom: { creativityBias: "high" },
    },
    limits: {
      maxTokens: 3000,
      dailyBudget: 20,
      sandboxConstraints: {},
      expiresAt: null,
    },
  },
  {
    identity: {
      name: "Workflow Operator Delta",
      version: "2.0.0",
      description: "Workflow-oriented operational agent.",
      tags: ["workflow", "operations", "fixture"],
    },
    definition: {
      creationMode: "workflow",
      roleClass: "automator",
      systemPrompt: "You are an automation operator. Execute workflow steps predictably, track operational state, and surface blockers immediately with concise run summaries.",
      anatomy: { specialty: "workflow_execution" },
    },
    runtime: {
      modelId: "gemini-2.5-flash",
      temperature: 0.4,
    },
    capabilities: {
      hasDocumentAccess: false,
      hasToolAccess: true,
      allowedTools: ["json_parser", "current_time"],
      custom: { operatingMode: "workflow" },
    },
    limits: {
      maxTokens: 2000,
      dailyBudget: 75,
      sandboxConstraints: { maxConcurrentRuns: 2, allowWrites: false },
      expiresAt: null,
    },
  },
  {
    identity: {
      name: "Runtime Monitor Echo",
      version: "1.0.2",
      description: "Event-driven monitoring and alert analysis.",
      tags: ["monitoring", "events", "fixture"],
    },
    definition: {
      creationMode: "event",
      roleClass: "monitor",
      systemPrompt: "You are a runtime monitoring agent. Analyze incoming alerts, classify severity, correlate obvious signals, and recommend next actions for operators.",
      anatomy: { specialty: "runtime_monitoring" },
    },
    runtime: {
      modelId: "gpt-4.1-mini",
      temperature: 0.1,
    },
    capabilities: {
      hasDocumentAccess: false,
      hasToolAccess: true,
      allowedTools: ["current_time", "json_parser", "url_parser"],
      custom: { monitoringMode: "event_driven" },
    },
    limits: {
      maxTokens: 1500,
      dailyBudget: 40,
      sandboxConstraints: { alertWindowMinutes: 15 },
      expiresAt: null,
    },
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed agent fixtures");
  }

  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const results: Array<{
    action: "created" | "skipped";
    name: string;
    status: string;
    roleClass: string;
    modelId: string;
  }> = [];

  for (const fixture of agentFixtures) {
    const parsed = AgentCreateInputSchema.parse(fixture);
    const existing = await getAgentDefinitionByName(parsed.identity.name);

    if (existing) {
      results.push({
        action: "skipped",
        name: existing.name,
        status: String(existing.status ?? "draft"),
        roleClass: String(existing.roleClass),
        modelId: String(existing.modelId),
      });
      continue;
    }

    const created = await createAgentDefinition(parsed, DEFAULT_CREATED_BY);
    results.push({
      action: "created",
      name: created.name,
      status: String(created.status ?? "draft"),
      roleClass: String(created.roleClass),
      modelId: String(created.modelId),
    });
  }

  console.log("Seeded agent definitions:");
  for (const result of results) {
    console.log(`${result.action.toUpperCase()} | ${result.name} | ${result.status} | ${result.roleClass} | ${result.modelId}`);
  }
}

main().catch((error) => {
  console.error("[seed-agents] Failed:", error);
  process.exit(1);
});
