/**
 * CommunicationDB — Seed Script
 *
 * Creates Communication tables idempotently using CREATE TABLE IF
 * NOT EXISTS. Called from the manifest boot hook on server startup.
 * Wrapped in try/catch by the caller so a missing DB does not block
 * the platform.
 */

import { sql } from "drizzle-orm";
import { getCommunicationDb } from "./connection";

export interface SeedResult {
  seeded: boolean;
  reason?: string;
}

export async function seedCommunicationDb(): Promise<SeedResult> {
  const db = getCommunicationDb();
  if (!db) {
    return { seeded: false, reason: "CommunicationDB not connected" };
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS communication_conversations (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      owner_user_id INTEGER,
      title VARCHAR(500) NOT NULL,
      conversation_type VARCHAR(30) NOT NULL DEFAULT 'human',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      source_module VARCHAR(50),
      source_ref_id INTEGER,
      metadata_json JSONB,
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      updated_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS communication_conversations_workspace_idx
      ON communication_conversations(workspace_id);
    CREATE INDEX IF NOT EXISTS communication_conversations_owner_idx
      ON communication_conversations(owner_user_id);
    CREATE INDEX IF NOT EXISTS communication_conversations_status_idx
      ON communication_conversations(status);
    CREATE INDEX IF NOT EXISTS communication_conversations_type_idx
      ON communication_conversations(conversation_type);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS communication_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL,
      sender_user_id INTEGER,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      content_type VARCHAR(20) NOT NULL DEFAULT 'text',
      metadata_json JSONB,
      created_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS communication_messages_conversation_idx
      ON communication_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS communication_messages_created_idx
      ON communication_messages(created_at);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS communication_meetings (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      title VARCHAR(500) NOT NULL,
      meeting_type VARCHAR(20) NOT NULL DEFAULT 'video',
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      meeting_url VARCHAR(1000),
      created_by INTEGER NOT NULL,
      metadata_json JSONB,
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      updated_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS communication_meetings_workspace_idx
      ON communication_meetings(workspace_id);
    CREATE INDEX IF NOT EXISTS communication_meetings_status_idx
      ON communication_meetings(status);
    CREATE INDEX IF NOT EXISTS communication_meetings_start_idx
      ON communication_meetings(start_time);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS communication_participants (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER,
      meeting_id INTEGER,
      user_id INTEGER,
      external_label VARCHAR(200),
      participant_role VARCHAR(20) NOT NULL DEFAULT 'participant',
      joined_at TIMESTAMP,
      left_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS communication_participants_conv_idx
      ON communication_participants(conversation_id);
    CREATE INDEX IF NOT EXISTS communication_participants_meeting_idx
      ON communication_participants(meeting_id);
    CREATE INDEX IF NOT EXISTS communication_participants_user_idx
      ON communication_participants(user_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS communication_notifications (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      source_module VARCHAR(50),
      event_type VARCHAR(100) NOT NULL,
      title VARCHAR(500) NOT NULL,
      body TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'unread',
      metadata_json JSONB,
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      read_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS communication_notifications_workspace_idx
      ON communication_notifications(workspace_id);
    CREATE INDEX IF NOT EXISTS communication_notifications_user_idx
      ON communication_notifications(user_id);
    CREATE INDEX IF NOT EXISTS communication_notifications_status_idx
      ON communication_notifications(status);
    CREATE INDEX IF NOT EXISTS communication_notifications_event_idx
      ON communication_notifications(event_type);
  `);

  return { seeded: true };
}
