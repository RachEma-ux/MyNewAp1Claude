# Module Navigation — Deferred Items Register

## Template

Track all nav items that are defined in the canonical config but not yet backed by real surfaces. Keep this document in sync with the module's nav config.

---

## Module: [MODULE_NAME]

**Last updated:** [YYYY-MM-DD]

---

## Summary

| Metric | Count |
|---|---|
| Total nav items | [N] |
| Live items | [N] |
| Placeholder items | [N] |
| Deferred (not-started) items | [N] |
| Completion percentage | [N%] |

---

## Deferred Items by Section

### [Section Label]

| Item ID | Label | Reason Deferred | Priority | Target Phase |
|---|---|---|---|---|
| [item-id] | [Item Label] | [Why not implemented yet] | [High/Medium/Low] | [Phase N / TBD] |

### [Next Section Label]

| Item ID | Label | Reason Deferred | Priority | Target Phase |
|---|---|---|---|---|
| [item-id] | [Item Label] | [Reason] | [Priority] | [Phase] |

---

## Deferred Item Behavior

All deferred items in this module:

- [ ] Have `implementationStatus: "not-started"` in the nav config
- [ ] Have `backedBy: "not-yet-implemented"` in the nav config
- [ ] Do NOT have page component files on disk
- [ ] Do NOT have dead-end routes
- [ ] Appear as "Coming soon" in section landing pages
- [ ] Do NOT falsely represent completed capabilities

---

## Implementation Sequencing

Recommended order for implementing deferred items:

1. **Next priority:** [Section / items with highest business value]
2. **Second priority:** [Section / items with dependencies resolved]
3. **Third priority:** [Remaining items]

---

## Notes

[Any additional context about why items are deferred, dependencies, or constraints.]
