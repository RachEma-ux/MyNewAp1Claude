/**
 * Catalog Taxonomy — Single source of truth for entry type classification.
 * Imported by both server (validation) and client (form dropdowns).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │                    ARCHITECTURAL STACK                                  │
 * │                                                                         │
 * │    Provider  →  LLM  →  Model  →  Agent or Bot  →  Workflow             │
 * │                                                                         │
 * │  Layer        │ Abstraction       │ Core Question                       │
 * │  ────────────-┼───────────────────┼──────────────────────────────────── │
 * │  Provider     │ Infrastructure    │ Where does it run?                  │
 * │  LLM          │ Technology Class  │ What kind of AI is this?            │
 * │  Model        │ Trained Instance  │ Which exact version?                │
 * │  Agent        │ Intelligent System│ Who is acting?                      │
 * │  Bot          │ App-Layer Automat.│ What automation responds?           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// ============================================================================
// Types
// ============================================================================

/** The five entry types in the catalog */
export type EntryType = "provider" | "llm" | "model" | "agent" | "bot";

export const ENTRY_TYPES: readonly EntryType[] = ["provider", "llm", "model", "agent", "bot"] as const;

export interface EntryTypeDef {
  label: string;
  abstractionLevel: string;
  coreQuestion: string;
  description: string;
  ownsModels: boolean;
  hasMemory: boolean;
  hasTools: boolean;
  hasGoals: boolean;
  stateful: boolean;
}

export interface CategoryDef {
  label: string;
  description: string;
  subCategories?: Record<string, string>; // value → label
}

export interface CapabilityDef {
  label: string;
  group: "functional" | "operational" | "governance" | "meta";
  appliesTo: EntryType[];
}

// ============================================================================
// Entry Type Definitions
// ============================================================================

/**
 * 1️⃣ PROVIDER
 *
 * A Provider is an infrastructure service that exposes AI capabilities
 * through an API.
 *
 * It answers: "Where and how do we access intelligence?"
 *
 * A provider:
 *  - Hosts models (cloud or local)
 *  - Exposes endpoints (chat, embeddings, tools, etc.)
 *  - Manages authentication
 *  - Applies quotas, billing, and rate limits
 *  - Defines capability boundaries
 *
 * Examples: OpenAI, Anthropic, Mistral AI, Ollama
 *
 * In architecture: Provider = infrastructure access layer
 * Dashboard: configured in /providers
 */

/**
 * 2️⃣ LLM (Large Language Model)
 *
 * An LLM is a category of AI system designed to understand and generate
 * human language.
 *
 * It answers: "What type of intelligence is this?"
 *
 * An LLM:
 *  - Processes natural language
 *  - Generates text
 *  - Performs reasoning in language form
 *  - Follows instructions
 *  - May support multi-modal inputs
 *
 * Examples: GPT-4, Claude, Llama 3
 *
 * Conceptually: LLM = technology class (like "database" or "browser")
 */

/**
 * 3️⃣ MODEL
 *
 * A Model is a specific trained instance of an AI architecture.
 *
 * It answers: "Which exact trained system are we using?"
 *
 * A model:
 *  - Has a defined size (e.g., 8B, 70B)
 *  - Has performance characteristics
 *  - Has cost and latency profiles
 *  - May be fine-tuned or specialized
 *  - Is versioned
 *
 * Examples: GPT-4o, Claude 3 Opus, Llama 3 8B
 *
 * In dashboard: Provider → exposes multiple models, Workspace → selects one
 * Model = concrete trained brain instance
 */

/**
 * 4️⃣ AGENT
 *
 * An Agent is a stateful, goal-oriented system built around one or more models.
 *
 * It answers: "What autonomous entity is executing decisions?"
 *
 * An agent:
 *  - Uses a model as its reasoning engine
 *  - Has memory (short / long term)
 *  - Has tools (APIs, databases, workflows)
 *  - Maintains internal state
 *  - Operates under policies
 *  - Executes multi-step workflows
 *  - Can coordinate with other agents
 *
 * Agent includes:
 *  - Cognitive loop (Sense → Think → Act → Learn)
 *  - Memory cells
 *  - Decision engine
 *  - Policy binding
 *  - Runtime configuration
 *  - Observability
 *
 * Agent = orchestrated intelligent entity
 */

/**
 * 5️⃣ BOT
 *
 * A Bot is a reactive, task-focused automation system typically powered
 * by a model.
 *
 * It answers: "What automated responder handles a specific interaction?"
 *
 * A bot:
 *  - Performs a narrow task
 *  - Is usually prompt-driven
 *  - Has minimal state
 *  - Executes simple input → output loops
 *  - May wrap a model directly
 *  - Is often channel-specific (Discord, Telegram, web chat)
 *
 * It is typically:
 *  - Stateless or lightly stateful
 *  - Limited in autonomy
 *  - Single-purpose
 *
 * Bot = lightweight automated responder
 */

export const ENTRY_TYPE_DEFS: Record<EntryType, EntryTypeDef> = {
  provider: {
    label: "Provider",
    abstractionLevel: "Infrastructure",
    coreQuestion: "Where does it run?",
    description: "Infrastructure service exposing AI capabilities through an API",
    ownsModels: true,
    hasMemory: false,
    hasTools: false,
    hasGoals: false,
    stateful: false,
  },
  llm: {
    label: "LLM",
    abstractionLevel: "Technology Class",
    coreQuestion: "What kind of AI is this?",
    description: "Category of AI system designed to understand and generate human language",
    ownsModels: false,
    hasMemory: false,
    hasTools: false,
    hasGoals: false,
    stateful: false,
  },
  model: {
    label: "Model",
    abstractionLevel: "Trained Instance",
    coreQuestion: "Which exact version?",
    description: "Specific trained instance of an AI architecture",
    ownsModels: false,
    hasMemory: false,
    hasTools: false,
    hasGoals: false,
    stateful: false,
  },
  agent: {
    label: "Agent",
    abstractionLevel: "Intelligent System",
    coreQuestion: "Who is acting?",
    description: "Stateful, goal-oriented system built around one or more models",
    ownsModels: false,
    hasMemory: true,
    hasTools: true,
    hasGoals: true,
    stateful: true,
  },
  bot: {
    label: "Bot",
    abstractionLevel: "Application Layer",
    coreQuestion: "What automation responds?",
    description: "Reactive, task-focused automation system typically powered by a model",
    ownsModels: false,
    hasMemory: false,
    hasTools: false,
    hasGoals: false,
    stateful: false,
  },
};

// ============================================================================
// Provider Categories
// ============================================================================

/**
 * Provider categories — classifies the infrastructure access layer.
 * Provider = where and how do we access intelligence?
 */
export const PROVIDER_CATEGORIES: Record<string, CategoryDef> = {
  cloud_api: {
    label: "Cloud API",
    description: "Hosted SaaS providers (OpenAI, Anthropic, Azure, Bedrock)",
    subCategories: {
      official_saas: "Official SaaS",
      enterprise_managed: "Enterprise Managed",
    },
  },
  local_runtime: {
    label: "Local Runtime",
    description: "Self-hosted inference (Ollama, vLLM, llama.cpp)",
    subCategories: {
      single_node: "Single Node",
      self_hosted_cluster: "Self-Hosted Cluster",
    },
  },
  custom_adapter: {
    label: "Custom Adapter",
    description: "Custom gateways and smart routers",
    subCategories: {
      http_adapter: "HTTP Adapter",
      multi_provider_router: "Multi-Provider Router",
    },
  },
  edge_runtime: {
    label: "Edge Runtime",
    description: "Cloudflare Workers AI, Fastly edge inference",
  },
  air_gapped: {
    label: "Air-Gapped",
    description: "Offline / regulated environments",
  },
  mock: {
    label: "Mock",
    description: "Simulation, testing, and CI stubs",
  },
  archived: {
    label: "Archived",
    description: "Deprecated provider, historical reference only",
  },
};

// ============================================================================
// LLM Categories
// ============================================================================

/**
 * LLM categories — classifies the technology class.
 * LLM = what type of intelligence is this?
 */
export const LLM_CATEGORIES: Record<string, CategoryDef> = {
  general_purpose: {
    label: "General Purpose",
    description: "Broad-capability language models for diverse tasks",
    subCategories: {
      instruction_following: "Instruction Following",
      conversational: "Conversational",
      reasoning: "Reasoning",
    },
  },
  code: {
    label: "Code",
    description: "Language models specialized for code generation and understanding",
    subCategories: {
      code_generation: "Code Generation",
      code_review: "Code Review",
      code_completion: "Code Completion",
    },
  },
  multimodal: {
    label: "Multimodal",
    description: "Models handling text + vision, audio, or other modalities",
    subCategories: {
      vision_language: "Vision-Language",
      audio_language: "Audio-Language",
      omni: "Omni-Modal",
    },
  },
  domain_specific: {
    label: "Domain Specific",
    description: "LLMs trained for a specific vertical (medical, legal, finance)",
    subCategories: {
      medical: "Medical",
      legal: "Legal",
      financial: "Financial",
      scientific: "Scientific",
    },
  },
  small_language: {
    label: "Small Language Model",
    description: "Lightweight LLMs for edge / mobile / embedded use",
    subCategories: {
      edge: "Edge",
      mobile: "Mobile",
      embedded: "Embedded",
    },
  },
};

// ============================================================================
// Model Categories
// ============================================================================

/**
 * Model categories — classifies the concrete trained instance.
 * Model = which exact trained system are we using?
 */
export const MODEL_CATEGORIES: Record<string, CategoryDef> = {
  base_llm: {
    label: "Base LLM",
    description: "Foundation language models",
    subCategories: {
      text_only: "Text Only",
      multimodal: "Multimodal",
      code_optimized: "Code Optimized",
      reasoning: "Reasoning",
    },
  },
  embedding: {
    label: "Embedding",
    description: "Embedding / vector models",
    subCategories: {
      text_embedding: "Text Embedding",
      multimodal_embedding: "Multimodal Embedding",
      retrieval_optimized: "Retrieval Optimized",
    },
  },
  speech: {
    label: "Speech",
    description: "Speech-to-text and text-to-speech models",
    subCategories: {
      stt: "Speech-to-Text",
      tts: "Text-to-Speech",
    },
  },
  fine_tuned: {
    label: "Fine-Tuned",
    description: "Custom-trained model variants",
    subCategories: {
      supervised: "Supervised",
      domain_adapted: "Domain Adapted",
      instruction_tuned: "Instruction Tuned",
    },
  },
  adapter: {
    label: "Adapter",
    description: "LoRA / adapter-enhanced models",
    subCategories: {
      lora: "LoRA",
      domain_plugin: "Domain Plugin",
    },
  },
  quantized: {
    label: "Quantized",
    description: "Quantized model variants for efficiency",
    subCategories: {
      "4bit": "4-bit",
      "8bit": "8-bit",
      gguf: "GGUF",
    },
  },
  distilled: {
    label: "Distilled",
    description: "Smaller / edge-friendly distilled models",
  },
  experimental: {
    label: "Experimental",
    description: "Unstable, alpha, or research models",
    subCategories: {
      alpha: "Alpha",
      canary: "Canary",
      research: "Research",
    },
  },
  composite: {
    label: "Composite",
    description: "Router models, shadow deployments, frozen snapshots",
    subCategories: {
      router_model: "Router Model",
      shadow: "Shadow",
      frozen_snapshot: "Frozen Snapshot",
    },
  },
};

// ============================================================================
// Agent Categories
// ============================================================================

/**
 * Agent categories — classifies the orchestrated intelligent entity.
 * Agent = what autonomous entity is executing decisions?
 *
 * Agent includes: cognitive loop (Sense → Think → Act → Learn),
 * memory cells, decision engine, policy binding, runtime config, observability.
 */
export const AGENT_CATEGORIES: Record<string, CategoryDef> = {
  conversational: {
    label: "Conversational",
    description: "Dialogue-driven agents with memory and context",
    subCategories: {
      assistant: "Assistant",
      advisor: "Advisor",
      tutor: "Tutor",
    },
  },
  task_executor: {
    label: "Task Executor",
    description: "Goal-oriented agents that execute multi-step plans",
    subCategories: {
      planner: "Planner",
      coder: "Coder",
      researcher: "Researcher",
      data_analyst: "Data Analyst",
    },
  },
  orchestrator: {
    label: "Orchestrator",
    description: "Meta-agents that coordinate other agents",
    subCategories: {
      supervisor: "Supervisor",
      router: "Router",
      swarm_leader: "Swarm Leader",
    },
  },
  autonomous: {
    label: "Autonomous",
    description: "Long-running agents with persistent goals and self-direction",
    subCategories: {
      background_worker: "Background Worker",
      monitor: "Monitor",
      self_improving: "Self-Improving",
    },
  },
  specialist: {
    label: "Specialist",
    description: "Domain-expert agents with deep tool integration",
    subCategories: {
      devops: "DevOps",
      security: "Security",
      compliance: "Compliance",
      creative: "Creative",
    },
  },
};

// ============================================================================
// Bot Categories
// ============================================================================

/**
 * Bot categories — classifies the lightweight automated responder.
 * Bot = what automated responder handles a specific interaction?
 *
 * Typically: stateless or lightly stateful, limited in autonomy, single-purpose.
 */
export const BOT_CATEGORIES: Record<string, CategoryDef> = {
  chat_bot: {
    label: "Chat Bot",
    description: "Channel-specific conversational responder (Discord, Telegram, web)",
    subCategories: {
      discord: "Discord",
      telegram: "Telegram",
      slack: "Slack",
      web_chat: "Web Chat",
    },
  },
  command_bot: {
    label: "Command Bot",
    description: "Slash-command or trigger-driven automation",
    subCategories: {
      cli: "CLI",
      webhook: "Webhook",
      slash_command: "Slash Command",
    },
  },
  notification_bot: {
    label: "Notification Bot",
    description: "Alert and notification delivery automation",
    subCategories: {
      alerter: "Alerter",
      digest: "Digest",
      escalation: "Escalation",
    },
  },
  integration_bot: {
    label: "Integration Bot",
    description: "Bridges between services (GitHub, Jira, CI/CD)",
    subCategories: {
      github: "GitHub",
      jira: "Jira",
      ci_cd: "CI/CD",
    },
  },
  qa_bot: {
    label: "Q&A Bot",
    description: "Simple question-answering over a knowledge base",
    subCategories: {
      faq: "FAQ",
      docs: "Documentation",
      support: "Support",
    },
  },
};

// ============================================================================
// Capabilities
// ============================================================================

export const CAPABILITIES: Record<string, CapabilityDef> = {
  // Functional
  tool_calling:      { label: "Tool Calling",       group: "functional", appliesTo: ["provider", "model", "agent", "bot"] },
  json_mode:         { label: "JSON Mode",           group: "functional", appliesTo: ["provider", "model", "llm"] },
  streaming:         { label: "Streaming",           group: "functional", appliesTo: ["provider", "model", "llm"] },
  function_calling:  { label: "Function Calling",    group: "functional", appliesTo: ["provider", "model", "agent"] },
  rag_builtin:       { label: "RAG Built-in",        group: "functional", appliesTo: ["provider", "model", "agent"] },
  vision:            { label: "Vision",              group: "functional", appliesTo: ["model", "llm"] },
  audio:             { label: "Audio",               group: "functional", appliesTo: ["model", "llm"] },
  memory:            { label: "Memory",              group: "functional", appliesTo: ["agent"] },
  multi_step:        { label: "Multi-Step Planning", group: "functional", appliesTo: ["agent"] },
  coordination:      { label: "Coordination",        group: "functional", appliesTo: ["agent"] },
  channel_binding:   { label: "Channel Binding",     group: "functional", appliesTo: ["bot"] },

  // Operational
  low_latency:       { label: "Low Latency",         group: "operational", appliesTo: ["provider", "model", "bot"] },
  cost_optimized:    { label: "Cost Optimized",       group: "operational", appliesTo: ["provider", "model"] },
  high_context:      { label: "High Context",         group: "operational", appliesTo: ["model", "llm"] },
  multi_region:      { label: "Multi-Region",         group: "operational", appliesTo: ["provider"] },
  version_pinned:    { label: "Version Pinned",       group: "operational", appliesTo: ["provider", "model"] },
  long_running:      { label: "Long Running",         group: "operational", appliesTo: ["agent"] },
  lightweight:       { label: "Lightweight",          group: "operational", appliesTo: ["bot"] },

  // Governance
  sandbox:           { label: "Sandbox",              group: "governance", appliesTo: ["provider", "model", "agent", "bot"] },
  governed:          { label: "Governed",             group: "governance", appliesTo: ["provider", "model", "agent"] },
  production_ready:  { label: "Production Ready",     group: "governance", appliesTo: ["provider", "model", "agent", "bot"] },
  internet_required: { label: "Internet Required",    group: "governance", appliesTo: ["provider"] },
  mobile_safe:       { label: "Mobile Safe",          group: "governance", appliesTo: ["model", "bot"] },
  policy_bound:      { label: "Policy Bound",         group: "governance", appliesTo: ["agent"] },

  // Meta
  default:           { label: "Default",              group: "meta", appliesTo: ["provider", "model", "agent", "bot"] },
  recommended:       { label: "Recommended",          group: "meta", appliesTo: ["provider", "model", "llm", "agent", "bot"] },
  high_cost:         { label: "High Cost",            group: "meta", appliesTo: ["provider", "model"] },
};

// ============================================================================
// Category Map (all 5 types)
// ============================================================================

const CATEGORY_MAP: Record<EntryType, Record<string, CategoryDef>> = {
  provider: PROVIDER_CATEGORIES,
  llm: LLM_CATEGORIES,
  model: MODEL_CATEGORIES,
  agent: AGENT_CATEGORIES,
  bot: BOT_CATEGORIES,
};

// ============================================================================
// Helpers
// ============================================================================

/** Get the category map for a given entry type */
export function getCategoriesForType(entryType: EntryType): Record<string, CategoryDef> {
  return CATEGORY_MAP[entryType] ?? {};
}

/** Get subcategories for a given category key (searches all type maps) */
export function getSubCategories(category: string): Record<string, string> | undefined {
  for (const map of Object.values(CATEGORY_MAP)) {
    if (map[category]?.subCategories) return map[category].subCategories;
  }
  return undefined;
}

/** Get capabilities filtered by entry type */
export function getCapabilitiesForType(entryType: EntryType): Record<string, CapabilityDef> {
  const result: Record<string, CapabilityDef> = {};
  for (const [key, cap] of Object.entries(CAPABILITIES)) {
    if (cap.appliesTo.includes(entryType)) {
      result[key] = cap;
    }
  }
  return result;
}

/** All valid category keys for a given entry type */
export function getValidCategoryKeys(entryType: EntryType): string[] {
  return Object.keys(getCategoriesForType(entryType));
}

/** All valid subcategory keys for a given category */
export function getValidSubCategoryKeys(category: string): string[] {
  const subs = getSubCategories(category);
  return subs ? Object.keys(subs) : [];
}

/** All valid capability keys */
export function getAllCapabilityKeys(): string[] {
  return Object.keys(CAPABILITIES);
}
