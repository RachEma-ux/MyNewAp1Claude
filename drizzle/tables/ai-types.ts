import { integer, serial, varchar, pgTable, text, timestamp, json, index } from "drizzle-orm/pg-core";
import { providers } from "./providers";

// ============================================================================
// AI Types Domain Tables — Source of truth for type-specific data
//
// BOUNDARY: These tables are INTERNAL to the AI Types domain.
// Other modules (PM, knowledge, collaboration, reporting, HR) must NOT
// import from this file or query these tables directly.
// They consume through catalog_entries and runtime APIs only.
//
// Architecture:
//   ai_type_models / ai_type_llms  →  domain truth (type-specific fields)
//   catalog_entries (sourceType + sourceId)  →  cross-module projection
//   providers, agents, bots  →  existing domain tables (unchanged)
// ============================================================================

/**
 * ai_type_models — Domain truth for model catalog entries.
 *
 * Stores type-specific fields that don't belong in the generic catalog_entries
 * config blob: provider binding, model family, context length, capabilities,
 * API model ID, etc.
 *
 * The existing `models` table is for local download management (HuggingFace, GGUF).
 * This table covers ALL model catalog entries (cloud API models, local models, etc).
 */
export const aiTypeModels = pgTable("ai_type_models", {
  id: serial("id").primaryKey(),

  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
  description: text("description"),

  // Provider binding
  providerId: integer("providerId").references(() => providers.id),
  providerSlug: varchar("providerSlug", { length: 100 }),

  // Model metadata
  modelFamily: varchar("modelFamily", { length: 100 }),
  contextLength: integer("contextLength"),
  capabilities: json("capabilities").$type<string[]>(),

  // API-level identity (the actual model ID sent to the provider API)
  apiModelId: varchar("apiModelId", { length: 255 }),
  baseUrl: text("baseUrl"),

  // Type-specific extras
  config: json("config").$type<Record<string, unknown>>(),

  // Canonical key for portability matrix (e.g. "openai/gpt-4o")
  canonicalKey: varchar("canonicalKey", { length: 255 }),

  // Lifecycle
  status: varchar("status", { length: 50 }).default("active"),

  // Metadata
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  nameIdx: index("idx_ai_type_model_name").on(table.name),
  providerIdx: index("idx_ai_type_model_provider").on(table.providerId),
  statusIdx: index("idx_ai_type_model_status").on(table.status),
  canonicalKeyIdx: index("idx_ai_type_model_canonical").on(table.canonicalKey),
}));

export type AiTypeModel = typeof aiTypeModels.$inferSelect;
export type InsertAiTypeModel = typeof aiTypeModels.$inferInsert;

/**
 * ai_type_llms — Domain truth for LLM catalog entries.
 *
 * An LLM is a configured model binding: a model + role + provider + config.
 * The existing `llms` table is for the LLM control plane (versioning, attestation).
 * This table stores the domain truth for LLM catalog entries specifically.
 */
export const aiTypeLlms = pgTable("ai_type_llms", {
  id: serial("id").primaryKey(),

  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
  description: text("description"),

  // Bindings
  providerId: integer("providerId").references(() => providers.id),
  modelId: integer("modelId").references(() => aiTypeModels.id),

  // Role classification (reasoning, embedding, coding, vision, etc.)
  role: varchar("role", { length: 50 }),

  // Type-specific extras
  config: json("config").$type<Record<string, unknown>>(),

  // Canonical key for portability matrix
  canonicalKey: varchar("canonicalKey", { length: 255 }),

  // Lifecycle
  status: varchar("status", { length: 50 }).default("active"),

  // Metadata
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  nameIdx: index("idx_ai_type_llm_name").on(table.name),
  providerIdx: index("idx_ai_type_llm_provider").on(table.providerId),
  modelIdx: index("idx_ai_type_llm_model").on(table.modelId),
  statusIdx: index("idx_ai_type_llm_status").on(table.status),
  canonicalKeyIdx: index("idx_ai_type_llm_canonical").on(table.canonicalKey),
}));

export type AiTypeLlm = typeof aiTypeLlms.$inferSelect;
export type InsertAiTypeLlm = typeof aiTypeLlms.$inferInsert;
