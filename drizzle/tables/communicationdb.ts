/**
 * CommunicationDB Tables — Communication Module Database
 *
 * Dedicated PostgreSQL database for the Communication RTLM. Owns
 * conversations, messages, meetings, participants, and notifications.
 * All tables prefixed with `communication_`.
 *
 * Connected via server/communication/connection.ts using
 * DATABASE_URL_COMMUNICATIONDB (or derived from DATABASE_URL).
 */

import {
  serial,
  varchar,
  pgTable,
  text,
  integer,
  timestamp,
  json,
  index,
} from "drizzle-orm/pg-core";

// ══════════════════════════════════════════════════════════════════════════════
// communication_conversations
// ══════════════════════════════════════════════════════════════════════════════

export const communicationConversations = pgTable(
  "communication_conversations",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    ownerUserId: integer("owner_user_id"),
    title: varchar("title", { length: 500 }).notNull(),
    conversationType: varchar("conversation_type", { length: 30 })
      .notNull()
      .default("human"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    sourceModule: varchar("source_module", { length: 50 }),
    sourceRefId: integer("source_ref_id"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("communication_conversations_workspace_idx").on(
      table.workspaceId,
    ),
    ownerIdx: index("communication_conversations_owner_idx").on(
      table.ownerUserId,
    ),
    statusIdx: index("communication_conversations_status_idx").on(table.status),
    typeIdx: index("communication_conversations_type_idx").on(
      table.conversationType,
    ),
  }),
);

export type CommunicationConversation =
  typeof communicationConversations.$inferSelect;
export type InsertCommunicationConversation =
  typeof communicationConversations.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// communication_messages
// ══════════════════════════════════════════════════════════════════════════════

export const communicationMessages = pgTable(
  "communication_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id").notNull(),
    senderUserId: integer("sender_user_id"),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    contentType: varchar("content_type", { length: 20 })
      .notNull()
      .default("text"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index("communication_messages_conversation_idx").on(
      table.conversationId,
    ),
    createdIdx: index("communication_messages_created_idx").on(table.createdAt),
  }),
);

export type CommunicationMessage = typeof communicationMessages.$inferSelect;
export type InsertCommunicationMessage =
  typeof communicationMessages.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// communication_meetings
// ══════════════════════════════════════════════════════════════════════════════

export const communicationMeetings = pgTable(
  "communication_meetings",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    meetingType: varchar("meeting_type", { length: 20 })
      .notNull()
      .default("video"),
    status: varchar("status", { length: 20 }).notNull().default("scheduled"),
    startTime: timestamp("start_time"),
    endTime: timestamp("end_time"),
    meetingUrl: varchar("meeting_url", { length: 1000 }),
    createdBy: integer("created_by").notNull(),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("communication_meetings_workspace_idx").on(
      table.workspaceId,
    ),
    statusIdx: index("communication_meetings_status_idx").on(table.status),
    startIdx: index("communication_meetings_start_idx").on(table.startTime),
  }),
);

export type CommunicationMeeting = typeof communicationMeetings.$inferSelect;
export type InsertCommunicationMeeting =
  typeof communicationMeetings.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// communication_participants
// ══════════════════════════════════════════════════════════════════════════════

export const communicationParticipants = pgTable(
  "communication_participants",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id"),
    meetingId: integer("meeting_id"),
    userId: integer("user_id"),
    externalLabel: varchar("external_label", { length: 200 }),
    participantRole: varchar("participant_role", { length: 20 })
      .notNull()
      .default("participant"),
    joinedAt: timestamp("joined_at"),
    leftAt: timestamp("left_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index("communication_participants_conv_idx").on(
      table.conversationId,
    ),
    meetingIdx: index("communication_participants_meeting_idx").on(
      table.meetingId,
    ),
    userIdx: index("communication_participants_user_idx").on(table.userId),
  }),
);

export type CommunicationParticipant =
  typeof communicationParticipants.$inferSelect;
export type InsertCommunicationParticipant =
  typeof communicationParticipants.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// communication_notifications
// ══════════════════════════════════════════════════════════════════════════════

export const communicationNotifications = pgTable(
  "communication_notifications",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    userId: integer("user_id").notNull(),
    sourceModule: varchar("source_module", { length: 50 }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    body: text("body"),
    status: varchar("status", { length: 20 }).notNull().default("unread"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    readAt: timestamp("read_at"),
  },
  (table) => ({
    workspaceIdx: index("communication_notifications_workspace_idx").on(
      table.workspaceId,
    ),
    userIdx: index("communication_notifications_user_idx").on(table.userId),
    statusIdx: index("communication_notifications_status_idx").on(table.status),
    eventTypeIdx: index("communication_notifications_event_idx").on(
      table.eventType,
    ),
  }),
);

export type CommunicationNotification =
  typeof communicationNotifications.$inferSelect;
export type InsertCommunicationNotification =
  typeof communicationNotifications.$inferInsert;
