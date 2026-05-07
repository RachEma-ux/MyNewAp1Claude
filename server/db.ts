/**
 * Database barrel file — re-exports all domain-specific query modules.
 *
 * The actual implementations live in server/db/:
 *   connection.ts — getDb(), db proxy, helpers
 *   users.ts      — upsertUser, getUserByOpenId
 *   workspaces.ts — createWorkspace, getUserWorkspaces, …
 *   models.ts     — createModel, getAllModels, …
 *   documents.ts  — createDocument, getDocumentChunks, …
 *   agents.ts     — createAgent, getWorkspaceAgents, …
 *   conversations.ts — createConversation, getConversationMessages, …
 *   workflows.ts  — createWorkflow, publishWorkflow, …
 *   llms.ts       — createLLM, createLLMVersion, …
 *   catalog.ts    — getCatalogEntries, seedTaxonomy, …
 *
 * All existing imports (`from "../db"`, `from "./db"`) continue to work.
 */

// Drizzle ORM re-exports
export { eq, and, desc, sql, inArray, ne } from "drizzle-orm";

// Connection & helpers
export { getDb, db, insertInto, updateTable } from "./db/connection";

// Domain modules
export * from "./db/users";
export * from "./db/workspaces";
export * from "./db/models";
export * from "./db/documents";
export * from "./db/agents";
export * from "./db/conversations";
export * from "./db/workflows";
export * from "./db/llms";
// Plan v3 Phase 31 (Phase 26.1) — barrel re-export of ai-types/db stripped.
// Catalog/taxonomy/audit helpers now live behind `ai-types/public-api.ts`;
// import them explicitly from there. The boundary lint enforces this.
export * from "./db/workspace-rbac";
