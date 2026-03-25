# MODULE_PERIODIC_CHECKS — Culture Values

## Purpose

Defines recurring governance checks for the Culture Values domain.

These checks exist to ensure that values remain owned, usable, consistent, and
operationalized across the enterprise instead of becoming symbolic artifacts.

---

## Required Checks

### 1. Ownership Integrity
Check for:
- values with no owner
- value categories with no owner or steward
- published values with missing governance contact

**Why it matters:** Ownership gaps turn values into ungoverned content.

### 2. Mapping Coverage
Check for:
- active values with no behavior mappings
- critical roles with no value behavior mapping
- active org units with no relevant behavior context where required

**Why it matters:** Values without behavior mappings cannot be operationalized.

### 3. Contradiction Check
Check for:
- local behavior mapping contradicting enterprise value
- local anti-pattern conflicting with global expectation
- cross-unit mappings that create incompatible standards

**Why it matters:** Contradiction is the most direct source of subculture drift.

### 4. Usage Drift
Check for:
- active values not referenced in HR review templates
- active values not referenced in hiring scorecards where required
- active values not referenced in PM delivery behavior rules where required

**Why it matters:** Unused values become symbolic rather than operational.

### 5. Lifecycle Drift
Check for:
- deprecated values still used in active templates
- archived values still referenced in policy links
- inactive categories still used in active values

**Why it matters:** Lifecycle drift creates policy confusion.

### 6. Vendor / Partner Alignment
Check for:
- vendors requiring value clauses but missing them
- inactive or outdated value clauses still attached to external agreements
- partner compliance mappings missing for required value sets

**Why it matters:** Enterprise values should extend consistently to external relationships where applicable.

### 7. Evaluation Rule Consistency
Check for:
- values with no scoring model where one is required
- values with multiple conflicting scoring schemes
- weightings that do not sum to valid expected ranges where applicable

**Why it matters:** Inconsistent evaluation logic undermines trust in values-based review.

### 8. Analytics Readiness
Check for:
- values missing category/type classification
- values not linked to measurable behavior where measurement is expected
- mappings that cannot be surfaced in analytics due to incomplete data

**Why it matters:** Culture analytics and drift detection depend on structured data.

---

## Suggested Cadence

| Check Type | Suggested Cadence |
|---|---|
| Ownership integrity | Daily |
| Mapping coverage | Weekly |
| Contradiction checks | Weekly |
| Usage drift | Monthly |
| Lifecycle drift | Weekly |
| Vendor / partner alignment | Monthly |
| Evaluation rule consistency | Monthly |
| Analytics readiness | Monthly |

---

## Suggested Severity

| Issue | Severity |
|---|---|
| value with no owner | Critical |
| contradictory local behavior mapping | Critical |
| deprecated value still active in evaluation templates | High |
| active value with no behavior mappings | High |
| missing vendor clause where required | High |
| value not used in expected HR/PM templates | Medium |
| incomplete analytics metadata | Medium |

---

## Current Runtime Clarification

These checks are governance-defined before full runtime implementation.

At present:
- automated Culture Values check runners may not yet exist
- some checks depend on future HR / PM / vendor integrations
- this document acts as the authoritative operational target
