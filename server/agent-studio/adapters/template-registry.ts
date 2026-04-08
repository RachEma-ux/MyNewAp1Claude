/**
 * AI Agent Studio — Template Registry
 *
 * Real templates that pre-populate an agent draft on creation. Each template
 * defines a starter set of identity, behavior, prompts, tools, knowledge
 * and governance defaults.
 *
 * createFromTemplate() in the creation router looks up the template by key,
 * creates the agent, and then applies the template's `applyTo()` instructions
 * via the repository.
 */

import type * as repo from "../repository";

export interface AgentTemplate {
  key: string;
  name: string;
  description: string;
  category: "support" | "research" | "operations" | "compliance" | "automation";
  identity: {
    agentClass: string;
    visibility: "private" | "team" | "org" | "public";
    tags: string[];
  };
  behavior: {
    mission: string;
    role: string;
    scope: string;
    allowedTasks: string[];
    blockedTasks: string[];
    successCriteria: string;
    autonomyLevel: "manual" | "supervised" | "semi_autonomous" | "autonomous";
  };
  prompts: {
    systemInstructions: string;
    outputContract: string;
    refusalBehavior: string;
  };
  /** Tool keys to attach (uses defaults from the tool catalog adapter) */
  toolKeys: string[];
  /** Knowledge source keys to attach */
  knowledgeKeys: string[];
  governance: {
    auditRequired: boolean;
    approvalRequired: boolean;
    killSwitchEnabled: boolean;
    budgetCeiling: number;
  };
}

const TEMPLATES: AgentTemplate[] = [
  {
    key: "customer-support-v1",
    name: "Customer Support Assistant",
    description: "First-line support agent with refusal/escalation rules",
    category: "support",
    identity: {
      agentClass: "assistant",
      visibility: "team",
      tags: ["support", "customer-facing"],
    },
    behavior: {
      mission:
        "Help customers resolve product questions efficiently and escalate when blocked.",
      role: "First-line customer support representative",
      scope:
        "Answer product, billing, and account questions using approved knowledge sources only.",
      allowedTasks: [
        "Answer product questions",
        "Lookup order status",
        "Reset account password (with verification)",
      ],
      blockedTasks: [
        "Process refunds without approval",
        "Modify billing without approval",
        "Provide legal advice",
      ],
      successCriteria: "Resolution or correct escalation within 5 turns",
      autonomyLevel: "supervised",
    },
    prompts: {
      systemInstructions:
        "You are a customer support assistant. Be concise, empathetic, and only use approved sources. If unsure, escalate.",
      outputContract:
        "Respond in plain text. End with one of: [RESOLVED], [NEEDS_HUMAN], [BLOCKED].",
      refusalBehavior:
        "If asked to bypass policy or take an action outside scope, refuse with a polite message and tag [BLOCKED].",
    },
    toolKeys: ["http_request", "db_query", "send_email"],
    knowledgeKeys: ["wiki", "documents"],
    governance: {
      auditRequired: true,
      approvalRequired: false,
      killSwitchEnabled: true,
      budgetCeiling: 5000,
    },
  },
  {
    key: "research-analyst-v1",
    name: "Research Analyst",
    description: "Long-form research using multiple knowledge sources",
    category: "research",
    identity: {
      agentClass: "researcher",
      visibility: "team",
      tags: ["research", "analysis"],
    },
    behavior: {
      mission:
        "Produce well-cited research briefs from approved knowledge sources.",
      role: "Research analyst",
      scope:
        "Analyze topics drawing only from configured knowledge sources; cite every claim.",
      allowedTasks: [
        "Summarize sources",
        "Compare alternatives",
        "Cite findings",
      ],
      blockedTasks: [
        "Make purchase recommendations",
        "Use unapproved external sources",
      ],
      successCriteria: "Brief is fully cited and within scope",
      autonomyLevel: "supervised",
    },
    prompts: {
      systemInstructions:
        "You are a research analyst. Every factual claim must include a citation reference [src:source_key#id]. Refuse to speculate.",
      outputContract:
        "Output format: Markdown with sections (Summary, Key Findings, Citations).",
      refusalBehavior:
        "If a claim cannot be supported by retrieved sources, state 'Insufficient evidence' instead of speculating.",
    },
    toolKeys: ["web_search", "vector_search", "graph_query"],
    knowledgeKeys: ["wiki", "documents", "vectordb", "graph"],
    governance: {
      auditRequired: true,
      approvalRequired: false,
      killSwitchEnabled: true,
      budgetCeiling: 10000,
    },
  },
  {
    key: "data-ops-v1",
    name: "Data Operations Specialist",
    description: "Read-only data analysis with strict guardrails",
    category: "operations",
    identity: {
      agentClass: "specialist",
      visibility: "team",
      tags: ["data", "operations"],
    },
    behavior: {
      mission: "Run approved read-only data analysis safely.",
      role: "Data operations specialist",
      scope: "SELECT-only against approved tables; never mutate data.",
      allowedTasks: ["Generate reports", "Compute aggregates", "Validate datasets"],
      blockedTasks: [
        "INSERT/UPDATE/DELETE",
        "DROP/TRUNCATE/ALTER",
        "Export PII",
      ],
      successCriteria: "Report delivered with row counts and source tables listed",
      autonomyLevel: "supervised",
    },
    prompts: {
      systemInstructions:
        "You are a data operations specialist. You must only run SELECT queries against approved tables. Refuse any write operation.",
      outputContract:
        "Output: structured table preview + row count + source tables list.",
      refusalBehavior:
        "Refuse any DDL or DML write operation. State 'Write operations are blocked by policy'.",
    },
    toolKeys: ["db_query"],
    knowledgeKeys: ["documents"],
    governance: {
      auditRequired: true,
      approvalRequired: true,
      killSwitchEnabled: true,
      budgetCeiling: 3000,
    },
  },
  {
    key: "compliance-auditor-v1",
    name: "Compliance Auditor",
    description: "Read-only audit agent that produces evidence reports",
    category: "compliance",
    identity: {
      agentClass: "auditor",
      visibility: "org",
      tags: ["compliance", "audit", "read-only"],
    },
    behavior: {
      mission:
        "Produce evidence-based compliance reports without modifying any system.",
      role: "Compliance auditor",
      scope: "Read approved audit logs and policies; output structured findings.",
      allowedTasks: [
        "Read audit logs",
        "Analyze policy adherence",
        "Generate findings reports",
      ],
      blockedTasks: [
        "Modify any system state",
        "Send notifications without approval",
        "Access non-approved data",
      ],
      successCriteria: "Findings report with citations and severity grading",
      autonomyLevel: "manual",
    },
    prompts: {
      systemInstructions:
        "You are a compliance auditor. You operate in read-only mode. Every finding must reference the audit log entry that supports it.",
      outputContract:
        "Output: JSON document with shape { findings: [{ severity, rule, evidence_ref, description }] }",
      refusalBehavior:
        "Refuse any action that would mutate system state. Refuse to draw conclusions without audit log evidence.",
    },
    toolKeys: ["db_query", "file_read"],
    knowledgeKeys: ["documents", "wiki"],
    governance: {
      auditRequired: true,
      approvalRequired: true,
      killSwitchEnabled: true,
      budgetCeiling: 2000,
    },
  },
  {
    key: "automation-runner-v1",
    name: "Automation Runner",
    description: "Executes approved automation workflows with approval gates",
    category: "automation",
    identity: {
      agentClass: "automation",
      visibility: "team",
      tags: ["automation", "workflow"],
    },
    behavior: {
      mission: "Execute approved automation workflows safely with approval gates.",
      role: "Automation runner",
      scope: "Run only pre-approved workflows; pause for human approval at risky steps.",
      allowedTasks: ["Execute workflow steps", "Request approvals", "Log outcomes"],
      blockedTasks: [
        "Run unapproved workflows",
        "Skip approval steps",
        "Modify workflow definitions",
      ],
      successCriteria: "Workflow completed end-to-end with full audit trail",
      autonomyLevel: "semi_autonomous",
    },
    prompts: {
      systemInstructions:
        "You are an automation runner. Execute only approved workflow steps. Pause and request approval at any step marked 'requires_approval'.",
      outputContract:
        "Output: structured execution log { step, status, duration, approval_id? }",
      refusalBehavior:
        "Refuse to run any workflow not in the approved set. Refuse to skip approval steps under any circumstance.",
    },
    toolKeys: ["http_request", "code_exec", "send_chat"],
    knowledgeKeys: ["wiki"],
    governance: {
      auditRequired: true,
      approvalRequired: true,
      killSwitchEnabled: true,
      budgetCeiling: 8000,
    },
  },
];

export async function listTemplates(): Promise<AgentTemplate[]> {
  return TEMPLATES;
}

export async function getTemplateByKey(
  key: string
): Promise<AgentTemplate | null> {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}

/**
 * Apply a template's contents to a freshly-created agent draft.
 * Requires the repository module so the adapter doesn't directly own DB
 * concerns; the caller passes the already-imported repo.
 */
export async function applyTemplateToAgent(input: {
  template: AgentTemplate;
  agentId: number;
  draftId: number;
  repoModule: typeof repo;
}) {
  const { template, agentId, draftId, repoModule } = input;
  const { listToolCatalog } = await import("./tool-catalog-adapter");
  const catalog = await listToolCatalog();

  // 1. Apply behavior + prompts to draft
  await repoModule.updateDraft(agentId, {
    mission: template.behavior.mission,
    role: template.behavior.role,
    scope: template.behavior.scope,
    allowedTasks: template.behavior.allowedTasks,
    blockedTasks: template.behavior.blockedTasks,
    successCriteria: template.behavior.successCriteria,
    autonomyLevel: template.behavior.autonomyLevel,
    systemInstructions: template.prompts.systemInstructions,
    outputContract: template.prompts.outputContract,
    refusalBehavior: template.prompts.refusalBehavior,
    tags: template.identity.tags,
    governancePolicy: {
      auditRequired: template.governance.auditRequired,
      approvalRequired: template.governance.approvalRequired,
      killSwitchEnabled: template.governance.killSwitchEnabled,
      budgetCeiling: template.governance.budgetCeiling,
    },
  });

  // 2. Attach tool bindings using catalog defaults
  for (const toolKey of template.toolKeys) {
    const tool = catalog.find((c) => c.key === toolKey);
    if (!tool) continue;
    await repoModule.attachToolBinding({
      draftId,
      toolKey: tool.key,
      toolName: tool.name,
      allowedActions: tool.defaultAllowedActions,
      blockedActions: tool.hardBlockedActions,
      requiresApproval: tool.defaultRequiresApproval,
      auditRequired: template.governance.auditRequired,
    });
  }

  // 3. Attach knowledge bindings
  if (template.knowledgeKeys.length > 0) {
    const { listKnowledgeSources } = await import("./knowledge-adapter");
    const sources = await listKnowledgeSources();
    const bindings = template.knowledgeKeys
      .map((k) => sources.find((s) => s.key === k))
      .filter((s): s is NonNullable<typeof s> => s != null)
      .map((s, idx) => ({
        sourceKey: s.key,
        sourceName: s.name,
        priority: 80 - idx * 10,
        freshness: "standard" as const,
        groundingMode: s.defaultGroundingMode,
        retrievalDepth: 5,
        contextBudget: 4000,
      }));
    await repoModule.replaceKnowledgeBindings(draftId, bindings);
  }
}
