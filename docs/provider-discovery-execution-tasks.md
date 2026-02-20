# Providers Discovery Plan — With Execution Tasks

(Full executable checklist version)

---

## Step 0 — Scope & Invariants (No Side Effects)
- [x] Discovery never writes to DB
- [x] Add unit test preventing repository writes
- [x] Emit structured `discovery_attempt` log
- [x] Ensure manual entry fields are never locked

---

## Step 1 — Shared Registry as Source of Truth
- [x] Define `KnownProvider` interface
- [x] Implement domain normalization (lowercase, strip www, suffix match)
- [x] Add `modelsList` + optional `healthCheck`
- [x] Add registry matching tests

---

## Step 2 — SSRF Guard (Mandatory)
- [x] Implement `validateExternalUrl()` utility
- [x] Enforce HTTPS in production
- [x] Resolve A + AAAA records
- [x] Enforce blocked IP ranges
- [x] Revalidate on redirects (≤3 hops)
- [x] Add comprehensive SSRF unit tests

---

## Step 3 — Discovery Input Handling
- [x] Normalize URL + extract domain
- [x] Registry fast-path
- [x] Website scrape fallback
- [x] Add structured status + warnings
- [x] Implement `mapDiscoveryError()`

---

## Step 4 — Website Fetch (Capped & Safe)
- [x] 8s timeout
- [x] 512KB body cap
- [x] Cheerio parsing only
- [x] Metadata fallback extraction
- [x] Add timeout + parse failure tests

---

## Step 5 — Candidate Extraction
- [x] Extract base URL patterns
- [x] Extract docs links
- [x] Apply heuristic `api.{domain}`
- [x] Normalize + dedupe candidates
- [x] Attach evidence tags

---

## Step 6 — Candidate Probing
- [x] Probe top 3 candidates
- [x] SSRF validate before probing
- [x] 2s timeout per probe
- [x] Label probeType
- [x] Interpret 401/403 as reachable

---

## Step 7 — BestUrl Selection Gate
- [x] Rank by confidence
- [x] Apply credible evidence rule
- [x] Return bestUrl or null
- [x] Add gate unit tests

---

## Step 8 — DiscoverResult Contract
- [x] Add `DiscoveryFailureReason` enum
- [x] Always return status + warnings + debug
- [x] No uncaught exceptions

---

## Step 9 — UI Apply Behavior
- [x] Implement undo snapshot
- [x] Allow full manual override
- [x] Render partial/failed banners
- [x] Add "Copy debug details"

---

## Step 10 — Catalog Creation
- [x] Separate discovery from save endpoint
- [x] Persist baseUrl + registrySlug
- [x] Audit log DB writes

---

## Step 11 — Connect Modal Alignment
- [x] Use registrySlug first
- [x] Remove domain hacks
- [x] Store secrets as references

---

## Step 12 — Runtime Health & Sync
- [x] Separate healthCheck vs modelsList
- [x] Treat 401/403 as AUTH_REQUIRED
- [x] Sync models inventory

---

## Step 13 — Failure Monitoring
- [x] Maintain rolling window stats
- [x] Compute severity + triggers
- [x] Persist metrics

---

## Step 14 — Registry Promotion
- [x] Create promotion tables
- [x] Implement OPEN → REVIEW → ACCEPT/REJECT
- [x] Store reject snapshot
- [x] Validate draft on accept

---

## Step 15 — Cooldown + Reopen
- [x] Implement material change detector
- [x] Apply cooldown rules
- [x] Store auto-reopen evidence

---

## Step 16 — Ops UI
- [x] Add DiscoveryHealthPanel
- [x] Add PromotionReviewDrawer
- [x] Implement filters + severity sorting

---

## Step 17 — Ops Endpoints
- [x] Implement stats endpoint
- [x] Implement candidates endpoint
- [x] Implement status mutations

---

## Step 18 — Audit Logging & Retention
- [x] Log structured attempts
- [x] Add 30-day retention cleanup
- [x] Add performance indexes
