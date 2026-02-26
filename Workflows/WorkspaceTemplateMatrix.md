# Workspace Template Matrix

Comparative overview of all workspace templates in the Digital HQ model.

All specialized templates inherit from the **Generic Workspace Template** (canonical parent blueprint). They share the same five structural layers (Identity, Tools, Data, Policy, Resources) and override only their configuration.

---

## Template Comparison

| Dimension                  | Generic (Canonical)        | Personal                    | Project                      | Research                       |
|---------------------------|----------------------------|-----------------------------|------------------------------|--------------------------------|
| **Template Type**          | Parent blueprint           | Specialized                 | Specialized                  | Specialized                    |
| **Context**                | Universal structure        | Individual productivity     | Team delivery                | Data-intensive analysis        |
| **Primary Scope Anchor**   | Unspecified                | Identity (single user)      | Objective (deliverable)      | Capability (workflow type)     |
| **Identity Model**         | Multi-user capable         | Single-user only            | Multi-user with roles        | Multi-user, rotating membership|
| **Ownership**              | Configurable               | Single-owner, non-transferable | Single-owner + delegated leads | Org-unit ownership          |
| **Roles**                  | Configurable               | Owner                       | Owner, Lead, Member, Viewer, Stakeholder | Lead Researcher, Researcher, Analyst, Reviewer |
| **Resource Tier**          | `standard`                 | `minimal`                   | `elevated`                   | `premium`                      |
| **Compute Units**          | 100                        | 50                          | 500                          | 1000                           |
| **Storage Quota**          | 10 GB                      | 2 GB                        | 50 GB                        | 200 GB                         |
| **Model Access**           | Default                    | Default                     | Default + Advanced           | Default + Advanced + Premium   |
| **API Rate Limit**         | 60 req/min                 | 30 req/min                  | 120 req/min                  | 240 req/min                    |
| **Budget Cap**             | $50/mo                     | $10/mo                      | $200/mo                      | $500/mo                        |
| **Governance Intensity**   | Standard                   | Low                         | High                         | High (targeted)                |
| **Audit Level**            | `standard`                 | `minimal`                   | `full`                       | `full` (with provenance)       |
| **Approval for Module Toggle** | No                    | No                          | Yes (lead authority)         | Yes (lead authority)           |
| **Approval for Export**    | No                         | No                          | Yes (owner/lead)             | Yes (mandatory, multi-party)   |
| **Max Concurrent Agents**  | 3                          | 1                           | 5                            | 8                              |
| **Ethical Review**         | No                         | No                          | No                           | Yes                            |
| **Experiment Provenance**  | No                         | No                          | No                           | Yes                            |

---

## Default Modules by Template

| Module Key       | Generic | Personal | Project | Research |
|------------------|---------|----------|---------|----------|
| `overview`       | On      | On       | On      | On       |
| `settings`       | On      | On       | On      | On       |
| `tasks`          | -       | On       | -       | -        |
| `notes`          | -       | On       | -       | -        |
| `ai-chat`        | -       | On       | -       | -        |
| `pmt`            | -       | -        | On      | -        |
| `datasets`       | -       | -        | -       | On       |
| `experiments`    | -       | -        | -       | On       |
| `analysis`       | -       | -        | -       | On       |
| `knowledge`      | -       | On       | On      | On       |
| `agents`         | -       | -        | On      | -        |
| `collaboration`  | -       | -        | On      | Off      |
| `reporting`      | -       | On       | On      | On       |
| `automation`     | -       | Off      | Off     | Off      |
| `models`         | -       | -        | -       | Off      |
| `deployments`    | -       | -        | Off     | -        |
| `calendar`       | -       | Off      | -       | -        |

**Legend**: On = enabled by default, Off = available but disabled by default, `-` = not applicable to this template

---

## Structural Layers

All templates implement the same five structural layers:

| Layer              | Generic Contract                          |
|--------------------|-------------------------------------------|
| Identity Boundary  | Who operates within the workspace         |
| Tool Stack         | What capabilities are available           |
| Data Access Layer  | What data is visible and mutable          |
| Policy Layer       | What rules apply                          |
| Resource Allocation| What capacity is assigned                 |

---

## Route Patterns

| Template   | Route Prefix   | Status Bar ID | Title Bar Icon |
|------------|----------------|---------------|----------------|
| Generic    | `/w`           | `WS-{id}`     | (none)         |
| Personal   | `/personal`    | `PS-{id}`     | User           |
| Project    | `/project`     | `PJ-{id}`     | Target         |
| Research   | `/research`    | `RS-{id}`     | Microscope     |

---

## Digital HQ Relationship

```
Digital HQ (Control Plane)
├── Governance Engine        → Policies inherited by all workspaces
├── Resource Allocation Mgr  → Enforces tier limits per workspace
├── Identity Authority       → Validates all workspace members
└── Workspace Registry       → Manages lifecycle of all instances
    │
    ├── Generic Template (contract) ─── defines structural requirements
    │   ├── Personal Template ────────── identity-anchored, minimal resources
    │   ├── Project Template ─────────── objective-anchored, elevated resources
    │   └── Research Template ────────── capability-anchored, premium resources
    │
    └── Workspace Instances ──────────── runtime objects from templates
```

---

## File Map

```
Template/Shell/
├── 00-Generic/
│   ├── GenericWorkspace.md                    ← Canonical documentation
│   ├── GenericWorkspaceShellTemplate.tsx       ← Frontend shell blueprint
│   └── generic-workspace-backend-template.ts  ← Backend scaffold blueprint
├── 01-Personal/
│   ├── PersonalWorkspace.md                   ← Personal workspace docs
│   ├── PersonalWorkspaceShellTemplate.tsx      ← Personal frontend shell
│   └── personal-workspace-backend-template.ts ← Personal backend scaffold
├── 02-Project/
│   ├── ProjectWorkspace.md                    ← Project workspace docs
│   ├── ProjectWorkspaceShellTemplate.tsx       ← Project frontend shell
│   └── project-workspace-backend-template.ts  ← Project backend scaffold
├── 03-Research/
│   ├── ResearchWorkspace.md                   ← Research workspace docs
│   ├── ResearchWorkspaceShellTemplate.tsx      ← Research frontend shell
│   └── research-workspace-backend-template.ts ← Research backend scaffold
└── WorkspaceTemplateMatrix.md                 ← THIS FILE
```
