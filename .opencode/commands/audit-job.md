---
name: audit-job
description: Audit an implementation against a target prompt. Checks completeness, correctness, conflicts, regressions, and governance fit.
---

# Audit Job

Audit the current implementation against the provided target prompt.

## Instructions

1. **Read the target prompt** — understand exactly what was requested
2. **Inspect the implementation** — read all touched files
3. **Check completeness** — is every requirement addressed?
4. **Check correctness** — does the implementation actually work?
5. **Check conflicts** — does it break existing functionality?
6. **Check regressions** — are there unintended side effects in touched areas?
7. **Check governance fit** — does it respect module boundaries, lifecycle rules, and policy?

## Output Format

```
## Audit: [Job Title]

### Requirements Coverage
| Requirement | Status | Evidence |
|---|---|---|
| ... | Done / Partial / Missing | file:line |

### Issues Found
| # | Severity | Description | File |
|---|---|---|---|
| 1 | critical/warning/info | ... | file:line |

### Governance Check
- Module boundaries: PASS/FAIL
- Lifecycle rules: PASS/FAIL
- Security: PASS/FAIL

### Verdict
PASS / PASS-WITH-WARNINGS / FAIL

### Unverified Items
- ...
```
