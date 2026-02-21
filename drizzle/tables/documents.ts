import { integer, serial, varchar, pgTable, text, timestamp, json } from "drizzle-orm/pg-core";
import { users, workspaces } from "./users";

// ============================================================================
// Document Management
// ============================================================================

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),

  // File information
  filename: varchar("filename", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 50 }).notNull(),
  fileSize: integer("fileSize").notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),

  // Processing status
  status: varchar("status", { length: 50 }).default("pending"),
  errorMessage: text("errorMessage"),

  // Metadata
  title: varchar("title", { length: 500 }),
  author: varchar("author", { length: 255 }),
  pageCount: integer("pageCount"),
  wordCount: integer("wordCount"),

  // Processing results
  chunkCount: integer("chunkCount").default(0),
  embeddingModel: varchar("embeddingModel", { length: 255 }),

  uploadedBy: integer("uploadedBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("documentId").notNull().references(() => documents.id),

  // Chunk content
  content: text("content").notNull(),
  chunkIndex: integer("chunkIndex").notNull(),

  // Metadata
  pageNumber: integer("pageNumber"),
  heading: varchar("heading", { length: 500 }),

  // Vector DB reference
  vectorId: varchar("vectorId", { length: 255 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = typeof documentChunks.$inferInsert;
