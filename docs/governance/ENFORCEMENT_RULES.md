# GOVERNANCE ENFORCEMENT — ABSOLUTE RULES


This document defines the non-negotiable governance invariants of the system.  
These rules override convenience, velocity, and developer preference.

Governance is not optional.  
Governance is not cosmetic.  
Governance is not advisory.  

It is the execution boundary of the system.

---

# 1. COVERAGE RATCHET RULE

- Governance mutation coverage may never decrease.
- The CI threshold may only increase.
- Any reduction requires:
  - Architectural review
  - Explicit written justification
  - Security approval.

Lowering the threshold to “make CI pass” is prohibited.

---

# 2. NO NEW MUTATION WITHOUT GOVERNANCE

All state-mutating entrypoints must use:

- mutationProcedure
OR
- governedAdminProcedure

Using protectedProcedure for high-risk mutations is forbidden.

High-risk includes:
- Secret lifecycle
- Deployment
- Lifecycle transitions
- External connections
- Automation execution
- Policy mutation
- Promotion
- Activation / Deactivation
- Drift-triggered actions

No exceptions.

---

# 3. FREEZE MUST BLOCK UNIVERSALLY

Every mutation must:

1. Execute freeze middleware first.
2. Be denied if subject is frozen.
3. Log the denial in audit storage.
4. Return a transport-level error.

Freeze enforcement must:
- Survive server restart.
- Be DB-backed.
- Not rely on in-memory state only.

No mutation may bypass freeze.

---

# 4. DENIAL MUST BE TRANSPORT-LEVEL

Forbidden:
return { success: false }

Required:
throw new TRPCError({ code: "CONFLICT" })

Governance denial must:
- Be protocol-visible.
- Be machine-detectable.
- Prevent state mutation at the API boundary.

Payload-level soft denials are prohibited.

---

# 5. NO HARDCODED PRINCIPAL

Forbidden patterns:

- ?? 1
- actor: 1
- Hardcoded user IDs
- Synthetic actor without attribution

All mutations must store:

- actorId
- actorType
- timestamp

Principal attribution must be correct and verifiable.

---

# 6. AUDIT MUST BE DURABLE

Audit logging must:

- Be blocking (awaited).
- Surface failures.
- Never swallow errors silently.
- Persist to durable storage.

Fire-and-forget audit writes are prohibited.

Audit integrity is a system boundary, not a best effort.

---

# 7. EVIDENCE MUST BE DETERMINISTIC

Prohibited:

- Math.random()
- Mock compliance
- Placeholder execution logic
- Simulated drift
- In-memory-only evidence

Required:

- Content-addressed storage
- SHA-256 hash
- Verification endpoint
- Deterministic output

Governance evidence must be reproducible.

---

# 8. GOVERNANCE ENGINE CANNOT BE OPTIONAL

Enforcement must not rely on developers remembering to call functions.

Required:

- Middleware-injected governance
OR
- Governance-aware baseProcedure

Inline copy-paste enforcement patterns are prohibited.

requireGate() must not be bypassable.

---

# 9. FREEZE CHECK IS MANDATORY BEFORE GATE

Mutation flow must always be:

1. Freeze check
2. Governance evaluation (requireGate)
3. Execution
4. Audit write
5. Drift monitoring

Skipping freeze or reordering this sequence is prohibited.

---

# 10. NO IN-MEMORY-ONLY SECURITY STATE

The following must be persisted:

- Freeze state
- Drift events
- Evidence bundles
- Governance runs
- Audit events

Security state must survive restart.

---

# 11. POLICY MUTATIONS ARE GOVERNED

Changes to:

- Governance policies
- Scorecard definitions
- Control catalogs
- Coverage scripts
- Enforcement middleware
- Freeze logic

Must:

- Be governed themselves.
- Trigger red-team validation.
- Require architectural review.

Governance cannot be weakened casually.

---

# 12. PROTECTEDPROCEDURE IS NOT SUFFICIENT

Authentication alone is not governance.

Any mutation reachable by:

- Any authenticated user
- Any workspace member

Must still pass governance evaluation.

Authentication is identity.
Governance is authorization + compliance.

They are not interchangeable.

---

# 13. DRIFT MUST BE ACTIONABLE

Drift detection must:

- Persist events.
- Be queryable.
- Be capable of triggering freeze.
- Block lifecycle transitions when severity threshold reached.

Drift cannot be informational-only.

---

# 14. CI ENFORCEMENT IS MANDATORY

CI must validate:

- Governance coverage %
- Freeze enforcement
- No hardcoded principal
- Transport-level denials
- Audit durability
- Evidence integrity

Merge must fail if governance checks fail.

Governance failure blocks deployment.

---

# 15. GOVERNANCE APPLIES TO ALL DOMAINS

Governance must apply to:

- Agents
- Provider connections
- LLM creation
- Catalog entries
- Deployment flows
- Automation triggers
- Actions
- Protocols
- Runtime linking
- Lifecycle transitions

No operational domain is exempt.

---

# 16. NO MOCK LOGIC IN PRODUCTION PATHS

Forbidden in production execution:

- Placeholder comments for enforcement
- TODO enforcement markers
- “temporary” bypass
- Simulated compliance logic

All enforcement paths must be real.

---

# 17. COVERAGE IS A CULTURE, NOT A METRIC

Coverage percentage is not a badge.

It is:

- A structural signal
- A regression guard
- A governance maturity indicator

Threshold must ratchet upward over time.

Never downward.

---

# FINAL DIRECTIVE

Governance is not a feature layer.
It is the control plane of the system.

All refactors, features, and performance optimizations must respect these rules.

Violation of any rule requires architectural review.

No exceptions.
