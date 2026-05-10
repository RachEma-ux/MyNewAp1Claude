# Agent Studio — Shared Vault Editing Locks — ADR

**Owner:** Agent Studio module + Frontend
**Phase:** Native Graph Workspace — Phase 1 / Phase 2.5
**Status:** Adopted

---

## 1. Decision

### 1.1 Soft locks, not hard locks

- Opening a note creates an edit session record.
- Edit session displays "User X is editing" badge.
- Lock auto-expires after inactivity (default 5 min).
- Other users can still open + read; save attempts trigger conflict UX.
- No real-time CRDT collaboration in MVP.

### 1.2 Tables

```sql
CREATE TABLE ags_vault_note_edit_sessions (
  id SERIAL PRIMARY KEY,
  note_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP
);

CREATE TABLE ags_vault_note_locks (
  id SERIAL PRIMARY KEY,
  note_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  acquired_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  released_at TIMESTAMP,
  UNIQUE (note_id) WHERE released_at IS NULL
);

CREATE TABLE ags_vault_note_conflict_resolutions (
  id SERIAL PRIMARY KEY,
  note_id INTEGER NOT NULL,
  conflict_kind VARCHAR(50) NOT NULL,             -- 'concurrent_save', 'lock_override'
  loser_version_id INTEGER,
  winner_version_id INTEGER,
  resolution VARCHAR(50) NOT NULL,                -- 'save_copy', 'merge_manual', 'discard_draft'
  resolved_by_user_id INTEGER,
  resolved_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB
);
```

### 1.3 Conflict UX

On save conflict:
1. Show diff of latest committed version vs user's draft.
2. Offer: Save Copy / Merge Manually / Discard Draft.
3. Resolution recorded in `ags_vault_note_conflict_resolutions`.
4. Audit event written.

## 2. Acceptance

- [x] Soft-lock model defined.
- [x] Tables defined.
- [x] Conflict UX defined.
- [ ] Drizzle reconciler creates tables.
- [ ] Phase 2.5 ships UX.
