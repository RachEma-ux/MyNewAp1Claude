# OpenCode Settings — Code Studio Module

## Overview

The OpenCode Settings surface lives inside Code Studio and provides structured management of the OpenCode runtime configuration. It is accessible at:

**Route:** `/code-studio/opencode-settings`

**Navigation:** Code Studio sidebar > OpenCode

## Architecture

### Ownership

- **Code Studio** is the standalone module owner
- **OpenCode** is an internal runtime of Code Studio
- Settings state is persisted in CODEDB (Code Studio's dedicated database)
- No cross-module leakage — settings do not bleed into global platform state

### Data Model

| Table | Purpose |
|-------|---------|
| `code_opencode_profiles` | Runtime and TUI config profiles with draft/applied state |
| `code_opencode_profile_versions` | Versioned config snapshots for audit trail |
| `code_opencode_apply_events` | Apply, revert, validate, preview event history |

### API Namespace

All settings endpoints live under `codeStudio.opencodeSettings.*`:

- `profiles.*` — CRUD for config profiles
- `versions.*` — Version history
- `validation.*` — Config validation
- `generate.*` — Config preview/generation
- `apply.*` — Apply flow and event history
- `runtimeStatus.*` — Comprehensive runtime status

## Settings Categories

### Runtime Config (opencode.json)

| Section | UI Type | Fields |
|---------|---------|--------|
| Runtime / General | Forms | logLevel, model, small_model, default_agent, share, snapshot, autoupdate |
| Server | Forms | port, hostname, mdns, mdnsDomain, cors |
| Providers & Models | Forms + JSON | model, small_model, enabled/disabled providers, provider configs |
| Agents | Cards + JSON | Custom agent definitions with mode, model, prompt, permissions |
| Permissions | Forms + JSON | Global or per-tool permission rules (allow/ask/deny) |
| Commands | JSON | Custom command templates |
| Formatters | JSON | Code formatter configs |
| MCP & Plugins | Forms + JSON | MCP server configs, plugin list |
| Instructions & Watcher | Forms | Instruction paths, watcher ignore patterns, compaction, skills |
| Advanced | JSON | Experimental settings, full config editor |

### TUI Config (tui.json)

| Setting | UI Type |
|---------|---------|
| theme | Text input |
| diff_style | Select (auto/stacked) |
| scroll_speed | Number input |
| scroll_acceleration | Toggle |
| keybinds | JSON editor (96 bindable actions) |
| plugin, plugin_enabled | Forms |

## Secret Handling

- Provider API keys use `{{secret:key_name}}` reference pattern
- Secrets are redacted in preview, logs, and audit events
- The platform secrets service (AES-256-GCM) handles encryption
- Raw secrets never appear in generated config previews

## Validation

- Field-level validation for all typed settings
- Section-level validation for structured objects
- Full-profile validation before apply
- Schema-aligned rules based on opencode.ai/config.json and opencode.ai/tui.json

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  OpenCode Settings  [Runtime | TUI]    [Unsaved]    │
├──────────┬──────────────────────────────────────────┤
│ Overview │                                          │
│ Runtime  │  Section Content Area                    │
│ Server   │  (forms, JSON editors, cards)            │
│ Provid.. │                                          │
│ Agents   │                                          │
│ Permis.. │                                          │
│ Comman.. │                                          │
│ Forma..  │                                          │
│ MCP &..  │                                          │
│ Instru.. │                                          │
│ TUI      │                                          │
│ Advanc.. │                                          │
│ Status   │                                          │
├──────────┴──────────────────────────────────────────┤
│ [Save Draft] [Validate] [Preview] | [Health] [Apply]│
└─────────────────────────────────────────────────────┘
```
