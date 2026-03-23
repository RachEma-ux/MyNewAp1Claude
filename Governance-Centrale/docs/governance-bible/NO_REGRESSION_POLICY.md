# No-Regression Policy

Governance enforcement may only move forward. This policy defines the invariants
that prevent governance from weakening over time.

---

## 1. Coverage Ratchet

- The CI coverage threshold may only increase, never decrease.
- Current threshold is defined in `scripts/governance/coverage-map.ts`.
- Any commit that lowers the threshold value will fail CI.
- Requesting a threshold reduction requires:
  - Written architectural justification
  - Security review approval
  - Explicit sign-off recorded in `docs/governance/` decision log

**Lowering the threshold to make CI pass is prohibited.**

---

## 2. No Governed-to-Ungoverned Downgrade

- A mutation that uses `governedProcedure` or `governedAdminProcedure` must never be changed back to `protectedProcedure`.
- Removing governance middleware from an existing mutation is a regression.
- CI enforcement validation probes detect this class of regression.

---

## 3. Freeze Enforcement Cannot Be Weakened

- Freeze checks must not be removed from any middleware or mutation path.
- Freeze persistence must remain database-backed (not in-memory only).
- The freeze → deny → audit pipeline must remain intact.
- Removing or commenting out `isFrozen()` checks is a regression.

---

## 4. Audit Durability Cannot Be Downgraded

- Audit writes that are blocking (awaited) must not be changed to fire-and-forget.
- Audit logging must not be removed from governed mutation paths.
- Audit schema fields must not be removed (fields may be added).

---

## 5. Transport-Level Denial Cannot Be Softened

- Governance denial via `TRPCError({ code: "CONFLICT" })` must not be replaced with payload-level soft denials (`{ success: false }`).
- HTTP 409 semantics must be preserved on all governance gate failures.

---

## 6. Principal Attribution Cannot Be Weakened

- Hardcoded actor fallbacks (`?? 1`, `actor: 1`) must not be reintroduced after removal.
- All mutations must attribute actions to a real principal.
- New mutations must include `actorId` and `actorType` in audit records.

---

## 7. Evidence Integrity Cannot Be Downgraded

- SHA-256 content-addressing must not be replaced with weaker hashing or random IDs.
- Verify-on-read must not be removed from evidence retrieval paths.
- Evidence bundle generation must not be made optional for governed transitions.

---

## 8. CI Enforcement Gates Cannot Be Removed

- The governance gate workflow (`.github/workflows/governance-gate.yml`) must not be deleted or disabled.
- The enforcement validation workflow (`.github/workflows/enforcement-validation.yml`) must not be deleted or disabled.
- Individual probes may be updated but not removed without replacement.
- Merge must remain blocked on governance gate failure.

---

## 9. Control Catalog Cannot Shrink

- Controls may be added to the catalog but not removed.
- Control severity may be increased but not decreased.
- Pack assignments may not be removed (controls may be reassigned to a stricter pack).
- Minimum control counts per pack (defined in catalog lint) may only increase.

---

## Enforcement

This policy is enforced through:

1. **CI coverage-map script** — fails on threshold regression
2. **Enforcement validation probes** — detect structural regressions (freeze removal, ungoverned downgrades)
3. **Code review** — all changes to governance middleware, audit, and enforcement paths require review
4. **Red team validation** — periodic static analysis to detect policy drift

Violation of this policy blocks merge and requires architectural review.
