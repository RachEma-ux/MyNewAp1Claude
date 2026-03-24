# Module Nav — Rollout Plan

## Template

Fill this out when planning the rollout of a module's nav adoption.

---

## Module: [MODULE_NAME]

**Date:** [YYYY-MM-DD]
**Owner:** [Name/Role]
**Target completion:** [YYYY-MM-DD or Phase N]

---

## 1. Current State

| Metric | Value |
|---|---|
| Current nav model | [Hardcoded / Flat routes / None] |
| Total capabilities | [N] |
| Planned sections | [N] |
| Planned items | [N] |
| Items that can be live immediately | [N] |
| Items to defer | [N] |

---

## 2. Rollout Phases

### Phase 1: Governance Analysis

- [ ] Fill out governance review template
- [ ] Define permission actions
- [ ] Classify scope and visibility for all items
- [ ] Document risks and gaps
- [ ] Get governance approval

### Phase 2: Nav Config + Routes

- [ ] Create canonical nav config
- [ ] Set up section landing routes
- [ ] Preserve old routes (if migrating)
- [ ] Create route alias map (if migrating)

### Phase 3: Permission + Visibility Layer

- [ ] Define role matrix
- [ ] Implement auth helpers
- [ ] Wire up visibility filtering

### Phase 4: Validation + Testing

- [ ] Run structural validation
- [ ] Add module-specific tests
- [ ] Run compliance tests
- [ ] Verify all live items have working routes

### Phase 5: Governance Pack + Registration

- [ ] Create governance pack
- [ ] Register module
- [ ] Create exceptions if needed
- [ ] Update indexes and reports

### Phase 6: Acceptance

- [ ] Reviewer pass
- [ ] Governance pass
- [ ] Update feature flags
- [ ] Document acceptance

---

## 3. Risk Mitigation

| Risk | Mitigation |
|---|---|
| [Risk description] | [Strategy] |

---

## 4. Dependencies

| Dependency | Status | Owner |
|---|---|---|
| [Description] | [Resolved/Pending] | [Owner] |

---

## 5. Success Criteria

- [ ] Nav config passes structural validation
- [ ] All live items routed and accessible
- [ ] Compliance tests pass
- [ ] Governance pack complete
- [ ] No backward compatibility breakage
