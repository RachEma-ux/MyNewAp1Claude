-- Manual ops migration — ags_chat_messages
--   `client_message_id` column + `(session_id, client_message_id)`
--   partial UNIQUE INDEX
--
-- Authority: Phase 3.2 of the Agent Studio Runtime Hardening Roadmap
--   V3 (`docs/implementation/agent-studio-runtime-hardening-roadmap.md`).
-- Companion to drizzle declaration in
--   `drizzle/tables/agent-studio.ts` (column + non-unique lookup index
--   `idx_ags_chat_messages_client_msg`).
-- Deployment: ASDB (Agent Studio dedicated database)
-- Run: psql -d asdb -f scripts/migrations/manual/ags-chat-messages-client-message-id.sql
--
-- The column itself is auto-applied by the boot-time seed reconciler
-- (`server/agent-studio/db/seed.ts:203` — ALTER TABLE ADD COLUMN IF
-- NOT EXISTS). The non-unique lookup index is also auto-applied. This
-- script ONLY adds the partial UNIQUE INDEX, which the reconciler
-- cannot create because (a) it doesn't render WHERE clauses for
-- partial indexes, and (b) the application-level dedup in
-- `appendChatMessageWithIdempotency` already provides correctness;
-- the unique index is a database-level race-protection backstop.
--
-- Pattern mirrors M2-c6 (cycle-6 audit closure) for
-- `ags_pending_permission_requests` `(agent_draft_id,
-- proposed_tool_call_hash)` UNIQUE INDEX. Same SELECT-then-INSERT
-- race window: between the SELECT and the INSERT, two concurrent
-- duplicate-clientMessageId requests could both see "no existing
-- row" and both INSERT, defeating idempotency. The unique index
-- promotes the second INSERT to a 23505 error which the application
-- can catch and re-SELECT to recover the winning row.
--
-- Why partial?
--   `client_message_id` is nullable — assistant/tool/system rows do
--   not carry the field. A non-partial unique on (session_id,
--   client_message_id) would treat NULLs as identical and forbid
--   more than one assistant row per session. Partial WHERE NOT NULL
--   keeps the constraint scoped to user rows.
--
-- Impact when NOT applied:
--   Existing ASDB instances continue to rely on the application-level
--   silent dedup (`appendChatMessageWithIdempotency`). Under heavy
--   concurrent retry storms (e.g., a flapping mobile network with
--   aggressive EventSource reconnect), the SELECT-INSERT race could
--   produce a duplicate user row + duplicate model spend + duplicate
--   tool dispatch. Application dedup catches the common case;
--   index closes the race.
--
-- Idempotent: uses CREATE UNIQUE INDEX IF NOT EXISTS, safe to re-run.

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_ags_chat_messages_client_msg_unique
  ON ags_chat_messages (session_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Smoke check (run after applying):
--   \d ags_chat_messages
-- Expect: client_message_id varchar(64) ; idx_ags_chat_messages_client_msg_unique UNIQUE.
