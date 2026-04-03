---
name: full-review
description: Strict end-to-end implementation review before marking work complete.
---

# Full Review

Perform a strict end-to-end review of the current implementation before it is marked complete.

## Instructions

1. **Re-read the original request** — what was asked for?
2. **Inspect all changed files** — git diff or explicit file list
3. **Verify critical path** — does the happy path actually work end-to-end?
4. **Check failure paths** — are errors handled, not swallowed?
5. **Check for regressions** — did existing functionality break?
6. **Check for scope drift** — were unrelated changes introduced?
7. **Check architecture** — are changes in the right layer/module?
8. **Check security** — any new injection, auth, or secrets issues?
9. **Produce verdict** — pass or fail with evidence

## Output Format

```
## Full Review

### Request Summary
[One sentence: what was requested]

### Changed Files
| File | Change Type | Lines |
|---|---|---|
| ... | add/modify/delete | +N/-N |

### Critical Path
- [ ] Verified: [describe the main flow that was tested]
- [ ] Verified: [secondary flow if applicable]

### Issues
| # | Severity | Description | File:Line |
|---|---|---|---|
| ... | ... | ... | ... |

### Scope Check
- Unrelated changes: YES/NO
- Architecture fit: PASS/FAIL
- Security: PASS/FAIL

### Verdict
PASS / PASS-WITH-WARNINGS / FAIL

### Remaining Risks
- ...
```
