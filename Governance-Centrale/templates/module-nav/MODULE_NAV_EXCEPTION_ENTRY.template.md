# Module Nav — Exception Entry Template

## Template

Copy and fill this out when a module cannot fully comply with the nav standard.

---

## Exception Entry

Add to `Governance-Centrale/global/MODULE_NAV_EXCEPTION_REGISTRY.md` under "Active Exceptions":

```markdown
### EX-[NNN]: [Module Name] — [Brief description]

| Field | Value |
|---|---|
| Module | [module-id] |
| Exception type | `[legacy-pending / partial-adoption / pilot-deviation / deferred-scope / temporary-gap]` |
| Reason | [Why the module cannot meet the standard] |
| Scope | [What aspect is affected — e.g., "Frontend visibility gating", "Full module"] |
| Owner | [Who is responsible for resolving this] |
| Created | [YYYY-MM-DD] |
| Review date | [When to re-evaluate — e.g., "Next phase", "Wave 2 planning"] |
| Expiry | [When this exception should be resolved] |
| Compensating controls | [What mitigates the gap — e.g., "Backend enforces access"] |
| Next action | [Specific next step to resolve the exception] |
```

---

## Exception Type Reference

| Type | When to Use |
|---|---|
| `legacy-pending` | Module has hardcoded nav, migration not started |
| `partial-adoption` | Module adopted the standard but some requirements are incomplete |
| `pilot-deviation` | Module is in pilot/trial state, not yet fully compliant |
| `deferred-scope` | Module intentionally deferred — too small, immature, or N/A |
| `temporary-gap` | Specific gap that will be resolved in a planned phase |

---

## Checklist

- [ ] Exception has a unique ID (EX-NNN, sequential)
- [ ] Exception has a review date
- [ ] Exception has a specific next action
- [ ] Exception is referenced from the module's registry entry (`exceptionIds`)
- [ ] Module's `complianceStatus` matches the exception state
- [ ] Compliance report is updated
