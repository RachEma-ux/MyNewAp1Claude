/**
 * OpenRouter Module — Database Schema
 *
 * OpenRouter-specific persistence. Reuses platform's providers, provider_usage,
 * routing_audit_logs, and provider_health_checks for generic tracking.
 * These tables cover OpenRouter-specific concerns only:
 * - model catalog cache (synced from OpenRouter API)
 * - sync run history
 * - routing profiles (presets + custom)
 * - execution log (OpenRouter-specific metadata)
 */

import {
  serial, varchar, text, integer, boolean, timestamp, json, real,
  pgTable, index, unique,
} from "drizzle-orm/pg-core";

// ── 1. OpenRouter Config (singleton per platform) ──────────────────

export const openrouterConfig = pgTable("openrouter_config", {
  id: serial("id").primaryKey(),
  apiKey: text("apiKey"),                   // encrypted, server-side only
  adminKey: text("adminKey"),               // encrypted, optional management key
  endpoint: text("endpoint").default("https://openrouter.ai/api/v1").notNull(),
  siteUrl: text("siteUrl"),                 // x-title header for OpenRouter rankings
  siteName: text("siteName"),               // x-url header
  enabled: boolean("enabled").default(false).notNull(),
  defaultModelId: varchar("defaultModelId", { length: 255 }),
  defaultRoutingProfile: integer("defaultRoutingProfile"),
  lastSyncAt: timestamp("lastSyncAt"),
  lastHealthCheck: timestamp("lastHealthCheck"),
  healthStatus: varchar("healthStatus", { length: 50 }).default("unknown").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type OpenRouterConfig = typeof openrouterConfig.$inferSelect;
export type InsertOpenRouterConfig = typeof openrouterConfig.$inferInsert;

// ── 2. Model Catalog Cache ─────────────────────────────────────────

export const openrouterModels = pgTable("openrouter_models", {
  id: serial("id").primaryKey(),
  modelId: varchar("modelId", { length: 255 }).notNull().unique(),  // e.g. "openai/gpt-4o"
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  contextLength: integer("contextLength"),
  maxOutput: integer("maxOutput"),
  promptPricing: real("promptPricing"),     // $ per 1M tokens
  completionPricing: real("completionPricing"),
  imagePricing: real("imagePricing"),
  architecture: json("architecture").$type<{ tokenizer?: string; instruct_type?: string; modality?: string }>(),
  topProvider: json("topProvider").$type<{ maxCompletionTokens?: number; isModerated?: boolean; contextLength?: number }>(),
  capabilities: json("capabilities").$type<{
    chat: boolean;
    completion: boolean;
    embedding: boolean;
    toolCalling: boolean;
    vision: boolean;
    structuredOutput: boolean;
    reasoning: boolean;
  }>(),
  providerSlug: varchar("providerSlug", { length: 100 }),  // e.g. "openai", "anthropic"
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  modelIdx: index("idx_or_models_modelid").on(table.modelId),
  providerIdx: index("idx_or_models_provider").on(table.providerSlug),
}));

export type OpenRouterModel = typeof openrouterModels.$inferSelect;
export type InsertOpenRouterModel = typeof openrouterModels.$inferInsert;

// ── 3. Sync Runs ───────────────────────────────────────────────────

export const openrouterSyncRuns = pgTable("openrouter_sync_runs", {
  id: serial("id").primaryKey(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  modelsFound: integer("modelsFound").default(0).notNull(),
  modelsAdded: integer("modelsAdded").default(0).notNull(),
  modelsUpdated: integer("modelsUpdated").default(0).notNull(),
  errorMessage: text("errorMessage"),
  durationMs: integer("durationMs"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OpenRouterSyncRun = typeof openrouterSyncRuns.$inferSelect;
export type InsertOpenRouterSyncRun = typeof openrouterSyncRuns.$inferInsert;

// ── 4. Routing Profiles ────────────────────────────────────────────

export const openrouterRoutingProfiles = pgTable("openrouter_routing_profiles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isPreset: boolean("isPreset").default(false).notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  config: json("config").$type<{
    order?: string[];             // provider preference order
    allowFallbacks?: boolean;
    requireParametersMatch?: boolean;
    dataCollection?: "allow" | "deny";
    transforms?: string[];        // e.g. ["middle-out"]
    providers?: Array<{ name: string; order: number; allow: boolean }>;
    modelConstraints?: { maxCost?: number; maxLatency?: number; minContext?: number };
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type OpenRouterRoutingProfile = typeof openrouterRoutingProfiles.$inferSelect;
export type InsertOpenRouterRoutingProfile = typeof openrouterRoutingProfiles.$inferInsert;

// ── 5. Execution Log (OpenRouter-specific) ─────────────────────────

export const openrouterExecutions = pgTable("openrouter_executions", {
  id: serial("id").primaryKey(),
  modelId: varchar("modelId", { length: 255 }).notNull(),
  routingProfileId: integer("routingProfileId"),
  status: varchar("status", { length: 50 }).notNull(),   // "success" | "error" | "denied"
  requestType: varchar("requestType", { length: 50 }),    // "chat" | "embedding" | "structured"
  promptTokens: integer("promptTokens"),
  completionTokens: integer("completionTokens"),
  totalTokens: integer("totalTokens"),
  cost: real("cost"),
  latencyMs: integer("latencyMs"),
  providerUsed: varchar("providerUsed", { length: 100 }),
  fallbackUsed: boolean("fallbackUsed").default(false),
  governanceVerdict: varchar("governanceVerdict", { length: 50 }),
  governanceReason: text("governanceReason"),
  errorMessage: text("errorMessage"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  modelIdx: index("idx_or_exec_model").on(table.modelId),
  statusIdx: index("idx_or_exec_status").on(table.status),
  dateIdx: index("idx_or_exec_date").on(table.createdAt),
}));

export type OpenRouterExecution = typeof openrouterExecutions.$inferSelect;
export type InsertOpenRouterExecution = typeof openrouterExecutions.$inferInsert;

// ── 6. Activity Log ────────────────────────────────────────────────

export const openrouterActivity = pgTable("openrouter_activity", {
  id: serial("id").primaryKey(),
  action: varchar("action", { length: 100 }).notNull(),
  actorId: integer("actorId"),
  details: text("details"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  actionIdx: index("idx_or_activity_action").on(table.action),
}));

export type OpenRouterActivity = typeof openrouterActivity.$inferSelect;
export type InsertOpenRouterActivity = typeof openrouterActivity.$inferInsert;
