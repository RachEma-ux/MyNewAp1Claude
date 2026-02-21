# Agent Control Plane - Full Implementation To-Do

Based on comprehensive specification files (pasted_content.txt, EndgameSpec)

## Phase 0: Project Setup and Boundaries

- [ ] Create feature package: `features/agents-create/`
- [ ] Define "wizard is a compiler" rule in docs
- [ ] Decide source of truth for agent config storage (DB only vs Git-backed)
- [ ] Establish environments: sandbox and production (governed)
- [ ] Add feature flags:
  - [ ] `promotions.enabled`
  - [ ] `approvals.enabled`
  - [ ] `policy.simulation.enabled`
  - [ ] `exceptions.enabled`
  - [ ] `workflow.integration.enabled`

## Phase 1: Canonical Schema and Types

- [ ] Finalize canonical Agent schema (Zod for TS/backend)
- [ ] Add enums:
  - [ ] origin types (template, scratch, clone, workflow, conversation, event, import)
  - [ ] lifecycle states (draft, sandbox, governed, disabled)
  - [ ] trigger types (manual, workflow, event, schedule, none)
  - [ ] diff modes (structured, side-by-side)
  - [ ] policy impact statuses (allow, warn, deny, locked, mutated)
- [ ] Implement versioning:
  - [ ] `lifecycle.version` increments on fork/promote
  - [ ] Store `policy_digest` and `policy_set_hash` per validation/promotion/run
- [ ] Generate typed clients (OpenAPI → TS client for frontend)

## Phase 2: Backend Endpoints (MVP → Full)

### Agents
- [ ] POST `/agents/draft` (create/update draft)
- [ ] POST `/agents/validate` (schema + policy admission)
- [ ] GET `/agents/{id}` (load for resume)
- [ ] POST `/agents/{id}/sandbox` (transition draft→sandbox)
- [ ] POST `/agents/{id}/fork` (governed→draft)
- [ ] POST `/agents/{id}/promote` (direct promote if approvals disabled)
- [ ] POST `/agents/{id}/disable`
- [ ] GET `/agents/{id}/actions` (for workflow builder)

### Diff
- [ ] POST `/agents/diff` (structured + side-by-side output)
- [ ] Compute `diff_hash`
- [ ] Include locked/enforced items + policy notes

### Promotions (approvals on)
- [ ] POST `/promotions/requests`
- [ ] GET `/promotions/requests` (filters: pending, approver_id, agent_id)
- [ ] GET `/promotions/requests/{id}`
- [ ] POST `/promotions/requests/{id}/approve`
- [ ] POST `/promotions/requests/{id}/reject`
- [ ] POST `/promotions/requests/{id}/execute`
- [ ] GET `/promotions/requests/{id}/events` (timeline feed)

### Automation Integration
- [ ] POST `/automation/bindings/validate`
- [ ] POST `/automation/bindings`

### Policy Management (Battle-Ready)
- [ ] GET `/policies/status`
- [ ] POST `/policies/reload` (digest pinned + canary)
- [ ] GET `/policies/reload/{reload_id}`
- [ ] POST `/policies/impact`
- [ ] POST `/policies/impact/subscribe`
- [ ] POST `/policies/simulate`
- [ ] POST `/policies/chaos` (non-prod)

### Exceptions
- [ ] POST `/policies/exceptions`
- [ ] POST `/policies/exceptions/{id}/approve|reject|revoke`
- [ ] GET `/policies/exceptions?agent_id=...`
- [ ] GET `/policies/exceptions/burndown`

### Incidents (Promotion Freeze)
- [ ] GET `/incidents/active`
- [ ] Enforce freeze in promote/execute flows

## Phase 3: Policy Engine Integration (OPA) + Hooks

- [ ] Define policy input context object (hook, actor, environment, agent, request, change)
- [ ] Implement hook points:
  - [ ] `on_field_change` (optional optimization)
  - [ ] `on_review_open`
  - [ ] `on_create_attempt`
  - [ ] `on_promotion_attempt`
  - [ ] `before_execute`
  - [ ] `after_execute`
  - [ ] `on_policy_update` (batch scan)
- [ ] Normalize policy decisions:
  - [ ] `allow|warn|deny`
  - [ ] `violations[]`, `warnings[]`
  - [ ] `locked_fields[]`
  - [ ] `mutations[]`
  - [ ] runbook links
- [ ] Add `policy_set_hash` computation

## Phase 4: OPA Bundle + Cosign (Tamper-Proof Delivery)

- [ ] Create policy repo layout:
  - [ ] `policy/bundle/policies/*.rego`
  - [ ] `policy/bundle/data/*.json` (allowlists, quotas, tool maps)
  - [ ] `policy/bundle/tests/*_test.rego`
  - [ ] `policy/bundle/manifest.json`
- [ ] Write 10 baseline policies
- [ ] Write table-driven tests for each policy
- [ ] CI pipeline:
  - [ ] Format check
  - [ ] `opa test`
  - [ ] Build bundle `.tar.gz`
  - [ ] Publish as OCI artifact
  - [ ] `cosign sign` by digest (keyless)
  - [ ] Emit digest to deployment
- [ ] Orchestrator verification:
  - [ ] Require digest-pinned reference
  - [ ] Verify digest matches
  - [ ] `cosign verify` (issuer/subject constraints)
  - [ ] Canary validation step
  - [ ] Rollback to previous digest on failure

## Phase 5: Wizard UX Architecture (Frontend)

### Shell + Routing
- [ ] Add Agents → Create landing hub with paths:
  - [ ] Template
  - [ ] Scratch
  - [ ] Clone
  - [ ] From Workflow
  - [ ] From Conversation
  - [ ] From Event Trigger
  - [ ] Import Spec
- [ ] Implement wizard as route group: `/agents/create/:mode/:draftId?`
- [ ] Persist draft on every step (autosave debounce)
- [ ] Resume incomplete drafts

### Stepper Framework
- [ ] Build shared `<WizardShell>` with:
  - [ ] Stepper component
  - [ ] Back/Next navigation
  - [ ] Save status indicator (synced/dirty/error)
  - [ ] Policy banners (warn/deny)
- [ ] Standardize step contracts:
  - [ ] `getPartialAgent()`
  - [ ] `validateLocal()`
  - [ ] `applyMutations()`
  - [ ] `computeChangeSet()`

## Phase 6: Wizard Steps Per Creation Path

### Shared Steps Library
- [ ] Step: Identity (name/description/tags)
- [ ] Step: Role (type + summary)
- [ ] Step: LLM (provider/model/runtime)
- [ ] Step: Capabilities (tools/actions)
- [ ] Step: Memory (mode/scope)
- [ ] Step: Triggers (workflow/event/none)
- [ ] Step: Limits (rate/cost/execution)
- [ ] Step: Policies (baseline/overrides read-only)
- [ ] Step: Review & Diff (mandatory)
- [ ] Step: Create/Admit (draft→sandbox)

### Mode: Template
- [ ] Template picker (search)
- [ ] Pre-fill canonical agent fields
- [ ] Lock baseline policies + required limits

### Mode: Scratch
- [ ] Full manual config
- [ ] Enforce guardrails via policy validation

### Mode: Clone
- [ ] Agent selector
- [ ] Clone scope controls (tools/policies/limits)
- [ ] Fork and rename

### Mode: From Workflow
- [ ] Workflow selector
- [ ] Action mapping UI (workflow step → agent action)
- [ ] Auto-tools derived
- [ ] Trigger config optional (test mode first)

### Mode: From Conversation
- [ ] Conversation selector
- [ ] Intent extraction preview
- [ ] "What to automate?" scoping step
- [ ] Tool suggestions + strict allowlist

### Mode: From Event Trigger
- [ ] Event source picker
- [ ] Conditions builder
- [ ] Rate limits + dedupe + retries mandatory

### Mode: Import Spec
- [ ] Paste/upload JSON/YAML
- [ ] Validate schema
- [ ] Show locks/enforcements
- [ ] Optional "fork to edit" behavior

## Phase 7: Policy Enforcement Inside Wizard

- [ ] Call `/agents/validate`:
  - [ ] On step exit
  - [ ] On review open
  - [ ] On create attempt
- [ ] Render policy outcomes:
  - [ ] `denied` → block Next with reason + runbook
  - [ ] `warned` → allow Next with acknowledge checkbox
  - [ ] `locked fields` → disable controls + tooltip reason
  - [ ] `mutations` → apply and show toast
- [ ] Add "Why is this locked?" UI pattern

## Phase 8: Review & Diff (User Choice + Scalable)

- [ ] Implement diff request (call `/agents/diff`)
- [ ] Store `diff_hash`
- [ ] Build `DiffViewer` component:
  - [ ] Mode toggle (Structured / Side-by-side)
  - [ ] Search + filters (section/type/locked)
  - [ ] Virtualization for 10k rows (tanstack react-virtual)
  - [ ] Expandable JSON value cells
  - [ ] Show policy notes + runbook links inline
- [ ] Enforce "diff must be viewed":
  - [ ] Require scroll-to-end OR explicit checkbox
  - [ ] Capture acknowledgement in audit payload

## Phase 9: Create → Sandbox Admission Flow

- [ ] On final submit:
  - [ ] POST `/agents/validate` with `hook=on_create_attempt`
  - [ ] If pass → POST `/agents/{id}/sandbox`
- [ ] After sandbox admission:
  - [ ] Show "Run Test" CTA
  - [ ] Enable triggers only in test mode (throttled)
  - [ ] Create initial runbook links + observability pointers

## Phase 10: Promotion Request Workflow (Approvals On)

- [ ] Create promotion request UI
- [ ] Show diff in request
- [ ] Approver selector
- [ ] SLA timer
- [ ] Approval/rejection with comments
- [ ] Execute promotion after approval
- [ ] Timeline feed

## Phase 11: Incident Freeze

- [ ] Incident model (active incidents)
- [ ] Block promotions during freeze
- [ ] Show freeze banner
- [ ] Scope freeze by environment

## Phase 12: Policy Hot-Reload (Digest-Pinned)

- [ ] Reload endpoint with digest pinning
- [ ] Canary validation
- [ ] Rollback on failure
- [ ] Impact report generation
- [ ] Webhook subscriptions for impact

## Phase 13: Policy Drift Detection

- [ ] Compute environment snapshots every 10 minutes
- [ ] Compare dimensions:
  - [ ] `policy_bundle_digest`
  - [ ] `policy_set_hash`
  - [ ] `allowlist_hash`
  - [ ] `exceptions_hash`
  - [ ] `enforcement_mode_hash`
- [ ] Dashboard banner for drift
- [ ] Environment selector badge
- [ ] Block promotions if drifted
- [ ] Operator actions:
  - [ ] Align environments
  - [ ] Acknowledge drift (audited)
  - [ ] Generate remediation PRs

## Phase 14: Policy Exceptions

- [ ] Exception request model
- [ ] Time-bound exceptions
- [ ] Approval workflow for exceptions
- [ ] Expiry enforcement
- [ ] Burn-down dashboard
- [ ] Auto-revoke on expiry

## Phase 15: Autonomous Remediation Agents

- [ ] Configuration remediator (missing rate limits, unsafe defaults)
- [ ] Cost guard (cost cap breaches, excessive retries)
- [ ] Compliance prep (missing audit flags, metadata)
- [ ] Execution model:
  - [ ] `propose` mode (create PR)
  - [ ] `apply` mode (auto-fix with bounds)
- [ ] Guardrails:
  - [ ] Policy hook: `on_remediation_attempt`
  - [ ] Blast radius limits (10 agents/hour, 20 PRs/hour, 5 auto-applies/hour)
  - [ ] Environment scope check
- [ ] Timeline events + rollback support

## Phase 16: Compliance Attestation Export

- [ ] Attestation model (SOC2, ISO27001)
- [ ] Include artifacts:
  - [ ] Active policy digests + signatures
  - [ ] Promotion approvals + diffs
  - [ ] Exception list + expiry
  - [ ] Incident freeze history
  - [ ] Proofs of enforcement (hashes + timestamps)
- [ ] Export formats: PDF, JSON
- [ ] Attestation history

## Phase 17: Policy Chaos Testing

- [ ] Chaos scenarios:
  - [ ] Conflict injection
  - [ ] Load simulation (thousands of agents)
  - [ ] Exception expiry storm
  - [ ] Partial reload failure
- [ ] Endpoint: POST `/policies/chaos`
- [ ] CI integration (run in nonprod only)
- [ ] Block policy promotion if chaos tests fail
- [ ] Artifacts: logs, metrics, replay inputs

## Phase 18: Testing Suite

### Unit Tests
- [ ] Canonical Agent schema validation
- [ ] Draft partial schema rules
- [ ] Governed immutability
- [ ] Version increment on fork/promote
- [ ] Stable hashing (diff / policy set)
- [ ] Diff correctness (type/source/locks)
- [ ] Diff determinism
- [ ] Rego policy unit tests (all policies)

### Integration Tests
- [ ] Create draft endpoint
- [ ] Draft autosave idempotency
- [ ] Validation allow/warn/deny
- [ ] Locked fields & mutations
- [ ] Sandbox admission
- [ ] Fork governed agent
- [ ] Runtime execution policy enforcement
- [ ] Policy bundle integrity
- [ ] Reject unpinned policy reload
- [ ] Reject bad signature
- [ ] Canary rollback on reload failure
- [ ] Bulk policy impact report
- [ ] Impact subscription webhook
- [ ] Promotion request lifecycle
- [ ] Promotion staleness detection
- [ ] Approval SLA escalation
- [ ] Incident freeze blocks promotion
- [ ] Policy exception lifecycle
- [ ] Exception expiry enforcement
- [ ] Remediation PR generation
- [ ] Autonomous remediation (guarded)
- [ ] Policy simulation (no side effects)
- [ ] Drift detection across envs
- [ ] Compliance attestation export

### E2E Tests
- [ ] Wizard create → sandbox
- [ ] Wizard policy lock/mutation UX
- [ ] Diff viewer virtualization
- [ ] Workflow builder blocked/impacted UX

### Performance Tests
- [ ] Diff scale (10k rows)

### Chaos Tests
- [ ] Reload failure
- [ ] Exception expiry storm
- [ ] Conflict injection
- [ ] Load simulation

## Phase 19: Documentation

- [ ] Runbooks for incidents
- [ ] Policy authoring guide
- [ ] Remediation procedures
- [ ] Compliance export guide
- [ ] Chaos testing guide

## Phase 20: Final Integration

- [ ] End-to-end flow testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] Save final checkpoint
