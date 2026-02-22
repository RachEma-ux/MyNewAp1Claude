# Governance Bible

**MyNewAppV1 — LLM Control Plane**
**Version:** 1.0
**Last Updated:** February 22, 2026

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Platform Architecture](#2-platform-architecture)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [Candidate Pipeline — Catalog Onboarding](#4-candidate-pipeline--catalog-onboarding)
5. [Agent Governance](#5-agent-governance)
6. [Policy Management](#6-policy-management)
7. [Drift Detection & Remediation](#7-drift-detection--remediation)
8. [Compliance & Audit](#8-compliance--audit)
9. [Security Controls](#9-security-controls)
10. [Secret Management & Key Rotation](#10-secret-management--key-rotation)
11. [Workflow Automation Governance](#11-workflow-automation-governance)
12. [Catalog Import & Discovery Governance](#12-catalog-import--discovery-governance)
13. [Monitoring & Observability](#13-monitoring--observability)
14. [Backup & Disaster Recovery](#14-backup--disaster-recovery)
15. [Environment Profiles & Deployment](#15-environment-profiles--deployment)
16. [Admin Best Practices](#16-admin-best-practices)
17. [Glossary](#17-glossary)

---

## 1. Introduction

### Purpose

This document is the single source of truth for all governance, security, compliance, and best-practices rules governing the MyNewAppV1 LLM Control Plane. It covers every aspect of the platform that an Admin, Security Officer, or Compliance Auditor needs to understand.

### Scope

- Catalog onboarding and candidate pipeline
- Agent lifecycle management and governance
- Policy enforcement (rule-based and OPA)
- Security controls (authentication, encryption, SSRF protection)
- Audit logging and compliance export
- Workflow automation governance
- Secret management and key rotation
- Monitoring, observability, and backup

### Audience

- **Platform Admins** — daily operations, approvals, pipeline management
- **Security Officers** — security controls, encryption, access review
- **Compliance Auditors** — audit trails, compliance reports, attestations
- **Developers** — architecture understanding, integration patterns

---

## 2. Platform Architecture

### Layer Architecture

```
┌─────────────────────────────────────────────────┐
│  Presentation Layer   (client/src/)             │
│  React 19, Vite, Tailwind, wouter routing       │
├─────────────────────────────────────────────────┤
│  API Layer            (server/routers.ts)        │
│  tRPC 11 routers, Express middleware            │
├─────────────────────────────────────────────────┤
│  Governance Layer     (server/services/)         │
│  Policy evaluation, audit logging, feature flags│
├─────────────────────────────────────────────────┤
│  Domain Layer         (server/<domain>/)         │
│  Business logic per domain (agents, chat, etc.) │
├─────────────────────────────────────────────────┤
│  Persistence Layer    (drizzle/, server/db.ts)   │
│  Drizzle ORM, PostgreSQL, migrations           │
├─────────────────────────────────────────────────┤
│  Infrastructure Layer (server/_core/)            │
│  Env config, auth context, encryption, SDK      │
└─────────────────────────────────────────────────┘
```

### Dependency Rules

**Allowed direction:** Presentation → API → Governance → Domain → Persistence → Infrastructure

**Violations to avoid:**
- UI must NOT import persistence logic directly
- Domain logic must NOT import UI components
- Governance layer must NOT directly mutate DB (goes through domain)

### Key Technology Stack

| Component | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, wouter |
| API | tRPC 11, Express 4, Zod validation |
| Database | PostgreSQL, Drizzle ORM |
| Auth | OAuth 2.0, JWT sessions |
| Encryption | AES-256 (provider secrets) |
| Policy Engine | Rule-based scoring (MVP), OPA/Rego (production) |

---

## 3. Authentication & Authorization

### Authentication Model

Three states determine authentication behavior:

| State | Condition | Behavior |
|---|---|---|
| **DEV_MODE** | `DEV_MODE=true` + `NODE_ENV≠production` | Auto-authenticates as dev user. Blocked in production. |
| **OAuth** | `VITE_APP_ID` + `OAUTH_SERVER_URL` configured | Real authentication via OAuth provider |
| **Unconfigured** | Neither set | Only `publicProcedure` endpoints work |

### Authorization Levels

Three tRPC procedure levels enforce access control:

| Level | Who Can Access | Use Case |
|---|---|---|
| `publicProcedure` | Anyone | Health checks, public data |
| `protectedProcedure` | Authenticated users | Read ops, authoring ops |
| `adminProcedure` | Admin role only | Approve, publish, activate, reject, delete |

### Startup Validation Guards

| Condition | Result |
|---|---|
| `NODE_ENV=production` + `DEV_MODE=true` | Fatal error — process exits |
| `NODE_ENV=production` + no `ENCRYPTION_KEY` | Fatal error — process exits |
| `NODE_ENV=production` + no `REDIS_URL` | Warning — falls back to in-memory rate limiting |

### Authorization Rules by Domain

| Operation | Required Level | Notes |
|---|---|---|
| List catalog entries | `protectedProcedure` | Any authenticated user |
| Create catalog entry | `protectedProcedure` | Entry starts as draft |
| Approve/Reject entry | `adminProcedure` | Admin only |
| Activate entry | `adminProcedure` | Requires `reviewState = "approved"` |
| Publish entry | `adminProcedure` | Requires active + approved |
| Promote agent | `adminProcedure` | OPA evaluation required |
| Hot reload policy | `adminProcedure` | Triggers agent revalidation |
| Manage secrets | `protectedProcedure` | Encrypted at rest |

---

## 4. Candidate Pipeline — Catalog Onboarding

### Overview

The Candidate Pipeline is a structured 4-stage approval workflow through which all new entries (providers, models, agents, etc.) are onboarded into the platform. **Nothing enters the Catalog directly** — every entry must pass through the full pipeline.

### Pipeline Stages

```
Import/Create → Submit (tag: "candidate") → Register → Validate → Publish → Catalog
```

| Stage | Tag | Location | Action | Who |
|---|---|---|---|---|
| **Submit** | `candidate` | Import Wizard | Discover & submit provider | Any user |
| **Register** | `registered` | Candidate → Register tab | Admin reviews and registers | Admin |
| **Validate** | `validated` | Candidate → Validate tab | Admin verifies and validates | Admin |
| **Publish** | `published` | Candidate → Publish tab | Admin publishes to Catalog | Admin |

### Detailed Stage Descriptions

#### Stage 1: Submit

**Who:** Any authenticated user
**Where:** LLM → Manage Catalogue → `+ New Entry` → Import → API Discovery
**What happens:**
- User enters a provider URL (e.g., `ai21.com`)
- System probes the URL for API endpoints, models, capabilities
- User clicks **Submit**
- Entry is created with:
  - Tag: `"candidate"`
  - Origin: `"discovery"`
  - Review State: `"needs_review"`
  - Status: `"draft"`
- Entry appears in the **Register tab** of the Candidate page

#### Stage 2: Register (Admin Task)

**Who:** Admin only
**Where:** Candidate → Register tab
**Admin review checklist:**
- Verify entry name and display name are correct
- Review description for accuracy
- Check entry type (provider, model, agent, etc.)
- Verify origin and source URL
- Double-tap name to open full edit card if modifications needed

**Action:** Click **Register**
**What happens:**
- Tag changes from `"candidate"` to `"registered"`
- Entry is approved (`reviewState` → `"approved"`)
- Register button replaced by green "Registered" badge
- Entry appears in the **Validate tab**
- Original entry stays in Register tab as history

#### Stage 3: Validate (Admin Task)

**Who:** Admin only
**Where:** Candidate → Validate tab
**Admin review checklist:**
- Verify configuration is complete
- Check classification and tags
- Confirm readiness for publication

**Action:** Click **Validate**
**What happens:**
- Tag changes from `"registered"` to `"validated"`
- Validate button replaced by green "Validated" badge
- Entry appears in the **Publish tab**
- Original entry stays in Validate tab as history

#### Stage 4: Publish (Admin Task)

**Who:** Admin only
**Where:** Candidate → Publish tab
**Admin review checklist:**
- Final review before going live
- Confirm entry should be available to all platform users

**Action:** Click **Publish**
**What happens:**
- Tag changes from `"validated"` to `"published"`
- Entry is activated (`status` → `"active"`)
- Publish button replaced by green "Published" badge
- Entry appears in **Manage Catalogue → Catalog tab**
- Entry is now available for use across the platform

### History & Audit Trail

Each tab shows **current entries + all entries that have already progressed past that stage**. Progressed entries display a status badge instead of an action button. This gives Admin full visibility of what passed through each stage and when.

### Pipeline Rules

1. **No bypass** — entries cannot skip stages
2. **No direct catalog entry** — the Catalog tab's only source is published entries from the Candidate pipeline
3. **Tag-based tracking** — pipeline stage is tracked via entry tags (`candidate` → `registered` → `validated` → `published`)
4. **Admin approval required** — each stage requires explicit Admin action
5. **Traceability** — entry config stores `sourceEntryId` and `pipelineStage` for audit trail

---

## 5. Agent Governance

### Agent Lifecycle

Agents follow a three-state lifecycle:

```
Draft → Sandbox → Governed
```

| State | Description | Capabilities |
|---|---|---|
| **Draft** | Partial spec, autosaved, no execution | Editing only |
| **Sandbox** | Full testing environment, isolated | Testing, no production access |
| **Governed** | Production-ready with cryptographic proofs | Full execution |

### Governance Status

| Status | Meaning |
|---|---|
| `SANDBOX` | Testing mode, no policy enforcement |
| `GOVERNED_VALID` | Compliant with current policy |
| `GOVERNED_RESTRICTED` | Policy violation, limited functionality |
| `GOVERNED_INVALIDATED` | Critical drift, execution blocked |

### Agent Creation (7 Modes)

1. **From Template** — deploy pre-built agents (Research Assistant, Code Helper, etc.)
2. **From Scratch** — manual configuration with full control
3. **Clone Existing** — fork an existing agent
4. **From Workflow** — automation-first approach
5. **From Conversation** — intent extraction from chat
6. **From Event Trigger** — event-driven agents
7. **Import Spec** — upload JSON/YAML agent definitions

Each mode opens the **WizardShell** with 6 steps:
Identity → Role → LLM → Capabilities → Limits → Review

### Promotion Workflow

**Path:** Agents → Approvals

1. User requests promotion from sandbox to governed status
2. System evaluates agent against active policy (OPA/rule-based)
3. If compliant:
   - Spec is signed (HMAC-SHA256)
   - Proof bundle generated and stored
   - Agent status → `GOVERNED_VALID`
4. If non-compliant:
   - Denial reasons returned to UI
   - Agent remains in sandbox
5. 24-hour SLA for approval decisions
6. Multi-approver support with comment threads
7. Incident freeze mechanism blocks promotions during outages

### Admission Control (7 Checks)

When a governed agent is started, the Interceptor Chain runs 7 sequential checks (fail-closed — any deny blocks execution):

| # | Check | What It Validates |
|---|---|---|
| 1 | Sandbox Expiry | Sandbox agent hasn't expired |
| 2 | Sandbox Containment | No `external_calls` or `persistent_writes` |
| 3 | Proof Presence | Governed agent has proof bundle |
| 4 | Spec Hash Verification | Spec hasn't been tampered after signing |
| 5 | Policy Hash Binding | Policy hasn't changed since promotion |
| 6 | Signer Revocation | Signing authority isn't revoked |
| 7 | Signature Verification | HMAC-SHA256 signature is valid |

### Admission Control Error Codes

| Code | Reason | Severity |
|---|---|---|
| `SANDBOX_EXPIRED` | Sandbox agent has expired | DENY |
| `CONTAINMENT_VIOLATION` | Sandbox has external_calls or persistent_writes | DENY |
| `PROOF_MISSING` | Governed agent missing proof bundle | DENY |
| `SPEC_HASH_MISMATCH` | Spec tampered after signing | DENY |
| `POLICY_HASH_MISMATCH` | Policy changed since promotion | RESTRICT |
| `SIGNER_REVOKED` | Signing authority is revoked | DENY |
| `SIGNATURE_INVALID` | HMAC signature verification failed | DENY |
| `INTERCEPTOR_ERROR` | Interceptor chain execution error | DENY |

### Cryptographic Proofs

Every governed agent has a proof bundle:

```json
{
  "specHash": "sha256:abc123...",
  "policyHash": "sha256:def456...",
  "signature": "HMAC-SHA256 signature...",
  "timestamp": "2026-01-03T12:00:00Z"
}
```

Hash computation uses canonical JSON (sorted keys) with SHA-256.

---

## 6. Policy Management

### Policy Engine

The platform supports two policy evaluation modes:

| Mode | Engine | Use Case |
|---|---|---|
| **MVP (Current)** | Rule-based scoring | Development, simple policies |
| **Production** | Open Policy Agent (OPA) + Rego | Enterprise, complex policies |

### Policy Gate

**File:** `server/services/policyGate.ts`

Centralized `evaluatePolicy()` function for sensitive operations:
- **Production mode:** Fail-closed (deny if rules unavailable)
- **Development mode:** Configurable fail-open with logging

### Policy Rules (6 Built-in)

| Rule | What It Checks |
|---|---|
| `user_is_admin` | Actor must be admin |
| `anatomy_complete` | Minimum Viable Agent (MVA) validation |
| `sandbox_contained` | No external calls / persistent writes |
| `capabilities_valid` | Capabilities in whitelist |
| `temp_ok` | Temperature within role-based limits |
| `budget_ok` | Monthly budget within org limit |

### Promotion Policy Deny Codes

| Code | Reason |
|---|---|
| `PERMISSION_DENIED` | Actor not admin |
| `ANATOMY_INCOMPLETE` | Agent anatomy missing required fields |
| `CONTAINMENT_VIOLATION` | Sandbox not contained |
| `INVALID_CAPABILITIES` | Capabilities not in whitelist |
| `TEMPERATURE_VIOLATION` | Temperature exceeds role limit |
| `BUDGET_EXCEEDED` | Monthly budget exceeds org limit |

### OPA Policy Structure (Rego)

```rego
package agent_governance

# Main evaluation rule
evaluate[result] {
    result := {
        "allowed": is_compliant,
        "violations": get_violations,
        "score": calculate_score,
    }
}

# Compliance check
is_compliant {
    check_temperature
    check_capabilities
    check_document_access
    check_tool_access
}

# Default deny
default is_compliant = false
```

### Policy Hot Reload

1. Admin uploads new policy
2. System computes new policy hash
3. Policy stored in PolicyRegistry and persisted to DB
4. RevalidationWorkflow triggers:
   - All governed agents re-evaluated against new policy
   - Violating agents marked as `GOVERNED_INVALIDATED`
   - Invalidated agents quarantined (cannot start)
5. Invalidation events emitted and logged

### Policy Best Practices

1. **Keep policies simple** — start with basic rules, add complexity gradually
2. **Use descriptive names** — make rule names self-documenting
3. **Test thoroughly** — test policies against existing agents before deployment
4. **Version control** — track all policy changes in version control
5. **Document rules** — add comments explaining complex logic
6. **Gradual rollout** — test in staging before production
7. **Monitor violations** — track which agents fail policy checks
8. **Regular reviews** — review and update policies on a regular cadence

---

## 7. Drift Detection & Remediation

### Drift Detection

**Path:** Agents → Drift Detection
**Frequency:** Runs every 10 minutes

Detects three types of drift:

| Drift Type | What It Means | Severity |
|---|---|---|
| **Policy Change** | Agent no longer complies with updated policy | Variable |
| **Spec Tampering** | Hash mismatch — unauthorized spec modification | Critical |
| **Expired** | Agent past its expiry date | High |

### Drift Detection Dashboard

- Real-time drift summary (total, by type, by severity)
- 7-day trend chart (drifted vs compliant agents)
- Severity distribution bar chart
- One-click auto-remediation for safe violations

### Autonomous Remediation

**Path:** Drift Detection Dashboard → Auto-Remediate button

**Auto-remediation can fix:**
- Budget adjustments — reduce limits to comply with policy
- Capability removal — strip forbidden capabilities

**Auto-remediation is BLOCKED for:**
- Spec tampering (critical security violation — requires human investigation)
- Expiry (requires manual renewal)
- Critical policy violations (requires human review)

### Remediation Best Practices

1. Review auto-remediation logs regularly
2. Investigate repeated drift patterns
3. Update policies to prevent recurring violations
4. Escalate critical drift to security team immediately
5. Document all manual remediation actions

---

## 8. Compliance & Audit

### Audit System

Two audit loggers operate in the platform:

| Logger | File | Purpose |
|---|---|---|
| **Governance Logger** | `server/services/governanceLogger.ts` | Agent governance events (admission, promotion, policy reload) |
| **Audit Logger** | `server/services/auditLogger.ts` | General operations (provider, secret, policy, auth events) |

Both persist to `governance_audit_logs` table with structured envelope containing:
- Event type
- Actor (who performed the action)
- Timestamp
- Payload (structured details)
- Catalog entry ID (if applicable)

### Audit Event Types

| Category | Events |
|---|---|
| **Agent** | `agent.started`, `agent.stopped`, `agent.error`, `agent.status_changed` |
| **Policy** | `policy.updated`, `policy.reloaded` |
| **Governance** | `governance.violation`, `governance.approved` |
| **Catalog** | `catalog.entry.created`, `catalog.entry.updated`, `catalog.entry.approved`, `catalog.entry.rejected`, `catalog.entry.activated`, `catalog.entry.validated`, `catalog.entry.deleted` |
| **Publishing** | `catalog.entry.published`, `catalog.bundle.recalled` |

### Compliance Export

**Path:** Agents → Compliance Export

Generate attestation reports for:

| Framework | Focus |
|---|---|
| **SOC 2 Type II** | Trust Services Criteria |
| **ISO 27001** | Information Security Management |
| **HIPAA** | Healthcare data protection |
| **GDPR** | EU data privacy |

**Report contents:**
- Agent governance events (creation, promotion, deletion)
- Policy version history with change tracking
- Drift detection results and remediation actions
- Cryptographic proofs (spec hashes, policy hashes, signatures)
- Complete audit trail with actor attribution

**Export formats:** JSON (machine-readable), CSV (human-readable)

### Compliance Best Practices

1. Export reports monthly for audit trail
2. Store reports in immutable storage (S3 with versioning)
3. Include reports in compliance documentation
4. Review attestations before external audits
5. Maintain continuous compliance posture — don't wait for audit season

---

## 9. Security Controls

### SSRF Protection

**File:** `server/routers/ssrf-guard.ts`

All outbound requests are validated:
- DNS resolution check
- IP classification (blocks private/internal IPs)
- Redirect validation (prevents redirect-based SSRF)
- HTTPS enforced in production

### Rate Limiting

| Environment | Implementation |
|---|---|
| Development | In-memory rate limiting |
| Production | Redis-backed rate limiting (multi-instance safe) |

Specific limits:
- Discovery requests: 10 per minute per user
- Discovery cache: 60-second TTL per domain

### Encryption

| What | How |
|---|---|
| Provider secrets | AES-256 encryption via `ENCRYPTION_KEY` |
| Data in transit | TLS/SSL for all external communications |
| Database | Encryption at rest (PostgreSQL level) |
| Sensitive logs | Automatic data redaction |

### Input Validation

- **All tRPC inputs** validated with Zod schemas
- **No raw SQL** — all queries through Drizzle ORM (parameterized)
- **File uploads** validated for type and size
- **URLs** validated before outbound requests

### Security Principles

1. **Principle of Least Privilege** — agents get minimal capabilities needed
2. **Fail-Closed** — production policy gate denies if rules unavailable
3. **Defense in Depth** — multiple layers (auth, validation, encryption, audit)
4. **No Trust by Default** — server owns validation, client data never trusted
5. **Immutability** — published bundles are immutable snapshots

---

## 10. Secret Management & Key Rotation

### Architecture

```
Frontend (KeyRotationPage)
    ↓ tRPC Calls (Type-safe)
tRPC Router (keyRotation.ts)
    ↓ 4 Sub-routers, 20+ procedures
Backend Services (30+ DB operations)
    ↓ Zod validation, error handling
Database (6 tables, full audit trail)
```

### Key Rotation Features

- **Certificate management** — upload, track, renew TLS certificates
- **API key rotation** — rotate provider API keys with zero downtime
- **Automatic scheduling** — schedule key rotation on custom cadence
- **Audit trail** — every rotation event logged with actor attribution
- **Data redaction** — sensitive values automatically masked in logs and responses
- **Rollback** — ability to revert to previous key version

### Key Rotation Best Practices

1. Rotate API keys every 90 days minimum
2. Rotate immediately if a key is suspected compromised
3. Use automatic scheduling for routine rotations
4. Verify service connectivity after rotation
5. Monitor for authentication failures post-rotation
6. Keep at least one previous key version for rollback

---

## 11. Workflow Automation Governance

### Current Maturity

The Workflow Builder is in **MVP/Early Development** stage. While basic CRUD and UI work, critical governance gaps exist.

### Governance Status

| Check | Status |
|---|---|
| Data model versioning | Not implemented |
| Validation prevents invalid publish | Basic only (empty check) |
| Published versions immutable | Not implemented |
| Secrets handling | Relies on env vars |
| Permissions enforced | User ownership only |
| Run observability | In-memory only |

### Required Governance Controls (Roadmap)

1. **Schema versioning** — add `schemaVersion` field, implement migrations
2. **Validation system** — trigger existence, connectivity checks, cycle detection
3. **Publish/draft separation** — immutable published snapshots with rollback
4. **Permissions model** — who can edit, publish, execute workflows
5. **Audit logging** — log all create/edit/publish/execute/delete actions
6. **Dangerous node allowlist** — require approval for risky node types
7. **Execution persistence** — persist all run data to database (not just memory)

### Workflow Security Rules

1. Workflows must have at least one trigger node
2. No disconnected nodes allowed in published workflows
3. No cycles (infinite loops) in production workflows
4. Secrets must never be stored in workflow node config
5. All workflow executions must be logged with run ID and timestamps

---

## 12. Catalog Import & Discovery Governance

### Core Principles

1. **Discovery is separate from creation** — preview data is never directly persisted
2. **No auto-activation** — all imported entries are draft and require review
3. **Server owns validation** — client-side data is never trusted for final persistence
4. **Import sessions** — every preview is stored server-side in an auditable session
5. **Asynchronous processing** — long-running imports are queued
6. **Security by default** — input validation, domain allowlisting, rate limiting
7. **Partial success** — failures in bulk creation do not roll back successful entries

### Discovery Flow

```
User enters URL → Server probes URL → Results previewed → User submits
→ Entry created as draft with tag "candidate" → Enters pipeline
```

### Import Security Controls

| Control | Implementation |
|---|---|
| Rate limiting | 10 requests/minute per user |
| Response caching | 60-second TTL per domain |
| URL validation | SSRF guard validates all outbound requests |
| Input sanitization | Zod schemas on all inputs |
| Origin tracking | Every entry records its origin (`discovery`, `admin`, `api`) |

---

## 13. Monitoring & Observability

### Metrics Collected

- API response times
- Error rates by endpoint
- Agent status changes
- Policy evaluation results (pass/fail/score)
- Event processing times
- Drift detection results
- Promotion attempts and denials

### Governance-Specific Metrics

| Metric | Type |
|---|---|
| `agent_starts_allowed_total` | Counter |
| `agent_starts_denied_total` (by reason) | Counter |
| `agent_invalidation_events_total` | Counter |
| `policy_reload_success_total` | Counter |
| `policy_reload_failure_total` | Counter |
| `promotion_attempts_total` | Counter |
| `promotion_denies_total` | Counter |

### Logging

- Structured logging with context (actor, resource, action)
- Multiple log levels: `debug`, `info`, `warn`, `error`, `fatal`
- Sensitive data automatically masked in logs
- Log aggregation support

### Health Checks

| Endpoint | What It Checks |
|---|---|
| Application health | Server is running, DB connected |
| Orchestrator health | External orchestrator reachable |
| OPA health | Policy engine responsive |
| Database health | Connection pool healthy |

### Event System

Events flow through the platform providing real-time updates and audit trails:

| Event | When |
|---|---|
| `agent.started` | Agent started on orchestrator |
| `agent.stopped` | Agent stopped |
| `agent.error` | Agent encountered error |
| `agent.status_changed` | Agent status changed |
| `policy.updated` | Policy was updated |
| `policy.reloaded` | Policy was hot-reloaded |
| `governance.violation` | Agent failed policy check |
| `governance.approved` | Agent passed policy check |

---

## 14. Backup & Disaster Recovery

### Backup Features

- Create backups of agents, policies, and configurations
- Restore from backups with selective options
- Schedule automatic backups with retention policies
- Verify backup integrity before restoration

### Backup Best Practices

1. Schedule daily automated backups
2. Store backups in separate storage from production
3. Test restore procedures monthly
4. Keep at least 30 days of backup history
5. Encrypt backups at rest
6. Document and test disaster recovery runbooks

---

## 15. Environment Profiles & Deployment

### Environment Profiles

| Profile | `NODE_ENV` | Behavior |
|---|---|---|
| **Development** | `development` | Vite HMR, DEV_MODE allowed, HTTP allowed, fail-open policy |
| **Production** | `production` | Static serving, DEV_MODE blocked, HTTPS enforced, fail-closed policy |

### Critical Environment Variables

| Variable | Required In | Purpose |
|---|---|---|
| `DATABASE_URL` | All | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Production | AES-256 key for secret encryption |
| `REDIS_URL` | Production (recommended) | Rate limiting backend |
| `VITE_APP_ID` | Production | OAuth application ID |
| `OAUTH_SERVER_URL` | Production | OAuth authentication server |
| `JWT_SECRET` | Production | JWT token signing key |

### Production Deployment Checklist

- [ ] `NODE_ENV=production` set
- [ ] `DEV_MODE` is NOT set to `true`
- [ ] `ENCRYPTION_KEY` configured (AES-256)
- [ ] `DATABASE_URL` points to production database
- [ ] `REDIS_URL` configured for rate limiting
- [ ] OAuth configured (`VITE_APP_ID`, `OAUTH_SERVER_URL`)
- [ ] `JWT_SECRET` set to strong random value
- [ ] TLS/SSL certificate configured
- [ ] Database backups scheduled
- [ ] Monitoring alerts configured
- [ ] Audit log retention policy defined

---

## 16. Admin Best Practices

### Daily Operations

1. **Check Candidate Pipeline** — process new submissions in Register → Validate → Publish
2. **Review Drift Detection** — investigate any drifted agents
3. **Monitor Audit Logs** — look for anomalies or unauthorized actions
4. **Check System Health** — verify all services are healthy

### Security Hygiene

1. **Rotate API keys** every 90 days
2. **Review access** — audit who has admin privileges quarterly
3. **Update policies** — keep governance policies current with business requirements
4. **Patch promptly** — apply security updates without delay
5. **Test backups** — verify restore procedures monthly

### Agent Management

1. **Set expiry dates** for temporary agents
2. **Minimal capabilities** — principle of least privilege
3. **Document purpose** — describe expected behavior in agent spec
4. **Test in sandbox** thoroughly before promotion
5. **Review drift patterns** — investigate recurring violations

### Catalog Management

1. **Review all submissions** — never auto-approve
2. **Verify provider URLs** — ensure they point to legitimate services
3. **Check descriptions** — ensure accuracy before publishing
4. **Monitor published entries** — track usage and issues
5. **Recall if needed** — unpublish entries that become problematic

### Incident Response

1. **Activate incident freeze** — blocks promotions during outages
2. **Investigate immediately** — spec tampering is a critical security event
3. **Quarantine affected agents** — invalidate and stop compromised agents
4. **Document findings** — create incident report with timeline
5. **Update policies** — prevent recurrence through policy changes
6. **Export compliance report** — document the incident for audit trail

---

## 17. Glossary

| Term | Definition |
|---|---|
| **Admission Control** | The 7-check interceptor chain that validates agents before execution |
| **Candidate** | An entry submitted to the pipeline awaiting Admin registration |
| **Candidate Pipeline** | The 4-stage approval workflow for onboarding catalog entries |
| **Drift** | When a governed agent deviates from its approved state |
| **Fail-Closed** | Security posture where access is denied if rules are unavailable |
| **Governed Agent** | An agent that has passed promotion and has a valid proof bundle |
| **Hot Reload** | Updating policies without restarting the system |
| **Interceptor Chain** | Sequential security checks that run before agent execution |
| **MVA** | Minimum Viable Agent — the minimum spec required for promotion |
| **OPA** | Open Policy Agent — external policy evaluation engine |
| **Proof Bundle** | Cryptographic proof of an agent's spec integrity and policy compliance |
| **Published** | A catalog entry that has completed the full pipeline and is active |
| **Rego** | The policy language used by OPA |
| **Remediation** | Fixing a drifted agent to restore compliance |
| **Review State** | The approval status of a catalog entry (`needs_review`, `approved`, `rejected`) |
| **Sandbox** | Isolated testing environment for agents before production |
| **SSRF** | Server-Side Request Forgery — an attack where the server is tricked into making unintended requests |
| **Tag** | A label on a catalog entry indicating its pipeline stage (`candidate`, `registered`, `validated`, `published`) |
| **tRPC** | End-to-end type-safe RPC framework used for client-server communication |

---

**Document maintained by:** Platform Admin Team
**Review cadence:** Quarterly or after significant platform changes
