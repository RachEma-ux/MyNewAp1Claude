/**
 * PM Idea-to-PMI Builder Agent — Real AI Agent
 *
 * A proper AI agent registered in the AI Types Catalog, classified across
 * all 9 taxonomy axes, and powered by an LLM via the provider system.
 *
 * The agent:
 *   1. Analyzes a project idea using LLM reasoning
 *   2. Asks clarifying questions to fill knowledge gaps
 *   3. Generates all 11 PMI artifacts via structured LLM prompts
 *   4. Validates outputs and provides confidence scores
 *
 * Falls back to template generators if no LLM provider is available.
 */

import { getProviderRegistry } from "../../providers/registry";
import type { ILLMProvider } from "../../providers/base";
import type { GenerationRequest, GenerationResponse, Message } from "../../providers/types";
import { getCatalogEntries, getTaxonomyNodes, setEntryClassifications, getEntryClassifications, getCatalogEntryById } from "../../ai-types/public-api";
import { gatewayCall } from "../../platform/modules/module-gateway";
import type { IdeaBuilderInput } from "@shared/pm-artifact-schemas";

// ── Agent Identity ──────────────────────────────────────────────────────────

export const AGENT_CATALOG_ID = "pm.agent.idea_to_pmi_builder";
export const AGENT_DISPLAY_NAME = "PM Idea-to-PMI Builder Agent";
export const AGENT_VERSION = "1.0.0";

/** Full 9-axis classification for catalog_entry_classifications */
export const AGENT_TAXONOMY_CLASSIFICATION = {
  cognitive_architecture: "cog_llm_based",        // Advanced Cognitive > LLM-Based Architecture
  functional_role: "role_specialist",              // Expert Roles > Specialist
  organizational_structure: "org_single_agent",    // Single-Unit > Single-Agent
  autonomy_level: "auto_hitl",                     // Assisted > Human-in-the-Loop
  embodiment: "emb_software_agent",                // Software > Software Agent
  learning_paradigm: "learn_supervised_learning",  // Supervised > Supervised Learning
  decision_paradigm: "dec_probabilistic_inference",// Probabilistic > Probabilistic Inference
  governance_safety: ["gov_policy_constrained", "gov_auditable"], // Policy Control + Transparency
  cognitive_capability: "cap_context_aware",       // Contextual > Context-Aware
} as const;

export const AGENT_CAPABILITIES = [
  "tool_calling",
  "multi_step",
  "memory",
  "policy_bound",
  "governed",
  "production_ready",
] as const;

// ── System Prompt ───────────────────────────────────────────────────────────

export const PM_EXPERT_SYSTEM_PROMPT = `You are a Senior Project Management Expert Agent with deep expertise in PMI/PMBOK methodology (7th edition), ISO 21500, and PRINCE2.

Your role is to help users transform raw project ideas into complete, professional PMI project artifacts. You are:
- A certified PMP (Project Management Professional) with 15+ years of experience
- Expert in predictive, agile, and hybrid methodologies
- Skilled at identifying risks, stakeholders, and constraints from minimal input
- Thorough in cross-referencing artifacts for consistency

CORE BEHAVIORS:
1. ANALYZE first — understand the project idea deeply before generating anything
2. ASK clarifying questions when information is insufficient
3. REASON through implications — budget impacts on schedule, risks from constraints, etc.
4. GENERATE structured, professional artifacts that meet PMI standards
5. VALIDATE cross-artifact consistency

CONSTRAINTS (NEVER violate):
- You are ASSISTIVE ONLY — all outputs are drafts requiring human approval
- You CANNOT approve gates, transition lifecycle states, lock baselines, or freeze artifacts
- You CANNOT write canonical artifacts — only draft proposals
- All drafts must include confidence scores and areas needing human review

When generating artifacts, output ONLY valid JSON matching the requested schema. No markdown, no explanations outside the JSON structure.`;

// ── Per-Artifact Prompts ────────────────────────────────────────────────────

export const ARTIFACT_PROMPTS: Record<string, string> = {
  scope_statement: `Generate a Scope Statement for this project. Output valid JSON with these exact fields:
{
  "artifactType": "scope_statement",
  "projectName": "...",
  "projectObjective": "clear, measurable objective",
  "problemStatement": "what problem this project solves",
  "businessJustification": "why this project matters",
  "inScope": ["item1", "item2", ...],
  "outOfScope": ["item1", "item2", ...],
  "deliverables": [{"id": "D-001", "name": "...", "description": "...", "acceptanceCriteria": "...", "wbsRef": "1.1"}],
  "constraints": ["constraint1", ...],
  "assumptions": ["assumption1", ...],
  "boundaries": ["boundary1", ...],
  "successCriteria": ["criterion1", ...],
  "generatedAt": "<current ISO timestamp>",
  "generatedBy": "pm_idea_builder_agent"
}
Include at least 3 deliverables, 3 constraints, 3 assumptions, and 3 success criteria. Be specific to the project context.`,

  project_charter: `Generate a Project Charter. Output valid JSON with these exact fields:
{
  "artifactType": "project_charter",
  "projectName": "...",
  "version": "1.0",
  "sponsor": "To be assigned",
  "projectManager": "To be assigned",
  "objective": "...",
  "businessCase": "detailed business case",
  "problemStatement": "...",
  "expectedValue": ["value1", ...],
  "inScope": ["..."],
  "outOfScope": ["..."],
  "deliverables": ["..."],
  "constraints": ["..."],
  "assumptions": ["..."],
  "milestones": [{"id": "M-001", "name": "...", "targetDate": "YYYY-MM-DD", "description": "..."}],
  "initialRisks": [{"id": "R-001", "title": "...", "probability": "low|medium|high", "impact": "low|medium|high", "mitigation": "..."}],
  "authorityLevel": "...",
  "decisionModel": "...",
  "riskTier": "low|medium|high|critical",
  "dataTier": "...",
  "approvalRequirements": ["..."],
  "generatedAt": "<current ISO timestamp>",
  "generatedBy": "pm_idea_builder_agent"
}
Ensure milestones and risks are realistic and specific to the project.`,

  stakeholder_register: `Generate a Stakeholder Register. Output valid JSON:
{
  "artifactType": "stakeholder_register",
  "stakeholders": [
    {
      "id": "SH-001",
      "name": "Role-based name",
      "role": "...",
      "organization": "...",
      "influence": "low|medium|high",
      "interest": "low|medium|high",
      "engagementLevel": "unaware|resistant|neutral|supportive|leading",
      "communicationPreference": "...",
      "expectations": "...",
      "type": "internal|external"
    }
  ],
  "totalCount": N,
  "byInfluence": {"high": N, "medium": N, "low": N},
  "byInterest": {"high": N, "medium": N, "low": N},
  "generatedAt": "<current ISO timestamp>",
  "generatedBy": "pm_idea_builder_agent"
}
Include at least 5 stakeholders covering both internal and external, with varied influence/interest levels.`,

  wbs: `Generate a Work Breakdown Structure. Output valid JSON:
{
  "artifactType": "wbs",
  "projectName": "...",
  "rootNodeId": "WBS-ROOT",
  "nodes": [
    {
      "id": "WBS-ROOT",
      "code": "1",
      "name": "Project Name",
      "description": "...",
      "level": 0,
      "parentId": null,
      "children": ["WBS-1.1", ...],
      "isWorkPackage": false
    },
    {
      "id": "WBS-1.1",
      "code": "1.1",
      "name": "Phase/Deliverable",
      "description": "...",
      "level": 1,
      "parentId": "WBS-ROOT",
      "children": ["WBS-1.1.1"],
      "deliverableRef": "D-001",
      "isWorkPackage": false
    },
    {
      "id": "WBS-1.1.1",
      "code": "1.1.1",
      "name": "Work Package",
      "description": "...",
      "level": 2,
      "parentId": "WBS-1.1",
      "children": [],
      "isWorkPackage": true,
      "estimatedEffortHours": N,
      "assignmentType": "human|ai|hybrid"
    }
  ],
  "totalNodes": N,
  "maxDepth": N,
  "workPackageCount": N,
  "phases": ["Initiation", "Planning", "Execution", "Closure"],
  "generatedAt": "<current ISO timestamp>",
  "generatedBy": "pm_idea_builder_agent"
}
Create a realistic 3-level WBS with at least 4 phases and 10+ work packages.`,

  schedule_baseline: `Generate a Schedule Baseline. Output valid JSON:
{
  "artifactType": "schedule_baseline",
  "projectName": "...",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "totalDurationDays": N,
  "tasks": [
    {
      "id": "T-001",
      "wbsRef": "WBS-1.1.1",
      "name": "...",
      "description": "...",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "durationDays": N,
      "dependencies": [{"taskId": "T-000", "type": "FS", "lag": 0}],
      "milestone": false,
      "assignmentType": "human|ai|hybrid",
      "criticalPath": true|false,
      "floatDays": N
    }
  ],
  "milestones": [{"id": "M-001", "name": "...", "date": "YYYY-MM-DD"}],
  "criticalPathLength": N,
  "totalTaskCount": N,
  "generatedAt": "<current ISO timestamp>",
  "generatedBy": "pm_idea_builder_agent"
}
Create realistic task dependencies, identify the critical path, and calculate float correctly.`,

  cost_baseline: `Generate a Cost Baseline. Output valid JSON:
{
  "artifactType": "cost_baseline",
  "projectName": "...",
  "currency": "USD",
  "budgetEnvelope": N,
  "totalEstimatedCost": N,
  "contingencyPercent": 10,
  "contingencyAmount": N,
  "managementReservePercent": 5,
  "managementReserveAmount": N,
  "lineItems": [
    {
      "id": "CL-001",
      "wbsRef": "WBS-1.1.1",
      "category": "labor|materials|equipment|services|travel|contingency|overhead",
      "description": "...",
      "quantity": N,
      "unitCost": N,
      "totalCost": N,
      "currency": "USD",
      "phase": "..."
    }
  ],
  "byCategory": {"labor": N, ...},
  "byPhase": {"Phase1": N, ...},
  "budgetVariance": N,
  "budgetUtilization": N,
  "generatedAt": "<current ISO timestamp>",
  "generatedBy": "pm_idea_builder_agent"
}
Ensure costs are realistic. If a budget envelope is given, fit within it.`,

  risk_register: `Generate a Risk Register. Output valid JSON:
{
  "artifactType": "risk_register",
  "projectName": "...",
  "riskTier": "low|medium|high|critical",
  "risks": [
    {
      "id": "RISK-001",
      "title": "...",
      "description": "...",
      "category": "technical|schedule|cost|resource|scope|quality|external|organizational",
      "probability": "low|medium|high",
      "impact": "low|medium|high",
      "riskScore": N,
      "owner": "...",
      "mitigation": "...",
      "contingency": "...",
      "trigger": "...",
      "status": "identified",
      "responseStrategy": "avoid|transfer|mitigate|accept|escalate"
    }
  ],
  "totalRisks": N,
  "heatMap": {"high_high": N, "high_medium": N, "high_low": N, "medium_high": N, "medium_medium": N, "medium_low": N, "low_high": N, "low_medium": N, "low_low": N},
  "topRisks": ["RISK-001", ...],
  "mitigationCoveragePercent": N,
  "generatedAt": "<current ISO timestamp>",
  "generatedBy": "pm_idea_builder_agent"
}
Include at least 6 risks across different categories with realistic mitigations.`,

  communications_plan: `Generate a Communications Plan. Output valid JSON:
{
  "artifactType": "communications_plan",
  "projectName": "...",
  "communications": [
    {
      "id": "COM-001",
      "name": "...",
      "purpose": "...",
      "frequency": "daily|weekly|biweekly|monthly|quarterly|ad_hoc|milestone",
      "format": "meeting|email|report|dashboard|presentation|chat",
      "audience": ["..."],
      "owner": "...",
      "stakeholderRef": ["SH-001"],
      "deliverable": "...",
      "channel": "..."
    }
  ],
  "escalationPath": [
    {"level": 1, "role": "...", "responseTime": "...", "criteria": "..."}
  ],
  "reportingCadence": "...",
  "totalItems": N,
  "generatedAt": "<current ISO timestamp>",
  "generatedBy": "pm_idea_builder_agent"
}`,

  quality_plan: `Generate a Quality Plan. Output valid JSON:
{
  "artifactType": "quality_plan",
  "projectName": "...",
  "qualityObjective": "...",
  "standards": [
    {"id": "QS-001", "name": "...", "description": "...", "metric": "...", "target": "...", "measurementMethod": "...", "frequency": "...", "owner": "..."}
  ],
  "acceptanceCriteria": [
    {"id": "AC-001", "deliverableRef": "D-001", "criterion": "...", "verificationMethod": "..."}
  ],
  "definitionOfDone": ["criterion1", ...],
  "reviewProcess": {"type": "...", "frequency": "...", "participants": ["..."], "approvalRequired": true},
  "totalStandards": N,
  "totalCriteria": N,
  "generatedAt": "<current ISO timestamp>",
  "generatedBy": "pm_idea_builder_agent"
}`,

  change_control_plan: `Generate a Change Control Plan. Output valid JSON:
{
  "artifactType": "change_control_plan",
  "projectName": "...",
  "changeProcess": [
    {"step": 1, "name": "...", "description": "...", "responsible": "...", "timeframe": "..."}
  ],
  "changeCategories": [
    {"category": "...", "approvalAuthority": "...", "impactThreshold": "..."}
  ],
  "changeBoard": [
    {"role": "...", "name": "TBD", "voteWeight": N}
  ],
  "baselineTypes": ["scope", "schedule", "cost"],
  "configurationManagement": {"versioningScheme": "...", "storageLocation": "...", "auditTrail": true},
  "generatedAt": "<current ISO timestamp>",
  "generatedBy": "pm_idea_builder_agent"
}`,

  gate_readiness_report: `Generate a Gate Readiness Report. Evaluate all previously generated artifacts for completeness. Output valid JSON:
{
  "artifactType": "gate_readiness_report",
  "projectName": "...",
  "gateId": "G0",
  "phase": "initiating",
  "checks": [
    {"id": "GR-001", "category": "...", "item": "...", "status": "pass|fail|warn|na", "evidence": "...", "artifactRef": "...", "severity": "blocker|critical|major|minor", "note": "..."}
  ],
  "summary": {"total": N, "pass": N, "fail": N, "warn": N, "na": N, "readinessScore": N, "ready": true|false, "blockers": []},
  "crossArtifactConsistency": {"scopeToWbs": true, "wbsToSchedule": true, "scheduleToCost": true, "riskToWbs": true, "stakeholderToComms": true, "charterToScope": true},
  "recommendation": "proceed|conditional|not_ready",
  "generatedAt": "<current ISO timestamp>",
  "generatedBy": "pm_idea_builder_agent"
}`,
};

export const ANALYSIS_PROMPT = `Analyze this project idea and provide a structured assessment. Think deeply about:

1. What type of project is this? (IT, construction, consulting, product development, etc.)
2. What are the implied constraints, risks, and stakeholders?
3. What information is missing that you'd need to generate complete PMI artifacts?
4. What methodology is most appropriate? (predictive, agile, hybrid)

Output a JSON response:
{
  "projectType": "...",
  "estimatedComplexity": "low|medium|high|very_high",
  "methodology": "predictive|agile|hybrid",
  "keyInsights": ["insight1", "insight2", ...],
  "identifiedRisks": ["risk1", "risk2", ...],
  "identifiedStakeholders": ["stakeholder1", ...],
  "missingInformation": ["what budget range?", "what timeline?", ...],
  "clarifyingQuestions": [
    {"id": "Q1", "question": "...", "why": "needed for ...", "defaultIfSkipped": "..."},
    {"id": "Q2", "question": "...", "why": "needed for ...", "defaultIfSkipped": "..."}
  ],
  "confidence": {
    "overall": 0.0-1.0,
    "scopeClarity": 0.0-1.0,
    "stakeholderClarity": 0.0-1.0,
    "riskIdentification": 0.0-1.0,
    "budgetClarity": 0.0-1.0,
    "timelineClarity": 0.0-1.0
  },
  "readyToGenerate": true|false,
  "agentThinking": "Your chain-of-thought reasoning about this project idea..."
}

Ask 3-5 clarifying questions that would most improve artifact quality.`;

// ── LLM Interface ───────────────────────────────────────────────────────────

/** Find the first available LLM provider */
export function getAvailableProvider(): ILLMProvider | null {
  const registry = getProviderRegistry();
  const all = registry.getAllProviders();
  if (all.length === 0) return null;
  // Prefer OpenAI/Anthropic for quality, fall back to any available
  const preferred = all.find(p => p.type === "anthropic" || p.type === "openai");
  return preferred || all[0];
}

/** Call the LLM with a structured prompt and get a text response */
export async function callLLM(
  provider: ILLMProvider,
  messages: Message[],
  options?: { temperature?: number; maxTokens?: number; model?: string },
): Promise<string> {
  const request: GenerationRequest = {
    messages,
    temperature: options?.temperature ?? 0.3,
    maxTokens: options?.maxTokens ?? 8000,
    model: options?.model,
  };

  const response: GenerationResponse = await provider.generate(request);
  return response.content;
}

/** Parse LLM response as JSON, with fallback for markdown-wrapped JSON */
export function parseLLMJson<T = Record<string, unknown>>(raw: string): T {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Find the first { and last } for safety
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned) as T;
}

// ── Agent Analysis ──────────────────────────────────────────────────────────

export interface AgentAnalysis {
  projectType: string;
  estimatedComplexity: string;
  methodology: string;
  keyInsights: string[];
  identifiedRisks: string[];
  identifiedStakeholders: string[];
  missingInformation: string[];
  clarifyingQuestions: Array<{
    id: string;
    question: string;
    why: string;
    defaultIfSkipped: string;
  }>;
  confidence: Record<string, number>;
  readyToGenerate: boolean;
  agentThinking: string;
}

/** Have the agent analyze a project idea and return questions */
export async function analyzeIdea(
  ideaText: string,
  input: IdeaBuilderInput,
  provider: ILLMProvider,
): Promise<AgentAnalysis> {
  const context = [
    `Project Idea: ${ideaText}`,
    input.budgetEnvelope ? `Budget Envelope: $${input.budgetEnvelope.toLocaleString()}` : null,
    input.deadline ? `Deadline: ${input.deadline}` : null,
    input.riskTier ? `Risk Tier: ${input.riskTier}` : null,
    input.methodology ? `Preferred Methodology: ${input.methodology}` : null,
  ].filter(Boolean).join("\n");

  const messages: Message[] = [
    { role: "system", content: PM_EXPERT_SYSTEM_PROMPT },
    { role: "user", content: `${ANALYSIS_PROMPT}\n\n---\n\n${context}` },
  ];

  const raw = await callLLM(provider, messages, { temperature: 0.4, maxTokens: 4000 });
  return parseLLMJson<AgentAnalysis>(raw);
}

// ── Artifact Generation ─────────────────────────────────────────────────────

/** Generate a single artifact using LLM */
export async function generateArtifactViaLLM(
  artifactType: string,
  ideaText: string,
  input: IdeaBuilderInput,
  previousArtifacts: Record<string, unknown>,
  answers: Record<string, string>,
  provider: ILLMProvider,
): Promise<Record<string, unknown>> {
  const prompt = ARTIFACT_PROMPTS[artifactType];
  if (!prompt) throw new Error(`No prompt defined for artifact type: ${artifactType}`);

  const context = [
    `PROJECT IDEA: ${ideaText}`,
    input.budgetEnvelope ? `BUDGET: $${input.budgetEnvelope.toLocaleString()}` : null,
    input.deadline ? `DEADLINE: ${input.deadline}` : null,
    input.riskTier ? `RISK TIER: ${input.riskTier}` : null,
    input.methodology ? `METHODOLOGY: ${input.methodology}` : null,
  ].filter(Boolean).join("\n");

  const answersText = Object.entries(answers).length > 0
    ? "\n\nCLARIFICATION ANSWERS:\n" + Object.entries(answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n\n")
    : "";

  const previousContext = Object.keys(previousArtifacts).length > 0
    ? "\n\nPREVIOUSLY GENERATED ARTIFACTS (use for cross-referencing):\n" +
      Object.entries(previousArtifacts)
        .map(([type, content]) => `--- ${type} ---\n${JSON.stringify(content, null, 2).substring(0, 2000)}`)
        .join("\n\n")
    : "";

  const messages: Message[] = [
    { role: "system", content: PM_EXPERT_SYSTEM_PROMPT },
    {
      role: "user",
      content: `${prompt}\n\n---\n\n${context}${answersText}${previousContext}\n\nGenerate the ${artifactType} artifact now. Output ONLY the JSON object, no additional text.`,
    },
  ];

  const raw = await callLLM(provider, messages, { temperature: 0.2, maxTokens: 8000 });
  const artifact = parseLLMJson(raw);

  // Ensure artifactType is set
  artifact.artifactType = artifactType;
  if (!artifact.generatedAt) artifact.generatedAt = new Date().toISOString();
  if (!artifact.generatedBy) artifact.generatedBy = "pm_idea_builder_agent";

  return artifact;
}

// ── Chat Response ───────────────────────────────────────────────────────────

/** Generate a conversational response from the agent */
export async function chatWithAgent(
  messages: Message[],
  provider: ILLMProvider,
): Promise<string> {
  const fullMessages: Message[] = [
    { role: "system", content: PM_EXPERT_SYSTEM_PROMPT + `\n\nYou are now in a conversational mode, helping the user refine their project idea. Be helpful, professional, and ask smart questions. When the user is ready, they will click "Generate Artifacts" to proceed. Keep responses concise (2-4 paragraphs max).` },
    ...messages,
  ];

  return await callLLM(provider, fullMessages, { temperature: 0.5, maxTokens: 2000 });
}

// ── Catalog Registration ────────────────────────────────────────────────────

/** Resolve taxonomy classification keys to DB node IDs */
async function resolveTaxonomyNodeIds(): Promise<number[]> {
  const allNodes = await getTaxonomyNodes({ entryType: "agent" });
  const nodeIds: number[] = [];

  // Collect all classification keys (flatten arrays)
  const classificationKeys: string[] = [];
  for (const value of Object.values(AGENT_TAXONOMY_CLASSIFICATION)) {
    if (Array.isArray(value)) {
      classificationKeys.push(...value);
    } else {
      classificationKeys.push(value as string);
    }
  }

  // Match each key to a taxonomy node
  for (const key of classificationKeys) {
    const node = allNodes.find(n => n.key === key);
    if (node) {
      nodeIds.push(node.id);
    }
  }

  return nodeIds;
}

/** Ensure the PM Idea Builder Agent is registered in the AI Types Catalog */
export async function ensureAgentRegistered(): Promise<number | null> {
  try {
    // Check if already registered
    const existing = await getCatalogEntries({ entryType: "agent" });
    const found = existing.find(e => e.name === AGENT_CATALOG_ID);

    if (found) {
      // Ensure taxonomy classifications are assigned (may be missing from earlier registration)
      try {
        const existingClassifications = await getEntryClassifications(found.id);
        if (existingClassifications.length === 0) {
          const nodeIds = await resolveTaxonomyNodeIds();
          if (nodeIds.length > 0) {
            await setEntryClassifications(found.id, nodeIds);
            console.log(`[PM Agent] Assigned ${nodeIds.length} taxonomy classifications to existing agent (id=${found.id})`);
          }
        }
      } catch (classErr: any) {
        console.warn(`[PM Agent] Failed to assign taxonomy classifications:`, classErr.message);
      }
      return found.id;
    }

    // Plan v3 Phase 37: route through aiTypes.catalog.register so the
    // canonical write path runs the duplicate guard, audit chain, and
    // `aiTypes.catalog.registered` event. Self-registered system agents
    // use the sourceName path (string identity) — see ADR
    // docs/architecture/ai-types/PMT_NAME_BASED_IDENTITY.md.
    const result = await gatewayCall<unknown, { entryId: number; action: "created" | "updated" }>({
      ctx: {
        sourceModule: "pmt",
        targetModule: "aiTypes",
        actionKey: "aiTypes.catalog.register",
        governanceReceiptId: `pmt-idea-builder-bootstrap-${AGENT_CATALOG_ID}-${Date.now()}`,
        actorId: 0,
      },
      input: {
        entryType: "agent",
        sourceType: "self_registered_agent",
        sourceName: AGENT_CATALOG_ID,
        fields: {
          name: AGENT_CATALOG_ID,
          displayName: AGENT_DISPLAY_NAME,
          description: "An AI-powered Project Management expert that transforms raw project ideas into complete PMI artifacts. Uses LLM reasoning to analyze projects, ask clarifying questions, and generate 11 standard PMI documents including Charter, Scope, WBS, Schedule, Cost Baseline, Risk Register, and more.",
          category: "specialist",
          subCategory: "compliance",
          capabilities: [...AGENT_CAPABILITIES],
          scope: "app",
          status: "active",
          origin: "system",
          reviewState: "approved",
          config: {
            version: AGENT_VERSION,
            agentType: "idea_to_pmi_builder",
            systemPrompt: PM_EXPERT_SYSTEM_PROMPT,
            artifactTypes: [
              "scope_statement", "project_charter", "stakeholder_register",
              "wbs", "schedule_baseline", "cost_baseline", "risk_register",
              "communications_plan", "quality_plan", "change_control_plan",
              "gate_readiness_report",
            ],
            taxonomyClassification: AGENT_TAXONOMY_CLASSIFICATION,
            enforcementOverlay: {
              deny: [
                "gate_submit", "gate_approve", "gate_reject", "gate_waive",
                "state_transition", "baseline_lock", "baseline_unlock",
                "freeze", "unfreeze", "artifact_write_canonical",
              ],
              requireHumanReview: true,
            },
            cognitiveLoop: {
              sense: "Receives project idea text + constraints",
              think: "LLM-powered analysis: identifies type, risks, stakeholders, missing info",
              act: "Generates 11 PMI artifacts via structured prompts",
              learn: "Incorporates user feedback via clarifying Q&A",
            },
            memoryType: "session",
            toolAccess: ["artifact_generation", "cross_artifact_validation"],
            phasesAllowed: ["draft_shell", "initiating", "planning"],
          },
          tags: ["pm", "pmi", "pmbok", "project-management", "artifact-generation", "llm-powered"],
          createdBy: 1,
        },
        registeredBy: 0,
        sourceModule: "pmt",
        actorType: "system",
        initiatedByUserId: null,
      },
    });

    const entry = await getCatalogEntryById(result.entryId);
    if (!entry) {
      throw new Error(`[PM Agent] register returned entryId=${result.entryId} but getCatalogEntryById was null`);
    }

    // Assign taxonomy classifications (real-taxonomy classifications,
    // intra-platform write — public-api permits this).
    try {
      const nodeIds = await resolveTaxonomyNodeIds();
      if (nodeIds.length > 0) {
        await setEntryClassifications(entry.id, nodeIds);
        console.log(`[PM Agent] Assigned ${nodeIds.length} taxonomy classifications`);
      }
    } catch (classErr: any) {
      console.warn(`[PM Agent] Failed to assign taxonomy classifications:`, classErr.message);
    }

    // Phase 37: dropped redundant `agent_registered` audit event call —
    // canonical's `aiTypes.catalog.registered` event replaces it (zero
    // downstream consumers per §34 audit).

    console.log(`[PM Agent] Registered AI agent in catalog: ${AGENT_DISPLAY_NAME} (id=${entry.id}, action=${result.action})`);
    return entry.id;
  } catch (err: any) {
    console.error(`[PM Agent] Failed to register agent in catalog:`, err.message);
    return null;
  }
}
