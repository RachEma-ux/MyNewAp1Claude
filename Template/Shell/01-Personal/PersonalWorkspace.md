# Personal Workspace Template

## Purpose

The Personal Workspace is a single-user execution domain anchored to **identity**. It provides an individual with their own governed environment for personal productivity, private drafts, AI assistant interaction, note-taking, and personal reporting.

It is the lightest workspace type — minimal governance overhead, limited resource allocation, and a focused tool stack oriented toward individual output rather than collaboration.

---

## Context & Scope

**Context**: A Personal Workspace belongs to exactly one user. It is their private operational space within the Digital HQ.

**Scope Anchor**: Identity — the workspace is bound to a single human user. All data, tools, and policies are scoped to that individual.

**Typical Use Cases**:
- Personal task management and to-do tracking
- Private document drafting and note-taking
- AI assistant conversations (personal context)
- Personal knowledge base and bookmarks
- Individual reporting and activity dashboards

---

## Identity Boundary

| Attribute         | Personal Workspace Value                        |
|-------------------|-------------------------------------------------|
| Humans            | 1 (owner only)                                  |
| AI Agents         | 1 personal assistant agent (optional)           |
| Roles             | Owner (sole role — full access)                 |
| Authority Levels  | Single-tier (no escalation needed)              |
| Ownership Model   | Single-owner, non-transferable                  |

The identity model is the simplest possible: one user, one workspace, full authority within that scope.

---

## Tool Stack

| Attribute           | Personal Workspace Value                       |
|---------------------|------------------------------------------------|
| Enabled Modules     | Tasks, Notes, AI Chat, Knowledge, Reporting    |
| Automation Pipelines| Personal reminders, daily digest               |
| Agent Capabilities  | Read personal data, draft documents, summarize |
| Integrations        | Calendar sync, personal email (optional)       |
| UI Modules          | Compact sidebar, personal dashboard            |

**Default Modules**:
- `tasks` — Personal task list and to-do tracking
- `notes` — Private note-taking and drafts
- `ai-chat` — Personal AI assistant conversations
- `knowledge` — Personal knowledge base (bookmarks, saved items)
- `reporting` — Personal activity dashboard

**Optional Modules** (disabled by default):
- `automation` — Personal workflow triggers
- `calendar` — Calendar integration view

---

## Data Access Layer

| Attribute         | Personal Workspace Value                        |
|-------------------|-------------------------------------------------|
| Datasets          | User's own data only                            |
| Documents         | Private drafts, personal notes                  |
| Logs              | Personal activity log                           |
| External Sources  | None by default (user can add bookmarks)        |
| Version Control   | Lightweight versioning on notes                 |

Data isolation is strict: no other user or workspace can access personal workspace data unless the user explicitly shares an artifact outward.

---

## Policy Layer

| Attribute               | Personal Workspace Value                   |
|-------------------------|--------------------------------------------|
| Governance Constraints  | Inherited from Digital HQ (minimal)        |
| Approval Gates          | None (single user, no approval needed)     |
| Compliance Requirements | Standard org policies apply                |
| Audit Logging           | Minimal — personal actions only            |
| Risk Restrictions       | Standard (no elevated risk operations)     |

Governance intensity is **low**. The user is the sole actor, so approval flows and multi-party governance are unnecessary. Digital HQ global policies still apply (data retention, security standards).

---

## Resource Allocation

| Attribute          | Personal Workspace Value                       |
|--------------------|------------------------------------------------|
| Resource Tier      | `minimal`                                      |
| CPU/GPU Limits     | Low compute quota                              |
| Storage Quotas     | 2 GB personal storage                          |
| Model Access       | Default models only                            |
| API Rate Limits    | 30 requests/minute                             |
| Budget Caps        | $10/month                                      |
| External Credentials| None by default                               |

Personal workspaces receive the smallest resource allocation. They are not intended for compute-intensive operations.

---

## Module Breakdown

| Module Key   | Label              | Default | Gatable | Purpose                           |
|--------------|--------------------|---------|---------|-----------------------------------|
| `tasks`      | Tasks              | On      | Yes     | Personal to-do list               |
| `notes`      | Notes              | On      | Yes     | Private note-taking               |
| `ai-chat`    | AI Chat            | On      | Yes     | Personal AI assistant             |
| `knowledge`  | Knowledge          | On      | Yes     | Bookmarks and saved items         |
| `reporting`  | Dashboard          | On      | Yes     | Personal activity overview        |
| `automation` | Automation         | Off     | Yes     | Personal workflow triggers        |
| `calendar`   | Calendar           | Off     | Yes     | Calendar integration              |
| `overview`   | Overview           | On      | No      | Landing page (always on)          |
| `settings`   | Settings           | On      | No      | Workspace config (always on)      |

---

## Governance Considerations

- Personal workspaces have the lowest governance overhead
- No multi-party approval flows required
- Audit logging is minimal (personal actions only, no cross-user impact)
- Digital HQ global policies still apply and cannot be overridden
- Data export from personal workspace follows standard org export policy
- AI agent in personal workspace operates under personal-tier rate limits

---

## Integration Notes

- Personal workspace is created automatically when a user account is provisioned
- One personal workspace per user (enforced at creation)
- Personal workspace cannot be deleted while the user account is active
- Data from personal workspace can be shared outward to project/research workspaces via explicit export
- The personal AI assistant agent is scoped to this workspace only

---

## Relationship to Digital HQ

The Personal Workspace is the simplest execution domain. Digital HQ provides:
- Identity validation (user must be authenticated)
- Global policy inheritance (security, retention)
- Resource allocation (minimal tier)
- Audit trail aggregation (personal logs feed into global audit)

The Personal Workspace does not participate in cross-workspace governance flows.

---

## Overrides from Generic Template

| Aspect                    | Generic Default           | Personal Override                     |
|---------------------------|---------------------------|---------------------------------------|
| Scope Anchor              | Unspecified               | Identity (single user)                |
| Identity Model            | Multi-user capable        | Single-user only                      |
| Default Modules           | overview, settings        | tasks, notes, ai-chat, knowledge, reporting |
| Resource Tier             | standard                  | minimal                               |
| Governance Intensity      | Standard                  | Low (no approval gates)               |
| Audit Level               | standard                  | minimal                               |
| Max Concurrent Agents     | 3                         | 1                                     |
| Module Approval Required  | false                     | false                                 |
| Export Approval Required  | false                     | false                                 |
| Ownership Model           | Configurable              | Single-owner, non-transferable        |
