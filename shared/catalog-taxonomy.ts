/**
 * Catalog Taxonomy — Single source of truth for provider/model classification.
 * Imported by both server (validation) and client (form dropdowns).
 */

// ============================================================================
// Types
// ============================================================================

export interface CategoryDef {
  label: string;
  description: string;
  subCategories?: Record<string, string>; // value → label
}

export interface CapabilityDef {
  label: string;
  group: "functional" | "operational" | "governance" | "meta";
  appliesTo: ("provider" | "model")[];
}

// ============================================================================
// Provider Categories
// ============================================================================

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
// Model Categories
// ============================================================================

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
// Capabilities
// ============================================================================

export const CAPABILITIES: Record<string, CapabilityDef> = {
  // Functional
  tool_calling:      { label: "Tool Calling",      group: "functional", appliesTo: ["provider", "model"] },
  json_mode:         { label: "JSON Mode",          group: "functional", appliesTo: ["provider", "model"] },
  streaming:         { label: "Streaming",          group: "functional", appliesTo: ["provider", "model"] },
  function_calling:  { label: "Function Calling",   group: "functional", appliesTo: ["provider", "model"] },
  rag_builtin:       { label: "RAG Built-in",       group: "functional", appliesTo: ["provider", "model"] },
  vision:            { label: "Vision",             group: "functional", appliesTo: ["model"] },
  audio:             { label: "Audio",              group: "functional", appliesTo: ["model"] },

  // Operational
  low_latency:       { label: "Low Latency",        group: "operational", appliesTo: ["provider", "model"] },
  cost_optimized:    { label: "Cost Optimized",      group: "operational", appliesTo: ["provider", "model"] },
  high_context:      { label: "High Context",        group: "operational", appliesTo: ["model"] },
  multi_region:      { label: "Multi-Region",        group: "operational", appliesTo: ["provider"] },
  version_pinned:    { label: "Version Pinned",      group: "operational", appliesTo: ["provider", "model"] },

  // Governance
  sandbox:           { label: "Sandbox",             group: "governance", appliesTo: ["provider", "model"] },
  governed:          { label: "Governed",            group: "governance", appliesTo: ["provider", "model"] },
  production_ready:  { label: "Production Ready",    group: "governance", appliesTo: ["provider", "model"] },
  internet_required: { label: "Internet Required",   group: "governance", appliesTo: ["provider"] },
  mobile_safe:       { label: "Mobile Safe",         group: "governance", appliesTo: ["model"] },

  // Meta
  default:           { label: "Default",             group: "meta", appliesTo: ["provider", "model"] },
  recommended:       { label: "Recommended",         group: "meta", appliesTo: ["provider", "model"] },
  high_cost:         { label: "High Cost",           group: "meta", appliesTo: ["provider", "model"] },
};

// ============================================================================
// Helpers
// ============================================================================

/** Get the category map for a given entry type */
export function getCategoriesForType(entryType: "provider" | "model"): Record<string, CategoryDef> {
  return entryType === "provider" ? PROVIDER_CATEGORIES : MODEL_CATEGORIES;
}

/** Get subcategories for a given category key (across both provider and model) */
export function getSubCategories(category: string): Record<string, string> | undefined {
  const def = PROVIDER_CATEGORIES[category] ?? MODEL_CATEGORIES[category];
  return def?.subCategories;
}

/** Get capabilities filtered by entry type */
export function getCapabilitiesForType(entryType: "provider" | "model"): Record<string, CapabilityDef> {
  const result: Record<string, CapabilityDef> = {};
  for (const [key, cap] of Object.entries(CAPABILITIES)) {
    if (cap.appliesTo.includes(entryType)) {
      result[key] = cap;
    }
  }
  return result;
}

/** All valid category keys for a given entry type */
export function getValidCategoryKeys(entryType: "provider" | "model"): string[] {
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
