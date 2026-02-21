/**
 * Feature Registry
 *
 * Canonical declaration of all platform features.
 * Every user-facing feature must be registered here.
 */

export type FeatureStatus = "experimental" | "active" | "deprecated" | "disabled";

export interface FeatureDeclaration {
  feature_id: string;
  name: string;
  description: string;
  owner: string;
  status: FeatureStatus;
  gated: boolean;
  environments_allowed: ("development" | "production")[];
  audit_required: boolean;
}

/**
 * Canonical feature registry.
 * Add new features here before exposing them.
 */
export const featureRegistry: FeatureDeclaration[] = [
  // ── Core Platform ────────────────────────────────────────
  {
    feature_id: "workspaces",
    name: "Workspace Management",
    description: "Create, update, delete workspaces with member management",
    owner: "platform",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },
  {
    feature_id: "auth_oauth",
    name: "OAuth Authentication",
    description: "OAuth-based user authentication via external provider",
    owner: "platform",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: true,
  },
  {
    feature_id: "auth_devmode",
    name: "DEV_MODE Authentication Bypass",
    description: "Auto-authenticate as dev user for development/CI",
    owner: "platform",
    status: "active",
    gated: true,
    environments_allowed: ["development"],
    audit_required: false,
  },

  // ── Provider Management ──────────────────────────────────
  {
    feature_id: "providers",
    name: "LLM Provider Management",
    description: "Register, validate, and manage LLM providers (OpenAI, Anthropic, Ollama, etc.)",
    owner: "llm",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: true,
  },
  {
    feature_id: "provider_discovery",
    name: "Provider Discovery",
    description: "Auto-discover LLM providers via URL probing with SSRF protection",
    owner: "llm",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: true,
  },
  {
    feature_id: "catalog",
    name: "Model Catalog",
    description: "Browse, import, and manage model catalog entries",
    owner: "llm",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },

  // ── Agent System ─────────────────────────────────────────
  {
    feature_id: "agents",
    name: "Agent Orchestration",
    description: "Create, configure, and manage AI agents with tool access",
    owner: "agents",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: true,
  },
  {
    feature_id: "agent_promotions",
    name: "Agent Promotion Workflow",
    description: "Promote agents from draft/sandbox to governed with policy evaluation",
    owner: "agents",
    status: "active",
    gated: true,
    environments_allowed: ["development", "production"],
    audit_required: true,
  },
  {
    feature_id: "drift_detection",
    name: "Agent Drift Detection",
    description: "Detect policy and spec drift across governed agents",
    owner: "agents",
    status: "active",
    gated: true,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },
  {
    feature_id: "agent_chat",
    name: "Agent Chat",
    description: "Chat with configured agents via streaming",
    owner: "agents",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },

  // ── Documents & RAG ──────────────────────────────────────
  {
    feature_id: "documents",
    name: "Document Ingestion",
    description: "Upload, chunk, embed, and search documents",
    owner: "documents",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },
  {
    feature_id: "vectordb",
    name: "Vector Database",
    description: "Qdrant vector storage and similarity search",
    owner: "documents",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },

  // ── Automation ───────────────────────────────────────────
  {
    feature_id: "automation",
    name: "Workflow Automation",
    description: "Visual workflow builder with triggers and actions",
    owner: "automation",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },
  {
    feature_id: "automation_templates",
    name: "Workflow Templates",
    description: "Pre-built workflow templates for common patterns",
    owner: "automation",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },

  // ── Governance ───────────────────────────────────────────
  {
    feature_id: "policies",
    name: "Policy Management",
    description: "Define and enforce workspace policies for agent governance",
    owner: "governance",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: true,
  },
  {
    feature_id: "secrets",
    name: "Secret Management",
    description: "Encrypted storage for API keys and credentials",
    owner: "governance",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: true,
  },
  {
    feature_id: "key_rotation",
    name: "Key Rotation",
    description: "Automated rotation of provider API keys",
    owner: "governance",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: true,
  },
  {
    feature_id: "compliance_export",
    name: "Compliance Export",
    description: "Export compliance reports in JSON/CSV format",
    owner: "governance",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },

  // ── Content ──────────────────────────────────────────────
  {
    feature_id: "wiki",
    name: "Knowledge Base Wiki",
    description: "Internal knowledge base for documentation",
    owner: "content",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },

  // ── Infrastructure ───────────────────────────────────────
  {
    feature_id: "model_downloads",
    name: "Model Downloads",
    description: "Download and manage local model files",
    owner: "infrastructure",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },
  {
    feature_id: "hardware_profile",
    name: "Hardware Profiling",
    description: "Detect and report system hardware capabilities",
    owner: "infrastructure",
    status: "active",
    gated: false,
    environments_allowed: ["development", "production"],
    audit_required: false,
  },
];

/**
 * Get feature by ID
 */
export function getFeature(featureId: string): FeatureDeclaration | undefined {
  return featureRegistry.find((f) => f.feature_id === featureId);
}

/**
 * Check if a feature is allowed in the current environment
 */
export function isFeatureAllowed(featureId: string): boolean {
  const feature = getFeature(featureId);
  if (!feature) return false;
  if (feature.status === "disabled" || feature.status === "deprecated") return false;

  const env = process.env.NODE_ENV === "production" ? "production" : "development";
  return feature.environments_allowed.includes(env);
}

/**
 * Get all features by status
 */
export function getFeaturesByStatus(status: FeatureStatus): FeatureDeclaration[] {
  return featureRegistry.filter((f) => f.status === status);
}

/**
 * Get all features requiring audit
 */
export function getAuditRequiredFeatures(): FeatureDeclaration[] {
  return featureRegistry.filter((f) => f.audit_required);
}
