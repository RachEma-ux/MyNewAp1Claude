# Sandbox

## What Sandbox Is

Sandbox is a bounded exploration zone within Governance-Center where early-stage ideas, prototypes, and feasibility explorations can be documented and tracked before committing to full module governance.

## Why Sandbox Exists

The platform operates under a governance-first policy: no module code starts until governance documentation exists. Sandbox provides a structured exception so that progress does not freeze while governance documentation is being developed.

Sandbox allows teams to:
- Explore technical feasibility before writing a full governance packet
- Prototype domain models and API surfaces
- Validate assumptions before committing to a governed module
- Document open questions and design decisions as they emerge

## How Sandbox Differs from a Governed Module

| Aspect | Governed Module | Sandbox |
|---|---|---|
| Governance packet | Full (8 files) | Minimum (4 files) |
| Production deployment | Allowed | Not allowed |
| Sensitive data access | Governed | Not permitted by default |
| Import by governed code | Allowed | Not permitted |
| Rollback expectation | Managed migration | Easy removal |
| Review cadence | Per governance profile | Time-bounded exit criteria |

## Required Files in Each Sandbox

Every sandbox exploration must have these files in `Governance-Center/sandbox/<sandbox-name>/`:

1. `SANDBOX_GOVERNANCE_NOTE.md` — What is being explored, who owns it, what governance applies
2. `SANDBOX_LINKS.md` — Links to related governance docs, modules, discussions
3. `SANDBOX_OPEN_QUESTIONS.md` — Unresolved governance and design questions
4. `SANDBOX_EXIT_CRITERIA.md` — What must be true for this sandbox to promote or be retired

Copy templates from `Governance-Center/sandbox/_templates/`.

## How Promotion Works

1. The sandbox exploration reaches its exit criteria
2. The team creates a full module governance packet in `Governance-Center/modules/<module-name>/`
3. The governance packet is reviewed
4. The sandbox governance note is updated to record the promotion
5. The sandbox may then be archived or removed

Promotion without a full governance packet is not permitted. See [GOVERNANCE_FIRST_MODULE_AND_SANDBOX_POLICY.md](../global/GOVERNANCE_FIRST_MODULE_AND_SANDBOX_POLICY.md) for the authoritative policy.

## Active Sandboxes

| Sandbox | Owner | Status | Target Review Date |
|---|---|---|---|
| *(none yet)* | — | — | — |
