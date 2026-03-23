# Sandbox Policy

Concise operational rules for sandbox explorations. The authoritative policy is [GOVERNANCE_FIRST_MODULE_AND_SANDBOX_POLICY.md](../global/GOVERNANCE_FIRST_MODULE_AND_SANDBOX_POLICY.md).

---

## Rules

### 1. Bounded Exploration
Sandbox is for exploration, prototyping, and feasibility validation only. It is not a permanent home for production features.

### 2. No Silent Promotion
Sandbox code and designs cannot be promoted to a governed module without the full module governance packet existing and reviewed in `Governance-Center/modules/<module-name>/`.

### 3. No Sensitive Real Data
Sandbox explorations must not use production sensitive data (PII, credentials, financial records) unless explicitly governed and approved with documented justification.

### 4. No Broad Linking Rights
Sandbox code must not be imported by governed modules or platform-critical paths. Sandbox is isolated by design.

### 5. Easy Rollback
Sandbox explorations must be structured so they can be removed, archived, or abandoned without affecting governed code, database schemas, or runtime behavior.

### 6. Time-Bounded
Every sandbox must declare a target review date in its exit criteria. At that date, the sandbox must be promoted, extended (with a new date), or retired.

### 7. Visible
All active sandboxes must be listed in `Governance-Center/sandbox/README.md` with owner and target review date.

### 8. Minimum Governance Packet Required
A sandbox exploration cannot begin until its minimum governance packet (4 files) exists in `Governance-Center/sandbox/<sandbox-name>/`.

---

## Lifecycle

```
CREATE  → Minimum governance packet filed
EXPLORE → Prototyping and feasibility work
DECIDE  → Promote / Extend / Retire
```

- **Promote**: Full module governance packet created → sandbox archived → module enters governed path
- **Extend**: Exit criteria updated with new review date → exploration continues
- **Retire**: Sandbox archived or deleted → learnings documented
