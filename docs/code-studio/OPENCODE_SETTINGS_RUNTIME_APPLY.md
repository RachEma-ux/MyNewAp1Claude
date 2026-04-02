# OpenCode Settings — Runtime Apply Flow

## Apply Lifecycle

```
User edits draft
       │
       ▼
  Save Draft ──► Persisted in code_opencode_profiles.config_draft
       │
       ▼
  Validate ──► validateRuntimeConfig() / validateTuiConfig()
       │          └── Returns errors/warnings
       ▼
  Preview ──► generateRuntimeConfig() / generateTuiConfig()
       │          └── Shows redacted JSON output
       ▼
  Apply ──► Creates version snapshot
       │    ├── Validates config
       │    ├── Generates normalized config
       │    ├── Checks OpenCode runtime health
       │    ├── Marks profile as "applied"
       │    ├── Records apply event
       │    └── Triggers runtime status refresh
       ▼
  Runtime Status ──► Displays apply result + health check
```

## What "Apply" Does

1. **Saves the current draft** to CODEDB
2. **Validates** the config against known OpenCode schema rules
3. **Creates a version snapshot** (incrementing version number)
4. **Generates** a normalized opencode.json or tui.json payload
5. **Checks OpenCode health** via `GET /global/health`
6. **Records an apply event** with status, generated config, health result
7. **Updates profile** to "applied" status with version number

## Runtime Integration

The apply flow checks if the OpenCode runtime is reachable. The config is persisted in CODEDB regardless of runtime availability:

- **Runtime reachable**: Apply event records "success", health check passes
- **Runtime unreachable**: Apply event records "failed" with error message, config is still saved

To fully reload OpenCode with the new config, the config file must be placed where OpenCode reads it (project root `opencode.json` or `~/.config/opencode/config.json`). The Code Studio apply flow records the intent and validates the config; the actual file placement depends on the deployment model.

## Revert Flow

1. User selects a previous version from version history
2. That version's config is loaded back into the draft
3. User can then validate and re-apply

## Audit Trail

All apply events are recorded in `code_opencode_apply_events`:
- Profile ID and type
- Version number
- Action (apply/revert/validate/preview)
- Status (success/failed/pending)
- Generated config (with secrets redacted)
- Validation errors
- Health check result
- Actor user ID
- Timestamp

Events are also recorded in the Code Studio audit log (`code_audit_events`).

## Secret Safety

- Secrets use `{{secret:key}}` reference pattern
- Generated config preview always redacts sensitive values
- Apply events store redacted config copies
- Audit events never contain raw secret values
