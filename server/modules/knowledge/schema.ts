/**
 * Knowledge Engine — Database Schema
 * Documents, document versions, decisions
 */

import {
  serial, varchar, text, integer, timestamp, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";

export const knowledgeDocuments = pgTable("ke_documents", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content"),
  contentType: varchar("contentType", { length: 50 }).default("markdown").notNull(),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  authorId: integer("authorId").references(() => users.id),
  version: integer("version").default(1).notNull(),
  tags: json("tags").$type<string[]>(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_ke_docs_ws").on(table.workspaceId),
  statusIdx: index("idx_ke_docs_status").on(table.status),
}));

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type InsertKnowledgeDocument = typeof knowledgeDocuments.$inferInsert;

export const documentVersions = pgTable("ke_document_versions", {
  id: serial("id").primaryKey(),
  documentId: integer("documentId").notNull().references(() => knowledgeDocuments.id),
  version: integer("version").notNull(),
  content: text("content"),
  changeNote: text("changeNote"),
  authorId: integer("authorId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  docIdx: index("idx_ke_doc_versions_doc").on(table.documentId),
}));

export type DocumentVersion = typeof documentVersions.$inferSelect;

export const decisions = pgTable("ke_decisions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("proposed").notNull(),
  outcome: text("outcome"),
  authorId: integer("authorId").references(() => users.id),
  linkedDocumentId: integer("linkedDocumentId").references(() => knowledgeDocuments.id),
  evidenceRefs: json("evidenceRefs").$type<string[]>(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_ke_decisions_ws").on(table.workspaceId),
}));

export type Decision = typeof decisions.$inferSelect;
export type InsertDecision = typeof decisions.$inferInsert;
