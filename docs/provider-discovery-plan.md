# Provider Discovery — Governed Website-to-Catalog Auto-fill

When creating a new provider in Catalog Manage (New Entry), the "Base Provider" dropdown only shows existing catalog entries. We add a "Discover from Website" field that fetches metadata from a provider's official site and returns structured candidates for admin review before applying.

---

## Implementation

### 1. Shared provider registry: `shared/provider-registry.ts`

Single source of truth for well-known providers. Used by server discovery, client ConnectProviderModal, and future features.

```ts
export interface KnownProvider {
  slug: string;                  // canonical ID: "openai", "anthropic", "groq"
  name: string;                  // display name: "OpenAI"
  domains: string[];             // website domains: ["openai.com", "platform.openai.com"]
  apiUrl: string | null;         // null for local-only (Ollama, llama.cpp)
  description: string;
  compatibility: "openai" | "anthropic" | "custom";
  authType: "api_key" | "pat" | "oauth" | "none";
  isLocal: boolean;              // true for Ollama, llama.cpp
  defaultLocalUrl?: string;      // "http://localhost:11434" — only used when isLocal
  modelsListProbe: {             // authoritative models listing probe (also used by discovery)
    method: "GET" | "HEAD";
    path: string;                // e.g. "/v1/models"
    headers?: Record<string, string>;
  };
  healthProbe?: {                // optional separate health check (unauthenticated where possible)
    method: "GET" | "HEAD";
    path: string;                // e.g. "/health", "/v1/models" (same as models if no dedicated endpoint)
    headers?: Record<string, string>;
  };
}
```

Key design decisions:
- **Ollama/llama.cpp**: `apiUrl: null`, `isLocal: true`, `defaultLocalUrl` for local runtimes. Never used in remote discovery or SSRF context.
- **slug** is the stable lookup key (not hacked domain strings)
- **modelsPath** per provider — no universal `/v1/models` assumption
- **authType** informs the Connect flow which credential to request
- **modelsListProbe** (required) — authoritative probe for model listing + discovery confirmation. Replaces the old `modelsPath` field. Avoids guessing API shapes.
- **healthProbe** (optional) — separate health check endpoint (e.g. `/health`) when the provider has a dedicated unauthenticated health endpoint. Falls back to `modelsListProbe` if not defined. Prevents misclassifying 401 on models endpoint as "provider down".
- For unknown providers discovered via website scrape, the discovery service uses `{ method: "GET", path: "/v1/models" }` labeled as `"openai-shape-best-effort"` in probe results

`findKnownProvider(domain)` matches by normalized domain against `domains[]`.

### 2. SSRF guard: `server/routers/ssrf-guard.ts`

Validates URLs before any server-side fetch. Called on every fetch and every redirect hop.

```ts
export async function validateExternalUrl(url: string, opts?: { allowHttp?: boolean }): Promise<{ safe: boolean; error?: string }>
```

**Checks (all must pass):**
1. **URL hardening**: parse with `new URL()`, reject:
   - `userinfo` (`user:pass@host`)
   - Unusual ports (allow 80, 443, 8443 only; relax in dev)
   - Punycode: decode hostname via `new URL()` (WHATWG handles this), reject mixed-script hostnames (simple heuristic: if ASCII + non-ASCII chars mixed in labels), reject control/invisible chars
2. **Scheme**: must be `https:`. Allow `http:` only when `opts.allowHttp` AND `NODE_ENV=development`
3. **DNS resolution**: resolve hostname via `dns.promises.resolve4()` + `dns.promises.resolve6()`. Collect **all** A/AAAA records
4. **IP check**: classify every resolved IP as public or blocked. Blocked ranges:
   - `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - `169.254.0.0/16` (link-local + cloud metadata)
   - `0.0.0.0`, `::1`, `fc00::/7`, `fe80::/10`
   - **Rule: block if ALL resolved IPs are in blocked ranges.** If at least one IP is public → allow (CDNs sometimes return mixed records). Log all resolved IPs for audit.
5. Return `{ safe: true }` or `{ safe: false, error: "..." }`

Used by discovery fetch AND on each redirect hop. For redirects:
- Resolve `Location` header against current URL (handles relative redirects)
- Re-validate the new URL (full DNS + IP check on the new hostname)
- Cap at 3 hops total AND 8s cumulative time

### 3. Install cheerio: lightweight HTML parser

```bash
npm install cheerio
```

Used in discovery service instead of regex. Handles attribute order, single quotes, multiline tags, entities, JSON-LD blocks reliably.

### 4. Discovery service: `server/routers/discover-provider.ts`

**Input:** `websiteUrl: string`

**Output:**
```ts
interface DiscoverResult {
  name: string | null;
  description: string | null;
  api: {
    bestUrl: string | null;
    candidates: Array<{
      url: string;
      confidence: number;       // 0-100 numeric for stable ranking
      confidenceLabel: "high" | "medium" | "low";  // display
      probeType?: "registry-probe" | "openai-shape-best-effort";
      probe?: { path: string; status: number | null };
    }>;
  };
  source: "registry" | "website";
  domain: string;
}
```

**Logic (ordered):**

1. **Normalize URL**, extract domain
2. **SSRF guard** on input URL — reject if unsafe
3. **Check shared registry** — `findKnownProvider(domain)`. If found, return immediately:
   - `source: "registry"`, `bestUrl` from registry, confidence `100` ("high")
   - No fetch needed — instant response
4. **Fetch HTML** with safety controls:
   - `fetch(url, { redirect: "manual" })` — handle redirects manually
   - On each redirect: SSRF-validate the `Location` header before following (max 3 hops)
   - 8s total timeout (`AbortSignal.timeout`)
   - Read body as stream, cap at 512KB, abort if exceeded
5. **Parse HTML with cheerio** — extract:
   - **Name**: `meta[property="og:site_name"]` → `application/ld+json` (Organization.name) → `<title>` cleaned (strip " - Home", "| Official Site", etc.) → domain capitalized as fallback
   - **Description**: `meta[name="description"]` → `meta[property="og:description"]`
6. **Find API URL candidates** (with numeric confidence):
   - Scan `<a href>` for URLs containing `api.`, `/docs`, `/api`, `developers.` → extract base, confidence `40`
   - Scan text content for patterns like "Base URL: https://..." → confidence `50`
   - Try `https://api.{domain}` as heuristic → confidence `20`
7. **Probe top 3 candidates**:
   - If a KnownProvider match exists → use its `modelsListProbe` config, label as `"registry-probe"`
   - Otherwise → `GET {url}/v1/models`, label as `"openai-shape-best-effort"`
   - Include `probeType` in each candidate result so UI can display the distinction
   - SSRF-validate each candidate URL before probing
   - 2s timeout per probe
   - Interpret response:
     - `200` → confidence += 50 (cap at 90)
     - `401`/`403` → confidence += 45 (exists, needs auth — useful signal)
     - `404` → no change
     - Network error → remove from candidates
8. **Select bestUrl** — sort by confidence desc, then:
   - Require probe status `200`/`401`/`403` OR confidence >= 70
   - AND URL matches a credible pattern (`api.` subdomain, or extracted from "Base URL" text, or registry)
   - If no candidate meets criteria → `bestUrl: null` (admin fills manually)
9. **Log**: `console.log("[Discovery] domain=%s source=%s bestUrl=%s resolvedIPs=[...]", ...)`
10. Return `DiscoverResult`

### 5. tRPC mutation: `catalogManage.discoverProvider`

**File:** `server/routers/catalog-manage.ts`

```ts
discoverProvider: protectedProcedure
  .input(z.object({ websiteUrl: z.string().url() }))
  .mutation(async ({ input }) => {
    return discoverProvider(input.websiteUrl);
  }),
```

Import `discoverProvider` from `./discover-provider`.

### 6. UI: Discover field in Create form

**File:** `client/src/pages/CatalogManagePage.tsx`

Add above the existing "Base Provider" CatalogSelect (~line 1247). Only shown when `!editingEntry && formEntryType === "provider"`.

**New state variables:**
- `discoverUrl: string` — input field value
- `discoverResult: DiscoverResult | null` — API response
- `isDiscovering: boolean` — loading state

**Layout:**
```
┌──────────────────────────────────────────────────┐
│  Discover from Website (optional)                 │
│  [https://fireworks.ai             ] [🔍 Search]  │
│  "Paste the provider's official website"          │
│                                                    │
│  ┌─ Result card (on success) ────────────────┐   │
│  │  ✓ Fireworks AI             [Registry] 🟢 │   │
│  │  "Fast open-source model inference"        │   │
│  │  API: https://api.fireworks.ai  [90 High]  │   │
│  │  ─── Other candidates (1) ▸ ───            │   │
│  │                           [Apply to Form]  │   │
│  └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**Behavior:**
- Search button calls `trpc.catalogManage.discoverProvider.useMutation()`
- Loading: `Loader2` spinner on button, button disabled
- On success: show result card with:
  - Name + source badge ("Registry" green / "Website" blue)
  - Description (if found)
  - Best API URL with confidence badge (High ≥70 green, Medium 40-69 yellow, Low <40 gray)
  - Expandable "Other candidates" if `candidates.length > 1`, showing each with probe status + probeType label
  - If `bestUrl` exists: **"Apply to Form"** button uses it
  - If `bestUrl` is null but candidates exist: show "No confirmed API URL. Click a candidate to apply:" with clickable candidate rows (each has a small "Use this" button)
  - If best-effort probe: show note "Probed as OpenAI-compatible (best effort)"
  - **"Apply to Form"** button
- **Apply to Form** fills:
  - `formName` ← if registry hit: `registry.slug`. Else: domain-based slug (`fireworks-ai` from `fireworks.ai`)
  - `formDisplayName` ← result.name
  - `formDescription` ← result.description
  - `formConfig` ← merges `{ baseUrl: bestUrl, registrySlug: slug }` into existing JSON (single canonical URL field `baseUrl`; `registrySlug` enables ConnectProviderModal lookup)
  - `formTags` ← appends domain
- Apply does NOT auto-submit — admin reviews and can edit all fields before saving
- On error: `toast.error(message)`, form remains usable manually

### 7. Refactor ConnectProviderModal to use shared registry

**File:** `client/src/components/ConnectProviderModal.tsx`

Replace the local `PROVIDER_BASE_URLS` map with a slug-based lookup from the shared registry:

```ts
import { KNOWN_PROVIDERS, findProviderBySlug } from "@shared/provider-registry";

// Build slug-based lookup (slug → apiUrl)
const PROVIDER_API_URLS: Record<string, string> = Object.fromEntries(
  KNOWN_PROVIDERS
    .filter(p => p.apiUrl !== null)
    .map(p => [p.slug, p.apiUrl!])
);
```

In `handleProviderSelect`, when a catalog entry is selected:
1. Read `config.registrySlug` from the catalog entry (persisted by the discovery flow)
2. If found → look up `findProviderBySlug(registrySlug)` for base URL and auth type
3. Fallback: try matching `registryId` / `entry.name.toLowerCase()` as before

This replaces the fragile domain-string hack (`.replace(".com","")`) with stable slug-based linking.

### 8. Default workspace seeding (decoupled — separate commit)

**File:** `server/db.ts` — add:
```ts
export async function ensureDefaultWorkspace(): Promise<void>
```
- Query: `SELECT id FROM workspaces LIMIT 1`
- If no rows exist, insert `{ name: "Default", description: "System default workspace" }`
- Do NOT hardcode `ownerId`. Use `ownerId: null` if schema allows, or look up the first admin user if one exists, else use `1` as last resort with a `[Startup] WARNING: default workspace created with placeholder ownerId=1` log
- Idempotent, safe to call multiple times

**File:** `server/_core/index.ts` — in `startServer()`, after `runMigrations()`:
```ts
await ensureDefaultWorkspace();
```

---

## Files to Create/Modify

| # | Action | File | Purpose |
|---|--------|------|---------|
| 1 | **Create** | `shared/provider-registry.ts` | Shared known-providers registry with slugs, auth types, model paths |
| 2 | **Create** | `server/routers/ssrf-guard.ts` | SSRF validation (DNS, IP ranges, scheme, redirects) |
| 3 | **Create** | `server/routers/discover-provider.ts` | Website fetch + cheerio parse + API probe |
| 4 | **Edit** | `server/routers/catalog-manage.ts` | Add `discoverProvider` mutation |
| 5 | **Edit** | `client/src/pages/CatalogManagePage.tsx` | Add discover URL field + result card in Create form |
| 6 | **Edit** | `client/src/components/ConnectProviderModal.tsx` | Use shared registry by slug |
| 7 | **Edit** | `server/db.ts` | Add `ensureDefaultWorkspace()` |
| 8 | **Edit** | `server/_core/index.ts` | Call `ensureDefaultWorkspace()` on startup |

**New dependency:** `cheerio` (npm install)

---

## Verification

1. **Registry lookup**: Paste `https://fireworks.ai` → instant, source="registry", confidence 100
2. **Website discovery**: Paste unknown provider URL → fetches, extracts name+description, shows API candidates with confidence scores
3. **SSRF block**: Paste `http://169.254.169.254`, `http://127.0.0.1:8080`, `http://10.0.0.1` → all rejected with clear error
4. **Apply to form**: Click "Apply to Form" → name, displayName, description, config JSON populated
5. **Manual override**: Edit any auto-filled field before saving → works
6. **Error fallback**: Unreachable URL → toast error, form still usable
7. **ConnectProviderModal**: Shared registry works, slug-based lookup matches providers correctly
8. **Workspace seed**: Fresh DB restart → default workspace auto-created
9. **End-to-end on tunnel**: Discover → Create catalog entry → Connect with PAT → Health check passes

---

## Compliance Design Matrix

| Control Area | Step / Function | Inputs | Mandatory Checks (Server-side) | Decision / Gate | Outputs | Audit / Logs | Failure Handling |
|---|---|---|---|---|---|---|---|
| Governance: Suggestion vs Creation | Discovery = suggestion only | websiteUrl (admin) | Ensure discovery does not write to DB | Must return data for review only | DiscoverResult (candidates + confidence) | Log actor, domain, source, outcome | UI remains usable; manual entry allowed |
| Network Security: SSRF | validateExternalUrl() for every fetch + redirect hop | URL (input / redirect Location / candidate URL) | Scheme enforcement, URL hardening, DNS resolve v4/v6, blocked ranges, redirect cap, size cap, timeout cap | Allow only if safe; block otherwise | {safe:true} or {safe:false,error} | Log hostname + resolved IPs + block reason | Reject request with clear error; no partial fetch |
| Integrity: Redirect Handling | Manual redirect follow | current URL + Location | Resolve relative Location, re-run SSRF validation, cap hops and cumulative time | Follow only if validated | Next hop URL | Log each hop | Abort after 3 hops / timeout |
| Data Minimization | HTML fetch | homepage URL | 512KB max body, 8s total | Proceed only within caps | HTML snippet parsed | Log fetched bytes + timing | Abort read; return partial fields if possible |
| Extraction Robustness | Parse metadata | HTML | Use cheerio; extract name/description with ordered fallbacks | N/A | name, description | Log extraction source ("og", "jsonld", "title", "fallback") | If missing, return null fields |
| Candidate Safety | Candidate URL generation | HTML links/text + heuristics | Only generate https candidates; exclude obvious non-API hosts (cdn/assets) | N/A | candidates[] with evidence | Log candidate count | If none, return bestUrl null |
| Verification: Endpoint Plausibility | Candidate probing (discovery) | top N candidates | SSRF validate each candidate URL before probe; per-probe timeout 2s | Probe status interpretation | Attach {path,status,probeType} | Log probe attempts + statuses | Drop network-failing candidates |
| Correctness: BestUrl Selection | Choose bestUrl | ranked candidates | Require (200/401/403 OR confidence≥70) AND credible evidence (registry/base-url-text/api-subdomain) | Gate bestUrl assignment | bestUrl or null | Log selection rationale | If no candidate passes, bestUrl null |
| User Control | UI Apply | DiscoverResult | UI must not auto-apply silently; must show source + probeType + candidates | Apply only on user action | Form fields populated | Log client analytics (optional) | If bestUrl null, allow "Use candidate" manual apply |
| Catalog Integrity | Create provider entry | form fields | Validate schema; require admin privileges | Save only if valid | DB provider record incl. config.baseUrl, config.registrySlug? | Log DB write + actor | Reject with field-level errors |
| Linkage: Stable Identity | Persist registry linkage | registrySlug | Ensure slug is from registry or null | Gate: slug must be valid if present | config.registrySlug stored | Log slug association | If mismatch, drop slug + warn |
| Secrets Governance | Connect Provider (credentials) | provider config + auth inputs | Store secrets as refs; never store plaintext tokens in catalog | Gate: secret write success | secret ref + connection status | Log secret ref creation (no secret content) | If test fails, still allow save with warning (policy choice) |
| Runtime Health | Orchestrator health check | baseUrl + secrets + registry info | Prefer healthProbe if defined; never interpret 401/403 as "down" | Health classification rules | status: UP / AUTH_REQUIRED / DOWN | Structured logs + metrics | DOWN only on network/timeouts/5xx patterns |
| Capability Sync | Orchestrator model sync | baseUrl + secrets + modelsListProbe | Use modelsListProbe; parse response; treat 401/403 as auth issue | Update model inventory | models list cached/stored | Log sync count + timing | Don't mark provider down on 401/403 |

---

## Enforcement Rules (Policy-Style)

| Rule ID | Rule | Enforcement Point |
|---|---|---|
| SSRF-001 | Block any unsafe external URL (SSRF) for fetch/probe | `validateExternalUrl()` |
| DISC-001 | Discovery must not persist to DB | tRPC mutation + service |
| DISC-002 | Redirects require re-validation per hop | discovery fetch loop |
| DISC-003 | bestUrl requires probe OK OR high confidence + credible evidence | selection step |
| CAT-001 | Catalog create is separate from discovery | UI + server validation |
| ID-001 | Registry linkage uses registrySlug only | apply-to-form + server validate |
| AUTH-001 | 401/403 = reachable but auth required, not "down" | orchestrator + connect tests |
| SEC-001 | Secrets must be stored as refs, never plaintext | connect workflow |

---

## Required Audit Fields (minimum viable)

For each discovery request, log:
- `actorId` (admin)
- `inputUrl` (normalized)
- `domain`
- `source` (registry|website)
- `resolvedIPs` (array)
- `redirectHops` (count + targets)
- `candidatesCount`
- `probes` (url + path + status + probeType)
- `bestUrl` (or null)
- `warnings[]`

---

## Implementation Control Checklist

### 0) Scope & invariants
- [ ] Discovery never writes to DB (no implicit creation, no side effects beyond logs)
- [ ] Catalog creation remains the only persistence point
- [ ] Connect (secrets) remains separate from Catalog (metadata)

### 1) Shared registry correctness (single source of truth)
- [ ] KnownProvider includes: slug, name, domains, apiUrl|null, description, authType, isLocal, defaultLocalUrl?
- [ ] modelsListProbe strategy is explicit per provider
- [ ] healthProbe is optional; falls back to modelsListProbe if absent
- [ ] Local providers (Ollama/llama.cpp):
  - [ ] apiUrl === null
  - [ ] isLocal === true
  - [ ] defaultLocalUrl exists (optional) and is never used in remote discovery
- [ ] findKnownProvider(domain) normalizes:
  - [ ] strips www.
  - [ ] case-insensitive
  - [ ] supports subdomain match (foo.bar.com endsWith .bar.com)

### 2) SSRF guard (mandatory, reused everywhere)

**URL hardening**
- [ ] Reject userinfo (user:pass@host)
- [ ] Reject control / invisible characters in hostname
- [ ] Reject mixed-script hostnames (simple heuristic is acceptable)

**Scheme rules**
- [ ] HTTPS required in prod
- [ ] HTTP allowed only in dev with allowHttp flag

**Port policy**
- [ ] Allow only approved ports OR is configurable (ALLOWED_OUTBOUND_PORTS)
- [ ] Behavior is documented

**DNS + IP classification**
- [ ] Resolve both A and AAAA records
- [ ] Classify each resolved IP (public vs blocked)
- [ ] Block ranges include:
  - [ ] 127.0.0.0/8
  - [ ] 10.0.0.0/8
  - [ ] 172.16.0.0/12
  - [ ] 192.168.0.0/16
  - [ ] 169.254.0.0/16 (incl. 169.254.169.254)
  - [ ] 0.0.0.0
  - [ ] ::1
  - [ ] fc00::/7
  - [ ] fe80::/10
- [ ] Decision rule:
  - [ ] Block only if ALL resolved IPs are blocked
  - [ ] Log resolved IPs always

**Redirect enforcement**
- [ ] Fetch uses redirect: "manual"
- [ ] Location is resolved against current URL (relative redirects supported)
- [ ] SSRF validation runs per hop
- [ ] Max hops enforced (≤ 3)
- [ ] Cumulative timeout enforced (≤ 8s)

### 3) Website fetch limits (resource controls)
- [ ] Total timeout: ≤ 8s (AbortSignal)
- [ ] Response size cap: ≤ 512KB (stream abort)
- [ ] Content-type not trusted (still parse HTML defensively)
- [ ] All fetch errors return a clean error (no stack traces to client)

### 4) HTML parsing & metadata extraction (cheerio)
- [ ] Cheerio used (no regex parsing for meta/JSON-LD)
- [ ] Name extraction order implemented:
  - [ ] og:site_name
  - [ ] JSON-LD Organization.name
  - [ ] `<title>` cleaned
  - [ ] fallback: domain-based title
- [ ] Description extraction order:
  - [ ] meta[name="description"]
  - [ ] og:description
- [ ] Extraction output can be null without failing discovery

### 5) Candidate generation (safe + explainable)
- [ ] Candidate URLs generated from:
  - [ ] "Base URL: https://..." text patterns (strong evidence)
  - [ ] docs/dev links (/docs, /api, developers.)
  - [ ] heuristic https://api.{domain} (weak evidence)
- [ ] Each candidate includes:
  - [ ] url
  - [ ] confidence (0–100)
  - [ ] confidenceLabel derived from thresholds
  - [ ] evidence (optional but recommended)
- [ ] Candidate list is deduped + normalized (no trailing slash issues)

### 6) Candidate probing (governed + safe)
- [ ] Probe only top N candidates (N ≤ 3)
- [ ] SSRF validate each candidate URL before probing
- [ ] Per-probe timeout ≤ 2s
- [ ] Probe labeling:
  - [ ] "registry-probe" when registry provider + modelsListProbe config used
  - [ ] "openai-shape-best-effort" otherwise
- [ ] Status interpretation:
  - [ ] 200 → strong positive
  - [ ] 401/403 → reachable, auth required (still positive)
  - [ ] 404 → neutral
  - [ ] network error → remove candidate
- [ ] Probe results attached to candidate:
  - [ ] { path, status }
  - [ ] probeType

### 7) BestUrl selection gate (prevents bad autofill)
- [ ] Candidates ranked by confidence desc
- [ ] bestUrl only set if:
  - [ ] probe status in {200,401,403} OR confidence ≥ 70
  - [ ] AND credible evidence present:
    - [ ] extracted from "Base URL" text OR
    - [ ] registry match OR
    - [ ] api. subdomain plus another supporting signal
- [ ] If gate fails:
  - [ ] bestUrl = null
  - [ ] candidates still returned for manual selection

### 8) API response shape (must be stable)
- [ ] DiscoverResult includes:
  - [ ] name, description
  - [ ] source: registry|website
  - [ ] domain
  - [ ] api.bestUrl
  - [ ] api.candidates[] with probe fields + probeType
- [ ] Errors return a friendly message (SSRF block reason is OK to show)

### 9) UI controls (governed UX)
- [ ] Discover field appears only when:
  - [ ] !editingEntry && entryType === "provider"
- [ ] Search button shows loading + disabled during request
- [ ] Result card shows:
  - [ ] source badge (Registry/Website)
  - [ ] bestUrl + confidence label
  - [ ] candidate list expandable with probe status + probeType
- [ ] Apply behavior:
  - [ ] Does not auto-submit
  - [ ] Uses registry.slug when registry hit; else domain-based slug
  - [ ] Persists config.registrySlug when known
  - [ ] Persists single canonical config.baseUrl
- [ ] If bestUrl === null and candidates exist:
  - [ ] UI offers "Use this" per candidate row

### 10) ConnectProviderModal alignment (no drift)
- [ ] Reads config.registrySlug first
- [ ] Lookup by slug in shared registry
- [ ] Uses registry authType to render correct credential fields
- [ ] No domain-string hacks remain
- [ ] Fallback matching is allowed but clearly treated as legacy

### 11) Workspace bootstrap (separate commit)
- [ ] ensureDefaultWorkspace() is idempotent
- [ ] Does not hardcode ownerId unless unavoidable
- [ ] Logs warning if forced to use placeholder ownerId
- [ ] Not required for discovery to function

### 12) Logging & audit (minimum viable)
For each discovery run, log:
- [ ] actorId (admin)
- [ ] normalized input URL + domain
- [ ] resolved IP list
- [ ] redirect hops list
- [ ] candidate count + top candidates
- [ ] probe attempts (url/path/status/probeType)
- [ ] bestUrl (or null)
- [ ] warnings (e.g., best-effort probe)

---

## PR Review Template (GitHub Markdown)

### A) Scope & invariants
- [ ] Discovery does not persist to DB (no side effects beyond logs)
- [ ] Catalog create/save remains the only persistence point
- [ ] Connect/secrets flow remains separate from catalog metadata

### B) Shared Registry (single source of truth)
- [ ] KnownProvider includes slug, domains, apiUrl|null, authType, isLocal, defaultLocalUrl?
- [ ] Local providers have apiUrl=null and are never used in SSRF discovery
- [ ] findKnownProvider(domain) normalization works (www., subdomains, case)

### C) SSRF Guard (mandatory)
- [ ] URL hardening: rejects userinfo + control/invisible chars + mixed-script heuristic
- [ ] Scheme enforced: HTTPS in prod; HTTP only in dev with flag
- [ ] DNS resolves A + AAAA and logs all resolved IPs
- [ ] IP blocking covers private, link-local, metadata, loopback, ULA, etc.
- [ ] Decision rule: block only if ALL resolved IPs are blocked
- [ ] Redirect handling: relative Location resolved; SSRF re-check per hop; hop cap ≤3; cumulative timeout ≤8s

### D) Website Fetch Limits
- [ ] Total timeout enforced
- [ ] Response body capped (≤512KB) with stream abort
- [ ] Errors are sanitized (no stack traces returned to client)

### E) Parsing & Extraction
- [ ] Cheerio used (no regex parsing)
- [ ] Name/description extraction follows ordered fallbacks
- [ ] Null name/description does not fail discovery

### F) Candidate Generation & Probing
- [ ] Candidates carry confidence (0–100) and confidenceLabel
- [ ] Probe only top N (≤3)
- [ ] SSRF validate each candidate URL before probing
- [ ] Probe type labeled per candidate (registry-probe vs openai-shape-best-effort)
- [ ] Status interpretation: 200 strong, 401/403 reachable-auth, 404 neutral, network drops candidate

### G) Best URL Selection Gate (anti-garbage)
- [ ] bestUrl set only if (probe ok OR confidence≥70) AND credible evidence
- [ ] If gate fails: bestUrl=null but candidates still returned

### H) API Contract Stability
- [ ] DiscoverResult contains source, domain, api.bestUrl, api.candidates[].probeType/probe
- [ ] SSRF block reasons are user-friendly and safe to show

### I) UI Governance
- [ ] Discover field only shown for create provider (not edit)
- [ ] Loading state + disabled button during mutation
- [ ] Result card shows source badge + confidence + probe type
- [ ] Apply does not auto-submit
- [ ] If bestUrl=null and candidates exist: UI offers "Use this" per candidate

### J) ConnectProviderModal Alignment
- [ ] Uses config.registrySlug first, slug lookup in shared registry
- [ ] Removes domain-string hacks
- [ ] Credential fields driven by registry authType
- [ ] Legacy fallback matching remains but is secondary

### K) Audit Logging
- [ ] Logs include actorId, normalizedUrl, resolvedIPs, redirect hops, probes, bestUrl, warnings

---

## Test Plan

### Unit Tests

**SSRF Guard — URL hardening**
- Reject userinfo: `https://user:pass@example.com`
- Reject control chars: `https://exa\u0000mple.com`
- Reject mixed-script (heuristic): hostname with mixed ASCII + non-ASCII label chars
- Scheme policy:
  - prod: reject `http://example.com`
  - dev with allowHttp: allow `http://example.com`

**SSRF Guard — DNS/IP classification**
- Mock DNS results:
  - All blocked → reject (localhost → 127.0.0.1, internal → 10.0.0.5)
  - Mixed blocked + public → allow (return [10.0.0.1, 93.184.216.34] → allow)
  - IPv6 blocked cases: ::1, fc00::1, fe80::1 → reject

**Redirect handling**
- Relative redirect resolution: from `https://a.com/x` Location: `/y` → `https://a.com/y`
- Hop cap: chain 4 redirects → reject with "too many redirects"
- Revalidation per hop: first hop public, second hop resolves to private IP → reject

**Website fetch caps**
- Stream exceeds 512KB → abort, return controlled error
- Timeout reached → abort, return controlled error

**Candidate ranking and bestUrl gate**
- Candidate A: confidence 20, probe 403, evidence only heuristic → must NOT become bestUrl unless credible evidence exists
- Candidate B: confidence 50, evidence base-url text, probe 401 → bestUrl set
- Candidate C: confidence 80 no probe → bestUrl set only if credible evidence present

**Probe labeling**
- Registry match → candidates get probeType="registry-probe"
- Unknown provider → candidates get probeType="openai-shape-best-effort"

### Integration Tests (API-level)

**Discover — registry fast path**
- Input: `https://fireworks.ai`
- Assert: source="registry", api.bestUrl equals registry apiUrl, no website fetch performed (mock fetch not called)

**Discover — website scrape path**
- Input: `https://unknown.example`
- Mock HTML includes meta description + "Base URL: https://api.unknown.example"
- Assert: name/description extracted, candidates include base-url text candidate with higher confidence, probes run for top 3, bestUrl selected by gate rules

**Discover — SSRF blocked**
- Input: `http://169.254.169.254`
- Assert: error returned (safe message), no fetch performed, log includes block reason

**Discover — bestUrl null but candidates exist**
- Mock candidates all probe 404/timeout, confidence < 70
- Assert: bestUrl null, candidates returned, UI can use candidate apply

### UI Tests (component / e2e)

**Discover field visibility**
- Create provider: visible
- Edit provider: hidden
- Create non-provider type: hidden

**Apply flow**
- On success, clicking Apply to Form:
  - sets formName (registry slug or domain slug)
  - sets displayName/description
  - merges config.baseUrl + config.registrySlug

**When bestUrl null:**
- candidate list shows "Use this"
- clicking candidate applies that url to baseUrl

**Probe type note**
- When probeType is best-effort: UI shows "OpenAI-compatible (best effort)" note

### Operational Test (manual)

- Run server behind tunnel
- Discover → Create catalog entry → Connect with PAT → verify connection test uses registrySlug lookup
