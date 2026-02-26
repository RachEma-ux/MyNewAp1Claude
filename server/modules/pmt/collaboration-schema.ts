/**
 * PMT Engine — Collaboration Schema
 * Meetings, discussions, and news
 */

import {
  serial, varchar, integer, boolean, timestamp, text, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";
import { projects } from "./schema";

export const pmMeetings = pgTable("pm_meetings", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  projectId: integer("projectId").references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  location: varchar("location", { length: 500 }),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime"),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_meetings_ws").on(table.workspaceId),
}));

export type PmMeeting = typeof pmMeetings.$inferSelect;

export const pmMeetingItems = pgTable("pm_meeting_items", {
  id: serial("id").primaryKey(),
  meetingId: integer("meetingId").notNull().references(() => pmMeetings.id),
  itemType: varchar("itemType", { length: 20 }).notNull(),  // agenda, minutes, action, decision
  content: text("content").notNull(),
  assigneeId: integer("assigneeId").references(() => users.id),
  position: integer("position").notNull(),
  done: boolean("done").default(false),
}, (table) => ({
  meetingIdx: index("idx_pm_meeting_items_meeting").on(table.meetingId),
}));

export type PmMeetingItem = typeof pmMeetingItems.$inferSelect;

export const pmDiscussions = pgTable("pm_discussions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  projectId: integer("projectId").references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  pinned: boolean("pinned").default(false),
  locked: boolean("locked").default(false),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_discussions_ws").on(table.workspaceId),
}));

export type PmDiscussion = typeof pmDiscussions.$inferSelect;

export const pmDiscussionPosts = pgTable("pm_discussion_posts", {
  id: serial("id").primaryKey(),
  discussionId: integer("discussionId").notNull().references(() => pmDiscussions.id),
  authorId: integer("authorId").references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  discIdx: index("idx_pm_discussion_posts_disc").on(table.discussionId),
}));

export type PmDiscussionPost = typeof pmDiscussionPosts.$inferSelect;

export const pmNews = pgTable("pm_news", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  projectId: integer("projectId").references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  summary: text("summary"),
  content: text("content"),
  authorId: integer("authorId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_news_ws").on(table.workspaceId),
}));

export type PmNews = typeof pmNews.$inferSelect;
