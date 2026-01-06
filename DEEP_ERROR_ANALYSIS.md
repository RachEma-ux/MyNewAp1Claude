# TypeScript Deep Error Analysis - Grouped by Root Cause

**Total Errors:** 115  
**Analysis Date:** Current scan after fixing 51 property errors

---

## Error Distribution by Root Cause

| Root Cause | Count | % | Complexity |
|------------|-------|---|------------|
| **Other (Mixed)** | 34 | 30% | Varies |
| **Type Mismatch** | 31 | 27% | Low-Medium |
| **Argument Type Error** | 23 | 20% | Medium |
| **Unused @ts-expect-error** | 15 | 13% | Trivial |
| **Missing Import/Variable** | 9 | 8% | Trivial |
| **Drizzle Insert Type Mismatch** | 3 | 3% | Medium |

---

## 1. Unused @ts-expect-error (15 errors, 13%) ⚡ QUICK WIN

**Root Cause:** These are `@ts-expect-error` comments that were added to suppress errors that have since been fixed.

**Fix Strategy:** Simply remove the comment lines.

### Files Affected:
- `server/agents/embedded-runtime.ts` (6 errors) - Lines: 54, 115, 154, 193, 232, 272
- `server/routers/agents-control-plane.ts` (5 errors) - Lines: 63, 213, 348, 387, 425
- `features/agents-create/types/agent-schema.ts` (1 error) - Line: 300
- `modules/agents/interceptors/AdmissionInterceptor.ts` (1 error) - Line: 184
- `server/agents/drift-detector.ts` (1 error) - Line: 64
- `server/routers/agents-promotions.ts` (1 error) - Line: 43

**Estimated Time:** 10 minutes

---

## 2. Missing Import/Variable (9 errors, 8%) ⚡ QUICK WIN

**Root Cause:** Missing `TRPCError` import in several files.

**Error Pattern:**
```
Cannot find name 'TRPCError'. Did you mean 'RTCError'?
```

**Fix Strategy:** Add import at the top of each file:
```typescript
import { TRPCError } from "@trpc/server";
```

### Files Affected:
- `server/agents/autonomous-remediation.ts` (5 errors) - Lines: 42, 118, 175, 207, 235
- `server/agents/embedded-runtime.ts` (3 errors) - Lines: 224, 249, 283
- `server/agents/drift-detector.ts` (1 error) - Line: 34

**Estimated Time:** 5 minutes

---

## 3. Type Mismatch (31 errors, 27%)

**Root Cause:** Various type incompatibilities, mostly:
1. String assigned to Date fields
2. String assigned to number fields  
3. String assigned to enum types
4. Type predicate issues

### 3.1 String → Date (11 errors)

**Error Pattern:**
```
Type 'string' is not assignable to type 'Date | SQL<unknown>'
```

**Fix Strategy:** Wrap with `new Date()` or change schema to accept string timestamps.

**Files:**
- `server/routers/agents-promotions.ts` (5 errors) - Lines: 214, 286, 330, 362, 394
- `server/routers/agents-control-plane.ts` (3 errors) - Lines: 264, 409, 446
- `server/routers/agents.ts` (2 errors) - Lines: 219, 275
- `server/agents/embedded-runtime.ts` (1 error) - Line: 290

### 3.2 String → Number (4 errors)

**Error Pattern:**
```
Type 'string' is not assignable to type 'number'
```

**Fix Strategy:** Parse with `parseInt()` or `parseFloat()`.

**Files:**
- `client/src/pages/AgentTemplates.tsx` (2 errors) - Lines: 148, 150
- `client/src/components/TriggerCreationDialog.tsx` (1 error) - Line: 132
- `client/src/pages/DriftDetectionPage.tsx` (1 error) - Line: 39

### 3.3 String → Enum (2 errors)

**Error Pattern:**
```
Type 'string' is not assignable to type '"json" | "pdf" | "csv"'
```

**Fix Strategy:** Add type assertion or validate before assignment.

**Files:**
- `client/src/pages/ComplianceExportPage.tsx` (1 error) - Line: 32
- `client/src/pages/PromotionRequestsPage.tsx` (1 error) - Line: 43

### 3.4 Type Predicates (3 errors)

**Error Pattern:**
```
A type predicate's type must be assignable to its parameter's type
```

**Files:**
- `features/agents-create/types/agent-schema.ts` (3 errors) - Lines: 322, 329, 336

### 3.5 Other Type Mismatches (11 errors)

Various type incompatibilities in different contexts.

**Estimated Time:** 1-2 hours

---

## 4. Argument Type Error (23 errors, 20%)

**Root Cause:** Function calls with wrong argument types or counts.

### 4.1 Wrong Argument Count (3 errors)

**Error Pattern:**
```
Expected 2-3 arguments, but got 1
Expected 0 arguments, but got 1
```

**Files:**
- `features/agents-create/types/agent-schema.ts` (2 errors) - Lines: 134, 171
- `server/routers/agents-control-plane.ts` (2 errors) - Lines: 136, 288
- `server/routers/agents.ts` (1 error) - Line: 275

### 4.2 No Overload Matches (20 errors)

**Error Pattern:**
```
No overload matches this call
```

These are mostly Drizzle ORM issues where the insert/update data doesn't match the schema.

**Files:**
- `server/routers/agents.ts` (4 errors)
- `server/routers/agents-promotions.ts` (5 errors)
- `server/routers/conversations.ts` (2 errors)
- `client/src/pages/AgentChat.tsx` (2 errors)
- And others...

**Estimated Time:** 2-3 hours

---

## 5. Drizzle Insert Type Mismatch (3 errors, 3%)

**Root Cause:** Insert data structure doesn't match table schema definition.

**Error Pattern:**
```
No overload matches this call. Overload 1 of 2, '(value: { name: string | SQL<unknown> | Placeholder...
```

**Files:**
- `server/routers/actions.ts` (1 error) - Line: 301
- `server/routers/conversations.ts` (1 error) - Line: 67
- `server/routers/triggers.old.ts` (1 error) - Line: 294

**Fix Strategy:** Ensure all required fields are present and optional fields match schema.

**Estimated Time:** 30 minutes

---

## 6. Other (Mixed) (34 errors, 30%)

**Root Cause:** Various issues that don't fit other categories:

### 6.1 Missing Module Exports (6 errors)

**Error Pattern:**
```
Module '"../types"' has no exported member 'InterceptorContext'
Module '"./opa-engine"' has no exported member 'evaluatePolicy'
```

**Files:**
- `modules/agents/services/policy-service.ts` (2 errors)
- `modules/agents/interceptors/AdmissionInterceptor.ts` (1 error)
- `modules/agents/interceptors/InterceptorChain.ts` (1 error)
- `server/agents/autonomous-remediation.ts` (1 error)
- `server/agents/drift-detector.ts` (1 error)

### 6.2 Object Literal Property Issues (11 errors)

**Error Pattern:**
```
Object literal may only specify known properties, and 'workspaceId' does not exist in type...
```

**Files:**
- `server/agents/autonomous-remediation.ts` (4 errors)
- `client/src/pages/PromotionRequestsPage.tsx` (3 errors)
- `client/src/pages/AgentChat.tsx` (2 errors)
- `client/src/pages/Agents.tsx` (1 error)
- `server/agents/drift-detector.ts` (1 error)

### 6.3 Type Conversion Issues (3 errors)

**Error Pattern:**
```
Conversion of type 'number[]' to type 'string' may be a mistake
```

**Files:**
- `server/routers/agents-promotions.ts` (3 errors) - Lines: 121, 195, 267

### 6.4 Iterator Issues (1 error)

**Error Pattern:**
```
Type 'Set<number>' can only be iterated through when using the '--downlevelIteration' flag
```

**Files:**
- `client/src/pages/AgentsPage.tsx` (1 error) - Line: 80

### 6.5 Other Misc (13 errors)

Various unique errors in different files.

**Estimated Time:** 3-4 hours

---

## Recommended Fix Order

### Phase 1: Quick Wins (30 minutes)
1. ✅ Remove 15 unused `@ts-expect-error` directives
2. ✅ Add 9 missing `TRPCError` imports

**Impact:** 24 errors fixed (21% reduction)

### Phase 2: Type Conversions (1-2 hours)
3. Fix string → Date conversions (11 errors)
4. Fix string → number conversions (4 errors)
5. Fix string → enum conversions (2 errors)

**Impact:** 17 errors fixed (15% reduction)

### Phase 3: Schema & Drizzle Issues (2-3 hours)
6. Fix Drizzle insert type mismatches (3 errors)
7. Fix object literal property issues (11 errors)
8. Fix "no overload matches" errors (20 errors)

**Impact:** 34 errors fixed (30% reduction)

### Phase 4: Module & Export Issues (1-2 hours)
9. Add missing module exports (6 errors)
10. Fix type predicates (3 errors)
11. Fix remaining misc errors (13 errors)

**Impact:** 22 errors fixed (19% reduction)

---

## Total Estimated Time: 6-9 hours

**Current:** 115 errors  
**After Phase 1:** 91 errors  
**After Phase 2:** 74 errors  
**After Phase 3:** 40 errors  
**After Phase 4:** 0 errors ✅
