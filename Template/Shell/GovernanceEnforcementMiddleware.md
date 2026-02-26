# Governance Enforcement Middleware
# Phase 2 — Backend Control-Plane Architecture (Spec Only)

Status: Canonical Specification

---

## 1. Purpose

Defines the mandatory middleware layer that enforces:

- Governance profiles
- Resource tiers
- Freeze states
- Control catalog

Must operate server-side.

---

## 2. Enforcement Order

1. Authentication
2. Role/Authority validation
3. Freeze check
4. Governance control check
5. Resource quota check
6. Drift check
7. Action execution

---

## 3. Non-Bypassable Principle

All workspace mutations must pass through middleware.

Direct DB access is prohibited.

---

## 4. Freeze Enforcement

If workspace.status = frozen:
- Apply freeze mode rules
- Block disallowed operations

---

## 5. Resource Enforcement

- Rate limits
- Concurrency limits
- Quota ceilings
- Budget caps

Violations trigger:
- Throttle
- Deny
- Freeze (if critical)

---

## 6. Control Catalog Enforcement

For each action:
- Map to control ID
- Evaluate control.mode
- If enforce → block on failure
- If monitor → log only

---

End of Document
