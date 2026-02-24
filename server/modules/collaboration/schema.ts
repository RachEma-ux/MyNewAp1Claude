/**
 * Collaboration Engine — Database Schema
 * Threads, messages, mentions
 */

import {
  serial, varchar, text, integer, timestamp, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";

export const threads = pgTable("collab_threads", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  title: varchar("title", { length: 500 }).notNull(),
  type: varchar("type", { length: 50 }).default("discussion").notNull(), // discussion | approval | meeting_notes
  status: varchar("status", { length: 50 }).default("open").notNull(),
  createdBy: integer("createdBy").references(() => users.id),
  linkedType: varchar("linkedType", { length: 50 }), // project | task | document
  linkedId: integer("linkedId"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_collab_threads_ws").on(table.workspaceId),
  typeIdx: index("idx_collab_threads_type").on(table.type),
}));

export type Thread = typeof threads.$inferSelect;
export type InsertThread = typeof threads.$inferInsert;

export const threadMessages = pgTable("collab_thread_messages", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  threadId: integer("threadId").notNull().references(() => threads.id),
  authorId: integer("authorId").references(() => users.id),
  authorType: varchar("authorType", { length: 20 }).default("human"), // human | ai
  content: text("content").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  threadIdx: index("idx_collab_messages_thread").on(table.threadId),
}));

export type ThreadMessage = typeof threadMessages.$inferSelect;
export type InsertThreadMessage = typeof threadMessages.$inferInsert;

export const threadMentions = pgTable("collab_thread_mentions", {
  id: serial("id").primaryKey(),
  messageId: integer("messageId").notNull().references(() => threadMessages.id),
  userId: integer("userId").references(() => users.id),
  mentionType: varchar("mentionType", { length: 20 }).default("user"), // user | ai | role
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ThreadMention = typeof threadMentions.$inferSelect;
