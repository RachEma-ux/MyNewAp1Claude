-- Event Bus persistence — Phase 2 foundation.
--
-- The platform ships an in-process bus by default. Deployments that
-- need durable cross-process delivery should apply this migration and
-- wire a Postgres-backed `EventBusStore` (see
-- `server/platform/events/store.ts`).
--
-- All four tables are append-mostly. `event_inbox` is the only table
-- written on the hot delivery path; others are written on
-- enqueue / failure / DLQ. Use `event_inbox` PRIMARY KEY for
-- consumer-side idempotency.

CREATE TABLE IF NOT EXISTS event_outbox (
  event_id            TEXT PRIMARY KEY,
  event_type          TEXT NOT NULL,
  source_module       TEXT NOT NULL,
  priority            TEXT NOT NULL,
  workspace_id        TEXT NULL,
  actor_id            TEXT NULL,
  correlation_id      TEXT NOT NULL,
  schema_version      TEXT NOT NULL,
  payload             JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL,
  governance_receipt_id TEXT NULL,
  idempotency_key     TEXT NULL,
  -- delivery state
  attempts            INT NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending',
  last_error          TEXT NULL
);
CREATE INDEX IF NOT EXISTS event_outbox_status_idx ON event_outbox (status);
CREATE INDEX IF NOT EXISTS event_outbox_eventtype_idx ON event_outbox (event_type);

CREATE TABLE IF NOT EXISTS event_inbox (
  consumer            TEXT NOT NULL,
  dedup_id            TEXT NOT NULL,  -- idempotency_key ?? event_id
  processed_at        TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (consumer, dedup_id)
);

CREATE TABLE IF NOT EXISTS event_dead_letter (
  event_id            TEXT PRIMARY KEY,
  envelope            JSONB NOT NULL,
  attempts            INT NOT NULL,
  last_error          TEXT NULL,
  moved_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_critical_dead_letter (
  id                  BIGSERIAL PRIMARY KEY,
  event_id            TEXT NOT NULL,
  consumer            TEXT NOT NULL,
  envelope            JSONB NOT NULL,
  error               TEXT NOT NULL,
  attempted_at        TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS event_critical_dlq_eventid_idx
  ON event_critical_dead_letter (event_id);
