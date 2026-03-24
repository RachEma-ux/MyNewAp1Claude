# Module Navigation — Governance Review

## Template

Fill this out before implementing or materially changing a module's navigation configuration.

---

## 1. Module Identity

| Field | Value |
|---|---|
| Module name | [MODULE_NAME] |
| Module ID | [module-id] |
| Base route | [/module] |
| Backend domain path | [server/module/] |
| Review date | [YYYY-MM-DD] |
| Reviewer | [Name/Role] |

---

## 2. Change Summary

**Type of change:** [New module nav / New section / New items / Metadata change / Other]

**Description:**

[Describe what is being added, changed, or removed.]

---

## 3. Governance Analysis

### 3.1 Permission Impact

| Item/Section | `requiredAction` | New Action? | Notes |
|---|---|---|---|
| [item-id] | [module.domain.operation] | [Yes/No] | [Notes] |

### 3.2 Scope Classification

| Item/Section | `scopeType` | Justification |
|---|---|---|
| [item-id] | [self/team/all/sensitive/mixed] | [Why this scope?] |

### 3.3 Visibility

| Item/Section | `visibilityMode` | Justification |
|---|---|---|
| [item-id] | [show/hide-if-no-access/show-disabled] | [Why this mode?] |

### 3.4 Sensitivity & Masking

| Item | Masking Required? | Masking Field Set | Sensitive Read Audit? | Sensitive Action |
|---|---|---|---|---|
| [item-id] | [Yes/No] | [field-set] | [Yes/No] | [action] |

### 3.5 Route Strategy

| Item | Target Route | Migrating from? | Backward Compat Alias? |
|---|---|---|---|
| [item-id] | [/module/section/item] | [/module/old-route] | [Yes/No] |

### 3.6 Implementation Status

| Item | Status | Surface |
|---|---|---|
| [item-id] | [live/placeholder/planned/not-started] | [existing-page/new-page/not-yet-implemented] |

---

## 4. Audit Implications

- [ ] Mutations on new items require audit logging
- [ ] Sensitive reads require audit logging
- [ ] Self-approval prevention applies to [operations]
- [ ] No audit implications (explain why)

---

## 5. Open Gaps

| Gap | Severity | Mitigation |
|---|---|---|
| [Description] | [High/Medium/Low] | [How addressed or deferred] |

---

## 6. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| [Description] | [High/Medium/Low] | [Strategy] |

---

## 7. Approval

- [ ] Governance analysis is complete
- [ ] All mandatory fields are defined for every item
- [ ] Scope, visibility, and masking are justified
- [ ] Open gaps are documented
- [ ] Risks are documented
- [ ] Ready for implementation

**Approved by:** [Name/Role] **Date:** [YYYY-MM-DD]
