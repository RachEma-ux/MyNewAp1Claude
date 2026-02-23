# audit/05_freeze_drift_enforcement.md — COMPLETE

## Freeze Enforcement Map

### Freeze Functions Available

| Function | File | Purpose |
|----------|------|---------|
| `isFrozen(subjectId)` | `server/governance/scorecard.ts` | Check if subject or system (id=0) is frozen |
| `getFreezeDetails(subjectId)` | `server/governance/scorecard.ts` | Get reason, frozenAt, frozenBy |
| `unfreezeSubject(subjectId)` | `server/governance/scorecard.ts` | Remove freeze on a subject |
| `getFrozenSubjects()` | `server/governance/scorecard.ts` | List all frozen subjects |

### Freeze Enforcement Points

| File | Line | Function Called | Enforcement | Status |
|------|------|----------------|-------------|--------|
| `governance/router.ts` | L562 | `isFrozen(entryId)` | Throws CONFLICT | **ACTIVE** |
| `governance/router.ts` | L568 | `isFrozen(0)` | Throws CONFLICT (system-wide) | **ACTIVE** |
| `requireGate.ts` | L88 | `isFrozen(subject.id)` | Returns DENY | **DEAD CODE** (requireGate never called) |
| `requireGate.ts` | L117 | `isFrozen(0)` | Returns DENY (system-wide) | **DEAD CODE** |
| `agents-promotions.ts` | L61, L331 | `checkActiveIncidents(db)` | Mock — always returns `[]` | **NON-FUNCTIONAL** |

### Router Files That Check Freeze: 1 of 35

| Router File | Checks `isFrozen()`? | Checks `checkActiveIncidents()`? | Freeze Effective? |
|------------|----------------------|----------------------------------|-------------------|
| `governance/router.ts` | **YES** (L562, L568) | N | **YES** |
| `agents-promotions.ts` | N | YES (mock, L61, L331) | **NO** |
| All other 33 files | N | N | **NO** |

### Freeze Coverage

| Metric | Value |
|--------|-------|
| Mutations that can be frozen | **1** (`governance.stageTransition`) |
| Mutations that cannot be frozen | **183** |
| Freeze coverage | **0.5%** |
| Files with freeze check | **1 of 35** |
| Mock freeze implementations | **1** (`agents-promotions.ts`) |

### Freeze Gap Analysis

A governance freeze SHOULD block all lifecycle mutations. Currently:
- **Blocked by freeze**: `governance.stageTransition` only
- **NOT blocked**: `catalogManage.approve/activate/publish` (the 3 PASS gates call `evaluateStageReview` but do NOT check `isFrozen`)
- **NOT blocked**: All 180 other mutations
- **Mock only**: `agentPromotions.createRequest`, `agentPromotions.execute` (freeze check present but mock always returns `[]`)

To fix: inject `isFrozen()` check into `governedProcedure` middleware or wire `requireGate()` into all lifecycle mutations.

---

## Drift Detection Map

### Drift Functions Available

| Function | File | Purpose |
|----------|------|---------|
| `detectDrift()` | `server/governance/scorecard.ts` | Trigger manual drift scan |
| `getLastDriftReport()` | `server/governance/scorecard.ts` | Get most recent drift report |
| `getDriftHistory()` | `server/governance/scorecard.ts` | Get all drift reports |
| `isDriftDetectionActive()` | `server/governance/scorecard.ts` | Check if auto-drift is running |
| `startDriftDetection(opts)` | `server/governance/scorecard.ts` | Start periodic drift scanning |
| `stopDriftDetection()` | `server/governance/scorecard.ts` | Stop periodic drift scanning |

### Drift Detection Endpoints (governance/router.ts)

| Endpoint | Type | Auth | Line | Purpose |
|----------|------|------|------|---------|
| `governance.driftDetect` | query | admin | L602 | Trigger manual drift scan |
| `governance.driftLatest` | query | protected | L609 | Get latest drift report |
| `governance.driftHistory` | query | protected | L616 | Get drift history |
| `governance.driftStatus` | query | protected | L623 | Get active status + frozen subjects |
| `governance.driftToggle` | **mutation** | admin | L640 | Start/stop drift detection |

### Drift Detection in Business Logic Routers

| File | Uses Drift Detection? | Evidence |
|------|----------------------|----------|
| `agents.ts` | YES — `runDriftDetection` (#4) | L287–373. Returns drift report but takes NO enforcement action. Does not call governance drift functions. Runs its own inline comparison logic. |
| All other 34 files | **NO** | Zero imports from governance drift functions |

### Drift Detection Gap Analysis

| Metric | Value |
|--------|-------|
| Drift detection engine | **Exists** (server/governance/scorecard.ts) |
| Manual drift trigger | **Available** (governance.driftDetect, admin-only) |
| Auto-drift scheduling | **Available** (governance.driftToggle, admin-only) |
| Auto-freeze on drift violation | **Configurable** (`autoFreeze` option in startDriftDetection) |
| Router files using governance drift | **0 of 35** |
| `agents.runDriftDetection` uses governance drift? | **NO** — runs its own inline logic |
| Drift-triggered freeze effective? | **Partially** — freeze only blocks `governance.stageTransition` |

### Drift → Freeze → Block Pipeline

```
detectDrift() → drift violations found
    ↓
autoFreeze enabled?
    YES → freezeSubject(subjectId) → isFrozen(subjectId) = true
    NO  → report only
    ↓
isFrozen() checked before mutation?
    governance.stageTransition → YES → BLOCKED ✓
    All other 183 mutations   → NO  → NOT BLOCKED ✗
```

The drift detection engine is fully built. The freeze mechanism works. But the enforcement surface is limited to 1 mutation. The pipeline from drift → freeze → enforcement is architecturally sound but practically ineffective due to near-zero freeze enforcement coverage.
