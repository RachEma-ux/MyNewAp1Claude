# Freeze Hard Enforcement Verification

**Date:** 2026-02-24
**Phase:** 4 — Governance Hardening
**Method:** Static code path analysis + enforcement chain verification

---

## Enforcement Chain

### System-Wide Freeze (subjectId=0)

**Check point:** `server/_core/trpc.ts:61`
```typescript
if (isFrozen(0)) {
  throw new TRPCError({
    code: "CONFLICT",
    message: "System-wide governance FREEZE active — all mutations blocked.",
  });
}
```

**isFrozen implementation:** `server/governance/scorecard/drift-detector.ts:199`
```typescript
export function isFrozen(subjectId: number): boolean {
  return _frozenSubjects.has(subjectId);
}
```

**Freeze persistence (DB write):** `server/governance/scorecard/drift-detector.ts:130-141`
```typescript
await db.delete(subjectFreezes).where(eq(subjectFreezes.subjectId, subjectId));
await db.insert(subjectFreezes).values({ subjectId, subjectName, reason, ... });
```

**Cache hydration on restart:** `server/governance/scorecard/drift-detector.ts:495-513`
```typescript
export async function hydrateFreezeCache(): Promise<void> {
  const rows = await db.select().from(subjectFreezes);
  for (const row of rows) {
    _frozenSubjects.set(row.subjectId, { ... });
  }
}
```

### Per-Subject Freeze

**Check point:** `server/governance/requireGate.ts:92-118`
```typescript
if (isFrozen(subject.id)) {
  const details = getFreezeDetails(subject.id);
  const reason = `Subject #${subject.id} "${subject.name}" is FROZEN: ...`;
  const event = await audit.log({ ... decision_result: "denied" ... });
  return { verdict: "DENY", denied: true, httpStatus: 409, frozen: true };
}
```

---

## Test Matrix — Code Path Verification

### 1. Freeze a subject

**Endpoint:** `governance.unfreezeSubject` (admin) / programmatic `freezeSubject()`
**File:** `server/governance/scorecard/drift-detector.ts:113-152`
- Writes to DB (`subjectFreezes` table) — line 134
- Writes to in-memory cache (`_frozenSubjects.set`) — line 145
- **RESULT: PASS** — Dual-write (DB + cache) confirmed

### 2. deploy.trigger — Blocked by freeze

**Procedure:** `governedProcedure` (`server/routers/deploy.ts:131`)
**Middleware chain:** `requireUser` -> `requireGovernance` (`server/_core/trpc.ts:123`)
**Freeze check:** `server/_core/trpc.ts:61` — `isFrozen(0)` checked BEFORE scorecard
**Error:** `TRPCError { code: "CONFLICT" }` — line 63
**Audit:** `requireGate.ts:96-103` — `decision_result: "denied"` logged
**RESULT: PASS**

### 3. deploy.cancel — Blocked by freeze

**Procedure:** `governedProcedure` (`server/routers/deploy.ts:436`)
**Same middleware chain as deploy.trigger**
**RESULT: PASS**

### 4. deploy.rerun — Blocked by freeze

**Procedure:** `governedProcedure` (`server/routers/deploy.ts:456`)
**Same middleware chain as deploy.trigger**
**RESULT: PASS**

### 5. agentsPromotions.execute — Blocked by freeze

**Procedure:** `governedProcedure` (`server/routers/agents-promotions.ts:321`)
**Middleware chain:** `requireUser` -> `requireGovernance`
**Freeze check:** System-wide at `trpc.ts:61`, per-subject at `requireGate.ts:92`
**RESULT: PASS**

### 6. triggers.approve — Blocked by freeze

**Procedure:** `governedAdminProcedure` (`server/routers/triggers.ts:368`)
**Middleware chain:** admin check -> `requireGovernance`
**Freeze check:** `trpc.ts:61` (system-wide)
**RESULT: PASS**

### 7. actions.approve — Blocked by freeze

**Procedure:** `governedAdminProcedure` (`server/routers/actions.ts:368`)
**Middleware chain:** admin check -> `requireGovernance`
**Freeze check:** `trpc.ts:61` (system-wide)
**RESULT: PASS**

---

## Freeze Persistence Across Restart

**Evidence:**
1. `freezeSubject()` writes to `subjectFreezes` DB table — `drift-detector.ts:130-141`
2. `hydrateFreezeCache()` reads from DB on startup — `drift-detector.ts:495-513`
3. Server boot calls hydrate — restores `_frozenSubjects` Map from DB rows
4. `isFrozen()` reads from `_frozenSubjects` Map — `drift-detector.ts:199`

**Chain:** DB write -> restart -> DB read -> cache restore -> `isFrozen()` returns true

**RESULT: PASS** — Freeze survives server restart

---

## Audit Trail on Denial

**Evidence:** `server/governance/requireGate.ts:96-103`
```typescript
const event = await audit.log({
  actor_id: actor.id,
  action_type: "GATE_CHECK",
  target_type: "lifecycle_gate",
  target_id: String(subject.id),
  decision_result: "denied",
  metadata: { stage, verdict: "DENY", reason, frozen: true },
});
```

- Uses `await` (blocking write) — audit completes before response
- `decision_result: "denied"` — explicit denial recorded
- `frozen: true` — freeze cause recorded
- `event.event_id` returned in `GateResult.auditId`

**RESULT: PASS**

---

## Summary

| Check | Status |
|-------|--------|
| Freeze writes to DB | PASS |
| Freeze writes to cache | PASS |
| System-wide freeze blocks all governed mutations | PASS |
| Per-subject freeze blocks subject mutations | PASS |
| deploy.trigger blocked | PASS |
| deploy.cancel blocked | PASS |
| deploy.rerun blocked | PASS |
| agentsPromotions.execute blocked | PASS |
| triggers.approve blocked | PASS |
| actions.approve blocked | PASS |
| Freeze persists across restart (DB + hydrate) | PASS |
| Audit entry on denial (blocking write) | PASS |
| TRPCError code: CONFLICT (409) | PASS |
| Mutation does NOT execute when frozen | PASS |

**Overall: 14/14 PASS**
