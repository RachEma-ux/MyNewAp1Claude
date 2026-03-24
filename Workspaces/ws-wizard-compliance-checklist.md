# Workspace Wizard Compliance Checklist Matrix

The wizard should be treated as a governance intake pipeline, not just a creation form. Its job is to gather enough structured information for the workspace to satisfy the workspace contract, pass review, and later become published and active. That follows directly from the repo's workspace definition, invariants, and lifecycle-oriented workspace router.

---

## Wizard Steps — Compliance Matrix

| Phase | Step | Owner | What must be captured | Governance / compliance check | Output / status |
|---|---|---|---|---|---|
| Manager intake | 1. Identity | Workspace Manager | Name, description, type, owner | Valid identity exists; owner/accountability exists | Draft record can be created |
| Manager intake | 2. Purpose | Workspace Manager | Purpose type, purpose statement, optional purpose ref | Workspace has a declared purpose; not an empty shell | Purpose is compliance-ready |
| Manager intake | 3. Creation Basis / Anchor | Workspace Manager | Anchor type, anchor ref, anchor label, optional metadata | Structural organizing factor is explicit and reviewable | Scope basis is compliance-ready |
| Manager intake | 4. Scope Details | Workspace Manager | Anchor-specific details, scoping details | Anchor details are complete enough for policy review | Scope details saved in draft |
| Manager intake | 5. Actors | Workspace Manager | Team, Crew, roles, ownership, participation model | Participation boundary is explicit; no ambiguous participants | Participation model saved |
| Manager intake | 6. Activities | Workspace Manager | How work happens, operating mode, workflow style if applicable | Intended execution mode is explicit; later config can align to it | Activity model saved |
| Manager intake | 7. Needs | Workspace Manager | Permissions, information, tools, agents, resources, visibility, context | Needs are declared clearly enough for admin/governance translation | Save as draft |
| Admin configuration | 8. Configuration | Administrator | Enabled modules, routing, shell visibility, capability model, resource profile, publication constraints | Requested needs are translated into enforceable config; module/resource/capability choices are valid | ready_for_review |
| Governance review | 9. Readiness review | Governance / System | Full summary packet: identity, purpose, anchor, actors, activities, needs, config | Check completeness, coherence, allowed combinations, publication readiness | under_review |
| Governance decision | 10. Approval | Governance / Admin | Approval notes / decision | Workspace satisfies structural, access, resource, and lifecycle rules | approved |
| Publication | 11. Publication | Governance / Admin / System | Catalog exposure decision | Approved does not automatically mean exposed; publication is explicit | published |
| Runtime enablement | 12. Activation | System / Admin | Final executable enablement | Published does not automatically mean executable; active must still be explicitly allowed | active |
| Failure handling | Rejection | Governance / Admin | Rejection reason | Workspace failed review; cannot proceed | rejected |
| Failure handling | Archive after rejection | Governance / Admin / System | Archive action / retention | Preserve auditability, prevent clutter, block progression | archived |

---

## Minimum Evidence the Wizard Must Produce

| Area | Minimum evidence |
|---|---|
| Identity | Name, type, owner, description |
| Purpose | Purpose type + statement |
| Anchor | Anchor type + reference/label |
| Participation | Team + Crew with structured identity |
| Activities | Clear description of how work happens |
| Needs | Structured needs profile |
| Configuration | Modules, routing, visibility, resources, capabilities |
| Traceability | Activity/audit records for saves and transitions |
| Review packet | One summary view showing all of the above |

---

## Promotion Gates

| Transition | Must be true before transition |
|---|---|
| Draft → Ready for Review | Identity, purpose, anchor, actors, activities, needs, and admin configuration are all present enough for review |
| Ready for Review → Under Review | Workspace is coherent and review packet is complete |
| Under Review → Approved | Governance accepts structure, participation, tools, resources, and policy alignment |
| Approved → Published | Governance/admin explicitly exposes the workspace in the catalog |
| Published → Active | Runtime execution is allowed; active state is explicitly enabled |

---

## Blockers That Should Stop Promotion

| Blocker | Why it matters |
|---|---|
| Missing purpose | Violates workspace purpose requirement |
| Missing anchor where required | Makes structural scope ambiguous |
| Unstructured Team/Crew | Participation boundary not governable |
| Missing needs | Admin cannot translate intent into governed configuration |
| Invalid module/resource combination | Violates scoped tool/resource model |
| Missing capability model | Workspace access and actions cannot be enforced safely |
| No review packet | Governance cannot review coherently |
| Publication skipped | Breaks approved/published/active separation |

---

## The Simplest Operating Rule

```
Manager defines intent
→ Admin defines governed configuration
→ Governance validates
→ Publication exposes
→ Activation enables execution
```

---

## Short Conclusion

The wizard is compliant only if it creates a workspace that is:

- purpose-defined
- anchor-defined
- participant-defined
- needs-defined
- configuration-defined
- reviewable
- publishable
- activatable

That is the standard the wizard should enforce before a workspace can move from draft to real runtime use.
