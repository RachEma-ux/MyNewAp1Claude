import { integer, serial, varchar, pgTable, text, timestamp, boolean, json, index, uniqueIndex } from "drizzle-orm/pg-core";

// ============================================================================
// Bot Domain — Governed entity storage (domain-first pattern)
// ============================================================================

/**
 * Bots are domain entities that bind agents + LLMs to channels.
 * This is the canonical domain storage — NOT catalog_entries.
 *
 * Lifecycle: draft → configured → validated → deployable → archived
 * "Deployable" means eligible for Catalog import, NOT runtime-ready.
 * Runtime authority is granted only by Catalog publication + activation.
 */
export const bots = pgTable("bots", {
  id: serial("id").primaryKey(),

  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
  description: text("description"),

  // Bindings (upstream entity references)
  agentId: integer("agentId"),
  llmId: integer("llmId"),

  // Channel configuration
  channels: json("channels").$type<string[]>(),

  // Behavior
  behaviorConfig: json("behaviorConfig").$type<{
    systemPrompt?: string;
    persona?: string;
    responseStyle?: string;
  }>(),

  // Rate limiting
  rateLimit: integer("rateLimit"),

  // Scope
  scope: varchar("scope", { length: 50 }).default("app").notNull(),

  // Lifecycle
  status: varchar("status", { length: 50 }).default("draft").notNull(),

  // Metadata
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  nameIdx: index("idx_bot_name").on(table.name),
  statusIdx: index("idx_bot_status").on(table.status),
}));

export type Bot = typeof bots.$inferSelect;
export type InsertBot = typeof bots.$inferInsert;

// ============================================================================
// Bot Versions — Audit trail and rollback (mirrors llmVersions, agentVersions)
// ============================================================================

export const botVersions = pgTable("bot_versions", {
  id: serial("id").primaryKey(),
  botId: integer("botId").notNull(),

  // Version metadata
  version: integer("version").notNull(),
  createdBy: integer("createdBy").notNull(),
  changeNotes: text("changeNotes"),

  // Full snapshot
  botSnapshot: json("botSnapshot").notNull(),

  // Policy state at this version
  policyHash: varchar("policyHash", { length: 64 }),
  policyDecision: varchar("policyDecision", { length: 50 }).default("pending"),

  // Promotion reference
  promotionRequestId: integer("promotionRequestId"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  botIdIdx: index("idx_bot_version_bot_id").on(table.botId),
  uniqueBotVersion: uniqueIndex("unique_bot_version").on(table.botId, table.version),
}));

export type BotVersion = typeof botVersions.$inferSelect;
export type InsertBotVersion = typeof botVersions.$inferInsert;
