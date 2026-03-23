# Governance-First Module and Sandbox Policy

**Status**: Official repository policy
**Scope**: All modules, features, and sandbox explorations in MyNewAp1Claude
**Authority**: This policy is the authoritative source for module governance sequencing and sandbox rules.

---

## 1. Core Principle

No module code starts until its governance documentation exists in Governance-Center.

Governance comes before build because:
- Ungoverned code creates audit gaps that compound over time
- Retroactive governance is consistently harder and less complete than upfront governance
- Modules that ship without governance profiles become permanent blind spots
- The cost of writing governance documentation before code is low; the cost of governing a shipped module retroactively is high

---

## 2. The Governed Module Path

### Required Module Governance Packet

Before any module enters active development, the following files must exist in `Governance-Center/modules/<module-name>/`:

| File | Purpose |
|---|---|
| `README.md` | Module overview, governance status, ownership |
| `MODULE_GOVERNANCE_PROFILE.md` | Governance model, procedure types, enforcement points |
| `MODULE_CONTROL_SURFACE.md` | Controls, gates, enforcement mechanisms |
| `MODULE_AUDIT_MODEL.md` | Audit logging, evidence production, traceability |
| `MODULE_PERIODIC_CHECKS.md` | Recurring governance checks, review cadence |
| `MODULE_RISKS.md` | Known risks, severity, mitigations |
| `MODULE_OPEN_GAPS.md` | Unresolved governance gaps, remediation plan |
| `MODULE_RUNTIME_REFERENCES.md` | Locations of runtime governance code |

Templates for all files are in `Governance-Center/templates/module/`.

### Sequencing Rule

1. Create the module governance packet in `Governance-Center/modules/<module-name>/`
2. Review the packet (Governance Agent or team review)
3. Only then begin implementation of the module

No module may bypass this sequence. A module that ships without its governance packet is non-compliant.

---

## 3. The Sandbox Path

### Why Sandbox Exists

Governance-first does not mean progress freezes. Teams need a bounded lane to explore, prototype, and validate ideas before committing to full governance overhead.

Sandbox provides that lane with clear boundaries.

### What Sandbox Is

Sandbox is a bounded exploration zone where:
- Early-stage ideas can be prototyped
- Technical feasibility can be validated
- Domain models can be sketched
- The team can learn before committing to a governed module

### What Sandbox Is Not

Sandbox is **not**:
- A loophole around governance
- A permanent home for production features
- A path to silently promote ungoverned code into the platform
- A place to store real sensitive data without controls

### Minimum Sandbox Governance Packet

A sandbox exploration may begin only after the following minimum files exist in `Governance-Center/sandbox/<sandbox-name>/`:

| File | Purpose |
|---|---|
| `SANDBOX_GOVERNANCE_NOTE.md` | What is being explored, who owns it, what governance applies |
| `SANDBOX_LINKS.md` | Links to related governance docs, modules, discussions |
| `SANDBOX_OPEN_QUESTIONS.md` | Unresolved governance and design questions |
| `SANDBOX_EXIT_CRITERIA.md` | What must be true for this sandbox to promote or be retired |

Templates for all files are in `Governance-Center/sandbox/_templates/`.

### Sandbox Restrictions

1. **No silent promotion**: Sandbox code cannot be promoted to a governed module without the full module governance packet existing first
2. **No sensitive real data**: Sandbox explorations must not use production sensitive data unless explicitly governed and approved
3. **No broad linking rights**: Sandbox code must not be imported by governed modules or platform-critical paths
4. **Easy rollback**: Sandbox explorations must be structured so they can be removed without affecting governed code
5. **Time-bounded**: Sandbox explorations should have a target review date in their exit criteria
6. **Visible**: All active sandboxes must be listed in `Governance-Center/sandbox/README.md`

### Sandbox Lifecycle

```
1. Create minimum sandbox governance packet
2. Begin exploration / prototyping
3. Reach a decision point:
   a. PROMOTE → Create full module governance packet → Move to governed module path
   b. RETIRE  → Archive or delete sandbox → Document learnings
   c. EXTEND  → Update exit criteria with new review date → Continue exploration
```

---

## 4. Promotion from Sandbox to Governed Module

Promotion is the transition from sandbox to a governed module. It requires:

1. The full module governance packet exists in `Governance-Center/modules/<module-name>/`
2. The governance packet has been reviewed (Governance Agent or team review)
3. The sandbox exit criteria have been met
4. The sandbox governance note is updated to record the promotion decision

A sandbox that does not meet all promotion criteria remains a sandbox. There is no partial promotion.

---

## 5. Summary of Paths

| Path | Entry Requirement | Governance Overhead | Can Ship to Production |
|---|---|---|---|
| **Governed Module** | Full module governance packet | Full | Yes |
| **Sandbox** | Minimum sandbox governance packet | Minimal | No |
| **Promotion** | Full module governance packet + exit criteria met | Full (retroactive) | Yes (after promotion) |

---

## 6. Official Policy Statement

**No module, feature, or subsystem may enter active development or be promoted to production status without its complete governance documentation existing in Governance-Center. Sandbox is the only permitted exception, and sandbox is bounded, visible, time-limited, and cannot be promoted without full governance documentation. This policy is mandatory and non-negotiable.**
