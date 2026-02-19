# Providers Discovery Plan — With Execution Tasks

(Full executable checklist version)

---

## Step 0 — Scope & Invariants (No Side Effects)
- [ ] Discovery never writes to DB
- [ ] Add unit test preventing repository writes
- [ ] Emit structured `discovery_attempt` log
- [ ] Ensure manual entry fields are never locked

---

## Step 1 — Shared Registry as Source of Truth
- [ ] Define `KnownProvider` interface
- [ ] Implement domain normalization (lowercase, strip www, suffix match)
- [ ] Add `modelsList` + optional `healthCheck`
- [ ] Add registry matching tests

---

## Step 2 — SSRF Guard (Mandatory)
- [ ] Implement `validateExternalUrl()` utility
- [ ] Enforce HTTPS in production
- [ ] Resolve A + AAAA records
- [ ] Enforce blocked IP ranges
- [ ] Revalidate on redirects (≤3 hops)
- [ ] Add comprehensive SSRF unit tests

---

## Step 3 — Discovery Input Handling
- [ ] Normalize URL + extract domain
- [ ] Registry fast-path
- [ ] Website scrape fallback
- [ ] Add structured status + warnings
- [ ] Implement `mapDiscoveryError()`

---

## Step 4 — Website Fetch (Capped & Safe)
- [ ] 8s timeout
- [ ] 512KB body cap
- [ ] Cheerio parsing only
- [ ] Metadata fallback extraction
- [ ] Add timeout + parse failure tests

---

## Step 5 — Candidate Extraction
- [ ] Extract base URL patterns
- [ ] Extract docs links
- [ ] Apply heuristic `api.{domain}`
- [ ] Normalize + dedupe candidates
- [ ] Attach evidence tags

---

## Step 6 — Candidate Probing
- [ ] Probe top 3 candidates
- [ ] SSRF validate before probing
- [ ] 2s timeout per probe
- [ ] Label probeType
- [ ] Interpret 401/403 as reachable

---

## Step 7 — BestUrl Selection Gate
- [ ] Rank by confidence
- [ ] Apply credible evidence rule
- [ ] Return bestUrl or null
- [ ] Add gate unit tests

---

## Step 8 — DiscoverResult Contract
- [ ] Add `DiscoveryFailureReason` enum
- [ ] Always return status + warnings + debug
- [ ] No uncaught exceptions

---

## Step 9 — UI Apply Behavior
- [ ] Implement undo snapshot
- [ ] Allow full manual override
- [ ] Render partial/failed banners
- [ ] Add "Copy debug details"

---

## Step 10 — Catalog Creation
- [ ] Separate discovery from save endpoint
- [ ] Persist baseUrl + registrySlug
- [ ] Audit log DB writes

---

## Step 11 — Connect Modal Alignment
- [ ] Use registrySlug first
- [ ] Remove domain hacks
- [ ] Store secrets as references

---

## Step 12 — Runtime Health & Sync
- [ ] Separate healthCheck vs modelsList
- [ ] Treat 401/403 as AUTH_REQUIRED
- [ ] Sync models inventory

---

## Step 13 — Failure Monitoring
- [ ] Maintain rolling window stats
- [ ] Compute severity + triggers
- [ ] Persist metrics

---

## Step 14 — Registry Promotion
- [ ] Create promotion tables
- [ ] Implement OPEN → REVIEW → ACCEPT/REJECT
- [ ] Store reject snapshot
- [ ] Validate draft on accept

---

## Step 15 — Cooldown + Reopen
- [ ] Implement material change detector
- [ ] Apply cooldown rules
- [ ] Store auto-reopen evidence

---

## Step 16 — Ops UI
- [ ] Add DiscoveryHealthPanel
- [ ] Add PromotionReviewDrawer
- [ ] Implement filters + severity sorting

---

## Step 17 — Ops Endpoints
- [ ] Implement stats endpoint
- [ ] Implement candidates endpoint
- [ ] Implement status mutations

---

## Step 18 — Audit Logging & Retention
- [ ] Log structured attempts
- [ ] Add 30-day retention cleanup
- [ ] Add performance indexes
