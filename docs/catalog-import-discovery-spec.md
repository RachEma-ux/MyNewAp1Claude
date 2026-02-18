# Catalog Import & Discovery System

## Governed Ingestion Architecture Specification

---

## 1. Purpose

Establish a controlled Import & Discovery capability for the Catalog domain, transforming catalog onboarding from manual entry creation into a governed, auditable, and scalable ingestion pipeline.

This feature enables:

**External ingestion → Preview → Admin review → Draft catalog entries**

while ensuring:

- **Governance** – all imports are draft, require review, and undergo validation.
- **Audit readiness** – every operation is logged and traceable.
- **Tamper resistance** – client never sends raw data for persistence.
- **Scalability** – handles large imports with async processing and throttling.
- **Extensibility** – easy addition of new import methods.

---

## 2. Core Principles

1. **Discovery is separate from creation** – preview data is never directly persisted.
2. **No auto-activation** – all imported entries are draft and require review.
3. **Server owns validation** – client-side data is never trusted for final persistence.
4. **Import sessions** – every preview is stored server-side in a temporary, auditable session.
5. **Asynchronous processing** – long-running imports (registry syncs, file parsing) are queued.
6. **Security by default** – input validation, domain allowlisting, and rate limiting are mandatory.
7. **Partial success** – failures in bulk creation do not roll back successful entries.
8. **Feature-flagged rollout** – new capabilities are introduced gradually with toggle control.

---

## 3. User Flow (Wizard-Based)

### Step 0 — Entry Point

- Import button on CatalogManagePage
- Opens ImportDialog wizard

### Step 1 — Select Method

Dropdown options:

- API Discovery (OpenAI-compatible)
- File Import (JSON/CSV)
- Registry Sync (Ollama, HuggingFace)
- OpenAPI Spec (URL or file upload)

### Step 2 — Method-Specific Form

User provides required inputs (e.g., URL, API key, file, registry query).
For long-running methods, UI shows a loading indicator and polls for completion.

### Step 3 — Preview & Review

Server returns (or eventually returns) an Import Session containing:

- Normalized preview rows (unified schema)
- Summary statistics
- Duplicate/conflict indicators
- Validation issues per row

User:

- Reviews rows with filters (conflicts only, high risk only)
- Selects entries to import (duplicates unchecked by default)
- Can override conflicts with explicit acknowledgment (audited)

### Step 4 — Import Selected

Client sends only:

- `sessionId`
- `selectedTempIds`
- Optional override flags (e.g., `forceConflictImport`)

Server validates, re-checks duplicates (to catch changes since preview), and creates entries with:

- `status: "draft"`
- `origin: "discovery"`
- `reviewState: "needs_review"`

Returns partial success report; UI allows retry of failed rows if session still active.

---

## 4. Import Sessions (Mandatory)

### Problem Solved

Passing raw preview data from client to bulkCreate allows tampering, duplicates payload, and prevents audit traceability. Import Sessions solve this by storing all preview data server-side.

### Import Session Schema

```typescript
interface ImportSession {
  id: string;                // unique session ID
  userId: string;            // creator
  method: ImportMethod;      // api, file, registry, openapi
  sourceRef: string;         // e.g., URL, filename, registry query
  previewData: PreviewEntry[]; // normalized rows
  summary: PreviewSummary;   // counts, duplicate stats, risk breakdown
  status: SessionStatus;     // "pending" | "processing" | "ready" | "expired" | "failed"
  error?: string;            // if status === "failed"
  createdAt: Date;
  expiresAt: Date;           // TTL (e.g., 24 hours after ready)
  completedAt?: Date;        // when preview generation finished
}
```

### Storage & Lifecycle

- **Store:** Persistent database (PostgreSQL) with TTL index; optionally use Redis for active session caching.
- **Cleanup:** Scheduled job removes expired sessions; associated files (uploaded specs) are deleted.
- **TTL:** 24 hours after `completedAt`; sessions in `pending` or `processing` expire after 1 hour to prevent orphaned jobs.

### Asynchronous Preview Generation

For methods that may exceed API timeouts (registry syncs, large files):

1. Discovery endpoint returns immediately with `sessionId` and `status: "pending"`.
2. Backend enqueues a job (BullMQ, Sidekiq) to process the request.
3. Client polls a `getSessionStatus` endpoint until status becomes `ready` or `failed`.
4. Once ready, client fetches preview via `getPreview(sessionId)`.

This keeps the UI responsive and prevents request timeouts.

---

## 5. Unified Preview Shape

All discovery methods must return the same schema to enable method-agnostic UI components.

```typescript
interface PreviewEntry {
  tempId: string;                   // client-side reference (UUID)
  type: "provider" | "model" | "endpoint";
  name: string;
  description?: string;
  source: string;                   // e.g., "openai", "ollama", "upload"
  metadata: Record<string, any>;    // original source fields
  duplicateStatus: DuplicateStatus;
  riskLevel: RiskLevel;
  validationIssues: ValidationIssue[];
}

type DuplicateStatus = "none" | "exact_match" | "similar_name" | "conflict";
type RiskLevel = "low" | "medium" | "high";

interface ValidationIssue {
  code: string;        // e.g., "missing_field", "invalid_url"
  message: string;
  severity: "error" | "warning";
}
```

### Duplicate Status Details

- **exact_match:** same external ID or unique identifier.
- **similar_name:** name is within configurable similarity threshold (e.g., Levenshtein distance < 3).
- **conflict:** same name but different type or provider; requires manual resolution.

Risk levels are assigned by policy rules (e.g., blacklisted domains, untrusted sources).

---

## 6. Deduplication & Conflict Detection

Server performs deduplication checks before returning a preview. Checks are configurable per method and globally.

### Detection Mechanisms

- **Stable external ID** (if available) – highest confidence.
- **Name + type + provider** – exact match.
- **Fuzzy name matching** – configurable algorithm (e.g., trigram similarity, Levenshtein) with threshold.
- **Endpoint signature** – for endpoints, compare URL path patterns and methods.
- **Metadata fingerprint** – hash of selected fields to detect similar entries.

### Configuration

Deduplication rules are defined in a policy file (JSON/YAML) and can be overridden by administrators. Example:

```yaml
deduplication:
  exact_match_fields: ["externalId"]
  fuzzy_name_threshold: 0.8  # similarity score
  conflict_when:
    - same_name_different_type
    - same_name_different_provider
```

### User Override

For `similar_name` and `conflict`, the UI allows selection with a warning. When user imports a conflicting entry, the server logs an override event and creates the entry (still draft) with a flag `overrideReason: "user_acknowledged_conflict"`. This ensures auditability.

---

## 7. Caps & Throttling

To prevent abuse and maintain performance, multi-level limits are enforced.

### Global Limits (default, configurable)

- `maxPreviewRows`: 500
- `maxImportRows`: 200 per bulkCreate
- `maxFileSize`: 10 MB
- `maxRegistryPages`: 5 (pagination)
- `rateLimit`: 10 discovery requests per minute per user

### Per-Method Overrides

- **API Discovery:** maxPreviewRows = 100, timeout = 10s
- **File Import:** maxFileSize = 5 MB (JSON/CSV only)
- **Registry Sync:** maxRegistryPages = 3, pageSize = 50
- **OpenAPI Spec:** maxFileSize = 2 MB, timeout = 30s

### Security Enforcements

- Domain allowlist for API Discovery (mandatory, default empty = deny all)
- File type restrictions – only JSON, CSV, YAML (with MIME validation)
- SSRF protection – block private IP ranges in registry/API calls

All limits are returned in error messages when exceeded, and logged.

---

## 8. Audit Logging

Every import session generates a structured log entry, stored in a dedicated `import_audit_logs` table and shipped to central logging.

```json
{
  "sessionId": "abc123",
  "userId": "user_456",
  "method": "file",
  "sourceRef": "my_models.csv",
  "timestamp": "2025-02-18T10:00:00Z",
  "previewCount": 150,
  "selectedCount": 120,
  "createdCount": 118,
  "skippedCount": 2,
  "conflictOverrides": 1,
  "highRiskCount": 3,
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/..."
}
```

### Retention & Queryability

- Logs retained for 1 year (compliance requirement).
- Sessions are queryable via admin UI by user, method, date range.
- Full preview data is not logged (PII concerns), but summary and row-level outcomes (without names) may be stored.

---

## 9. Partial Failure Reporting

`bulkCreate` returns a granular report so the UI can inform the user and allow retries.

```typescript
interface BulkCreateResult {
  created: number;
  skipped: number;
  rowResults: Array<{
    tempId: string;
    outcome: "created" | "skipped" | "error";
    reason?: string;           // e.g., "duplicate", "validation_failed"
    catalogEntryId?: string;   // if created
  }>;
  errors: string[];            // fatal errors (e.g., session expired)
}
```

### UI Behavior

- Show success banner with counts.
- Display a table of failed rows with reasons and a "Retry selected" button.
- Retry uses the same `sessionId` and `selectedTempIds` of failed rows; server re-validates (duplicate checks may have changed).

Retry is only allowed if session is still active (`status === "ready"` and not expired).

---

## 10. Validation Pipeline

Before persisting any entry, the server runs a pipeline:

1. **Schema validation** – required fields, correct types.
2. **Business rule validation** – e.g., provider must exist, endpoint paths valid.
3. **Governance enforcement** – matches catalog policies (naming conventions, allowed types).
4. **Deduplication re-check** – because new entries may have been added since preview.
5. **Policy constraints** – e.g., blacklisted terms, required metadata.
6. **Risk annotation** – if source domain is untrusted, mark as high risk.
7. **Conflict override audit** – if user forced import, log override reason.

Any validation failure prevents that row from being created; the failure is reported in `rowResults`.

---

## 11. Import Methods

Each method implements the same pattern: input → (maybe async) → preview session.

### A. API Discovery

- **Input:** baseUrl, apiKey (optional)
- **Logic:**
  - Validate domain against allowlist.
  - Call `/v1/models` (OpenAI-compatible).
  - Apply row limit and timeout.
- **Output:** Normalized `PreviewEntry[]`.

### B. File Import

- **Input:** file (JSON, CSV, YAML)
- **Logic:**
  - Parse and validate structure.
  - Map to unified preview shape (configurable field mapping).
  - Apply row limit.
- **Async:** If file > 1 MB, process in background.

### C. Registry Sync

- **Input:** registry (e.g., "ollama"), query (optional), page (optional)
- **Logic:**
  - Call registry API with pagination (max pages enforced).
  - Normalize results (registry-specific adapters).
  - Apply caps.
- **Async:** Always async because registry APIs may be slow.

### D. OpenAPI Spec

- **Input:** specUrl or file
- **Logic:**
  - Parse OpenAPI (v2/v3) using a robust library.
  - Extract servers, paths, operations → infer providers and endpoints.
  - Handle complex specs (multiple servers, security) by taking first server and ignoring complex schemas.
  - Provide warnings in `validationIssues` if spec is partially parsed.
- **Async:** For large specs, background processing.

---

## 12. Preview Table (UI)

The preview table displays rows with:

- **Name** (with tooltip for description)
- **Type** (badge)
- **Exists?** – duplicate status badge (exact_match, similar_name, conflict)
- **Risk** – badge with color (low/medium/high)
- **Source** – e.g., API URL, filename
- **Validation** – warning icon if issues exist (hover to see messages)
- **Select** – checkbox (disabled for exact_match, optional for others with warning)

### Enhancements

- "Select All Non-Duplicates" button.
- Filters: show only conflicts, only high risk, only with validation warnings.
- Summary banner: "150 discovered, 12 duplicates, 3 conflicts, 5 high risk".
- If preview is async, show skeleton loading and poll for completion.

---

## 13. Backend API Design (tRPC)

### Router: catalogImport

All discovery endpoints are mutations because they create server-side sessions (state change). For async methods, they return immediately with session ID and status.

```typescript
// Discovery endpoints (mutations)
discoverFromApi: (input: { baseUrl: string; apiKey?: string }) => Promise<{ sessionId: string; status: SessionStatus }>;
parseFile: (input: { file: File }) => Promise<{ sessionId: string; status: SessionStatus }>;
searchRegistry: (input: { registry: string; query?: string; page?: number }) => Promise<{ sessionId: string; status: SessionStatus }>;
parseOpenApiSpec: (input: { source: { url?: string; file?: File } }) => Promise<{ sessionId: string; status: SessionStatus }>;

// Session status polling (query)
getSessionStatus: (input: { sessionId: string }) => Promise<{ status: SessionStatus; summary?: PreviewSummary }>;

// Fetch preview when ready (query)
getPreview: (input: { sessionId: string }) => Promise<{ preview: PreviewEntry[]; summary: PreviewSummary }>;

// Bulk create (mutation)
bulkCreate: (input: { sessionId: string; selectedTempIds: string[]; forceConflicts?: boolean }) => Promise<BulkCreateResult>;
```

---

## 14. Implementation Order

1. **Core infrastructure**
   - Define unified preview schema and session storage (PostgreSQL).
   - Implement session CRUD with TTL and cleanup job.
   - Add feature flag `catalogImportV3` (disabled by default).
2. **API Discovery** (simplest method)
   - Implement `discoverFromApi` with basic validation and domain allowlist.
   - Implement `getSessionStatus` and `getPreview`.
   - Build UI wizard with polling.
3. **Bulk create with validation**
   - Implement `bulkCreate` with re-validation and partial success.
   - Add audit logging.
4. **Deduplication**
   - Implement detection logic for exact and fuzzy matches.
   - Integrate into preview generation.
5. **Caps & throttling**
   - Add configurable limits and rate limiting middleware.
6. **File import**
   - Implement `parseFile` with async processing.
7. **Registry sync**
   - Implement Ollama and HuggingFace connectors (async).
8. **OpenAPI spec parsing**
   - Implement with robust parser and fallback warnings.
9. **UI enhancements**
   - Filters, select all non-duplicates, retry mechanism.
10. **Admin configuration UI**
    - Allow tuning of deduplication thresholds, caps, allowlists.
11. Enable feature flag for beta users, then gradually roll out.

---

## 15. Security Considerations

- **Input validation:** All user inputs (URLs, files) are validated and sanitized.
- **Domain allowlist:** Enforced for all external calls; default empty.
- **File scanning:** Uploaded files are scanned for malware (ClamAV) and rejected if infected.
- **Rate limiting:** Per user and per IP to prevent abuse.
- **Audit trail:** All imports are logged; overrides are flagged.
- **Session IDs:** Cryptographically random, hard to guess.

---

## 16. Architectural Impact

This feature evolves the catalog from a static curated registry to a governed ingestion pipeline. It lays the foundation for future capabilities:

- Scheduled registry syncs
- Drift detection (compare imported vs. current)
- Automated policy enforcement
- Version comparison and rollback
- Compliance reporting (e.g., which imports came from untrusted sources)

---

## 17. Final Characteristics

The Import system achieves:

- **Secure** – client cannot manipulate persisted data.
- **Tamper-resistant** – server revalidates at every step.
- **Audit-ready** – full traceability of imports.
- **Governance-aligned** – drafts, reviews, policy checks.
- **Scalable** – async processing and throttling.
- **Extensible** – unified preview allows easy method addition.
- **Enterprise-grade** – meets compliance, security, and operational standards.

---
---

# Implementation Plan: Catalog Import & Discovery System

## Overview

This plan outlines the phased development of the governed ingestion pipeline.

---

## Phase 0: Foundation

**Goal:** Establish core data models, session management, and basic plumbing.

### Tasks

#### 0.1 Database Schema

- **Task 0.1.1:** Create `import_sessions` table
  - Fields: `id` (UUID, PK), `user_id` (FK to users), `method` (enum), `source_ref` (text), `preview_data` (JSONB), `summary` (JSONB), `status` (enum), `error` (text), `created_at` (timestamptz), `expires_at` (timestamptz), `completed_at` (timestamptz).
  - Add indexes on `user_id`, `status`, `expires_at`.
  - Estimate: 1 day
  - Dependencies: None
  - Acceptance: Migration runs successfully; schema validated.

- **Task 0.1.2:** Create `import_audit_logs` table
  - Fields: `id` (UUID, PK), `session_id` (FK), `user_id`, `method`, `source_ref`, `timestamp`, `preview_count`, `selected_count`, `created_count`, `skipped_count`, `conflict_overrides`, `high_risk_count`, `ip_address`, `user_agent`.
  - Estimate: 0.5 day
  - Acceptance: Table created; foreign key constraint to sessions.

#### 0.2 Session Service

- **Task 0.2.1:** Implement CRUD operations for import sessions
  - Functions: `createSession`, `getSession`, `updateSession`, `deleteSession`.
  - Include row-level security (RLS) policies if applicable.
  - Estimate: 2 days
  - Acceptance: Unit tests pass; can create and retrieve sessions.

- **Task 0.2.2:** Implement session cleanup job
  - Scheduled task (e.g., cron job) that deletes sessions where `expires_at < now()`.
  - Also delete associated temporary files (see 0.6).
  - Estimate: 1 day
  - Acceptance: Job runs daily; expired sessions removed; logs show deletions.

#### 0.3 Unified Preview Types

- **Task 0.3.1:** Define TypeScript types for `PreviewEntry`, `DuplicateStatus`, `RiskLevel`, `ValidationIssue`, `PreviewSummary`.
  - Export from a shared package (e.g., `@types/catalog-import`).
  - Estimate: 0.5 day
  - Acceptance: Types are used consistently across backend and frontend.

#### 0.4 Feature Flag

- **Task 0.4.1:** Add feature flag `catalogImportV3`
  - Use existing feature flag system (e.g., env var, database flag).
  - Ensure all new routes/components are gated.
  - Estimate: 0.5 day
  - Acceptance: Flag can be toggled; when off, import button hidden.

#### 0.5 tRPC Router Skeleton

- **Task 0.5.1:** Create `catalogImport` tRPC router with placeholder endpoints
  - Endpoints: `discoverFromApi`, `parseFile`, `searchRegistry`, `parseOpenApiSpec`, `getSessionStatus`, `getPreview`, `bulkCreate`.
  - All return `{ sessionId: string }` or appropriate.
  - Estimate: 1 day
  - Acceptance: Router mounts without errors; protected by auth middleware.

#### 0.6 Temporary File Storage

- **Task 0.6.1:** Set up storage for uploaded files
  - Option A: S3 bucket with 24h lifecycle policy.
  - Option B: Local disk with cleanup by session cleanup job.
  - Ensure file paths are stored in session records.
  - Estimate: 1 day
  - Acceptance: Files can be uploaded, retrieved, and are automatically deleted after expiry.

---

## Phase 1: API Discovery & Basic Wizard

**Goal:** Implement the simplest import method end-to-end, including UI wizard and bulk creation.

### Backend

- **Task 1.1:** Implement `discoverFromApi` mutation
  - Read domain allowlist from config (env).
  - Fetch `/v1/models` with timeout (10s).
  - Normalize response to `PreviewEntry[]`.
  - Create session with status `ready`, store preview.
  - Return `sessionId`.
  - Estimate: 3 days
  - Acceptance: Valid requests create sessions; invalid domains/timeouts return appropriate errors.

- **Task 1.2:** Implement `getSessionStatus` and `getPreview` queries
  - `getSessionStatus` returns status and summary (if ready).
  - `getPreview` returns preview rows only if session is ready.
  - Estimate: 1 day
  - Acceptance: Queries return correct data; error if session not found/expired.

- **Task 1.3:** Implement `bulkCreate` mutation
  - Validate session exists, not expired, belongs to user.
  - Re-validate selected rows (basic required fields).
  - Insert entries with `status: draft`, `origin: discovery`, `reviewState: needs_review`.
  - Return `BulkCreateResult`.
  - Add audit log entry.
  - Estimate: 3 days
  - Acceptance: Rows are created; partial failures reported; audit log written.

### Frontend

- **Task 1.4:** Add "Import" button to CatalogManagePage
  - Opens ImportDialog component (initially empty).
  - Estimate: 0.5 day
  - Acceptance: Button visible only when feature flag enabled.

- **Task 1.5:** Build ImportDialog wizard structure
  - Step 1: Method selection (only API Discovery initially).
  - Step 2: Form for baseUrl/apiKey.
  - Step 3: Preview table (basic columns: name, type, source, checkbox).
  - Step 4: Confirmation with summary and submit.
  - Use a state machine for steps.
  - Estimate: 3 days
  - Acceptance: Wizard flows correctly; back/next works.

- **Task 1.6:** Integrate API Discovery with backend
  - On step 2 submit, call `discoverFromApi`.
  - Handle response: if success, move to step 3 with preview data.
  - Show loading state.
  - Estimate: 2 days
  - Acceptance: Preview loads; errors displayed.

- **Task 1.7:** Implement bulk create submission
  - On step 4 submit, call `bulkCreate` with selected tempIds.
  - Display result banner (success/partial failure).
  - Allow retry of failed rows (simple retry button).
  - Estimate: 2 days
  - Acceptance: Entries created; UI shows results.

### Cross-cutting

- **Task 1.8:** Unit and integration tests
  - Backend: mock external API; test session creation, validation, audit log.
  - Frontend: test wizard flow with mock data.
  - Estimate: 3 days
  - Acceptance: Coverage >80% for new code.

- **Task 1.9:** Documentation update
  - Update API docs for new endpoints.
  - Write brief user guide for API Discovery import.
  - Estimate: 1 day
  - Acceptance: Docs reviewed and merged.

---

## Phase 2: Deduplication & Validation Pipeline

**Goal:** Add duplicate detection and comprehensive validation before preview and bulkCreate.

### Backend

- **Task 2.1:** Implement deduplication service
  - Exact match: query existing entries by `external_id` or `(name, type, provider)`.
  - Fuzzy match: use `pg_trgm` similarity or Levenshtein (configurable threshold).
  - Conflict detection: same name with different type/provider.
  - Expose function `annotateWithDuplicates(previewRows)`.
  - Estimate: 4 days
  - Acceptance: Returns correct `duplicateStatus` for various scenarios.

- **Task 2.2:** Enhance `discoverFromApi` to annotate preview
  - Call deduplication service before storing preview.
  - Add `riskLevel` based on simple rules (e.g., untrusted domain).
  - Populate `validationIssues` for schema violations.
  - Estimate: 1 day
  - Acceptance: Preview rows contain duplicate/risk/validation fields.

- **Task 2.3:** Implement full validation pipeline
  - Schema validation (required fields, formats).
  - Business rules (e.g., provider must exist for models).
  - Policy checks (blacklisted terms, required metadata).
  - Integrate into `bulkCreate` re-validation.
  - Estimate: 3 days
  - Acceptance: Rows failing validation are skipped with clear reasons.

### Frontend

- **Task 2.4:** Enhance preview table
  - Add duplicate badge with tooltip (colors: exact, similar, conflict).
  - Add risk badge (low/medium/high).
  - Add warning icon for validation issues; hover shows messages.
  - Disable checkboxes for `exact_match` by default.
  - Estimate: 3 days
  - Acceptance: UI reflects all new fields.

- **Task 2.5:** Implement "Select All Non-Duplicates" button
  - Selects all rows except `exact_match` and `conflict` (unless overridden).
  - Estimate: 1 day
  - Acceptance: Button works as expected.

### Testing

- **Task 2.6:** Test deduplication and validation
  - Unit tests for deduplication logic.
  - Integration test: import with duplicates, verify behavior.
  - UI test: badges and selection.
  - Estimate: 2 days
  - Acceptance: All tests pass.

---

## Phase 3: File Import (Async)

**Goal:** Add JSON/CSV file import with asynchronous processing.

### Backend

- **Task 3.1:** Implement `parseFile` mutation
  - Accept multipart file upload.
  - Validate size (<5MB) and type (JSON/CSV).
  - For small files (<1MB), process synchronously: parse, normalize, dedupe, create session with status `ready`.
  - For larger files, enqueue background job and create session with status `pending`.
  - Return `sessionId`.
  - Estimate: 4 days
  - Acceptance: Both sync and async paths work.

- **Task 3.2:** Set up background job infrastructure
  - Integrate BullMQ (or similar) with Redis.
  - Create job queue `import-processing`.
  - Estimate: 2 days
  - Acceptance: Jobs can be enqueued and processed.

- **Task 3.3:** Implement background job for file parsing
  - Parse CSV/JSON according to configurable field mapping.
  - Normalize to `PreviewEntry[]`.
  - Run deduplication and validation.
  - Update session with preview and status `ready` (or `failed` with error).
  - Delete temporary file.
  - Estimate: 4 days
  - Acceptance: Job updates session correctly; errors handled.

### Frontend

- **Task 3.4:** Add File Import to method selection
  - Step 2 form: drag-and-drop file upload.
  - Show file preview (name, size).
  - Estimate: 2 days
  - Acceptance: File can be selected/uploaded.

- **Task 3.5:** Handle async processing in UI
  - After upload, poll `getSessionStatus` every 2s.
  - Show progress indicator with estimated time.
  - Once status is `ready`, fetch preview and move to step 3.
  - Handle failure status.
  - Estimate: 3 days
  - Acceptance: UI shows loading and transitions correctly.

### Testing

- **Task 3.6:** Test file import
  - Upload small and large files.
  - Test malformed files.
  - Test async flow with mocked job.
  - Estimate: 3 days
  - Acceptance: All scenarios covered.

---

## Phase 4: Registry Sync

**Goal:** Add registry sync for Ollama and HuggingFace (extensible to others).

### Backend

- **Task 4.1:** Implement `searchRegistry` mutation
  - Input: registry (enum: "ollama", "huggingface"), query, page.
  - Create session with status `pending`, enqueue job.
  - Return `sessionId`.
  - Estimate: 2 days
  - Acceptance: Session created; job enqueued.

- **Task 4.2:** Implement registry-specific adapters
  - Ollama: call `/api/tags` (or similar).
  - HuggingFace: use search API with pagination.
  - Respect rate limits; implement retries.
  - Estimate: 4 days
  - Acceptance: Adapters return normalized data.

- **Task 4.3:** Background job for registry sync
  - Fetch from registry, apply caps (max pages).
  - Normalize, dedupe, validate.
  - Update session with preview.
  - Estimate: 3 days
  - Acceptance: Job completes successfully.

### Frontend

- **Task 4.4:** Add Registry Sync to method selection
  - Step 2 form: registry dropdown, optional query, page selector (or "load more").
  - Estimate: 2 days
  - Acceptance: UI for registry sync.

- **Task 4.5:** Handle async polling (reuse from file import)
  - Show loading state.
  - Estimate: 1 day
  - Acceptance: Polling works.

### Testing

- **Task 4.6:** Test registry sync
  - Mock registry APIs.
  - Test pagination and limits.
  - Test error cases (timeout, invalid registry).
  - Estimate: 3 days
  - Acceptance: Tests pass.

---

## Phase 5: OpenAPI Spec

**Goal:** Add OpenAPI spec import (URL or file upload).

### Backend

- **Task 5.1:** Implement `parseOpenApiSpec` mutation
  - Input: either `specUrl` or file.
  - Validate URL domain against allowlist; file size <2MB.
  - Create session with status `pending`, enqueue job.
  - Estimate: 2 days
  - Acceptance: Session created.

- **Task 5.2:** Background job for OpenAPI parsing
  - Use library (e.g., `swagger-parser`) to parse and resolve.
  - Extract servers → providers, paths → endpoints.
  - Add warnings for partially parsed elements.
  - Normalize to preview rows.
  - Run deduplication/validation.
  - Estimate: 5 days
  - Acceptance: Parsed correctly; warnings included.

### Frontend

- **Task 5.3:** Add OpenAPI Spec to method selection
  - Step 2: radio (URL or file upload) with conditional inputs.
  - Estimate: 2 days
  - Acceptance: UI for OpenAPI.

- **Task 5.4:** Show warnings in preview
  - Display warning icon with tooltip for rows with `validationIssues`.
  - Estimate: 1 day
  - Acceptance: Warnings visible.

### Testing

- **Task 5.5:** Test OpenAPI import
  - Use sample specs (v2, v3, with references).
  - Test URL and file upload.
  - Estimate: 3 days
  - Acceptance: All tests pass.

---

## Phase 6: UI Enhancements & Retry Logic

### Frontend

- **Task 6.1:** Add filters to preview table
  - Dropdowns: Show all, conflicts only, high risk only, with warnings.
  - Estimate: 2 days
  - Acceptance: Filters update table.

- **Task 6.2:** Summary banner
  - Display counts: total, duplicates, conflicts, high risk.
  - Estimate: 1 day
  - Acceptance: Banner updates with preview data.

- **Task 6.3:** Implement retry mechanism for failed rows
  - After bulkCreate, show list of failed rows with reasons.
  - "Retry selected" button that calls bulkCreate again with those tempIds.
  - Handle session expiry.
  - Estimate: 3 days
  - Acceptance: Retry works; errors handled.

- **Task 6.4:** Add conflict override option
  - For conflicting rows, enable checkbox with warning modal.
  - Send `forceConflicts: true` flag in bulkCreate.
  - Log override in audit.
  - Estimate: 2 days
  - Acceptance: Override works; audit logs show override.

### Backend

- **Task 6.5:** Enhance bulkCreate to accept `forceConflicts`
  - Skip duplicate check for those rows if flag true.
  - Add `conflict_overrides` count to audit log.
  - Estimate: 1 day
  - Acceptance: Override respected.

### Testing

- **Task 6.6:** Test UI enhancements and retry
  - Estimate: 3 days
  - Acceptance: All new features tested.

---

## Phase 7: Admin Configuration UI

### Backend

- **Task 7.1:** Create admin-only tRPC router for configuration
  - Endpoints: `getConfig`, `updateConfig`.
  - Store config in database (table `import_config`) or config file with DB override.
  - Estimate: 3 days
  - Acceptance: Config can be retrieved/updated by admin.

- **Task 7.2:** Apply configuration dynamically
  - Deduplication thresholds, caps, allowlist, risk rules are read from DB.
  - Estimate: 2 days
  - Acceptance: Changes take effect without restart.

### Frontend

- **Task 7.3:** Build admin settings page `/admin/import-settings`
  - Forms for each setting (thresholds, caps, allowlist).
  - Validation and save button.
  - Estimate: 4 days
  - Acceptance: Admins can view/update settings.

### Testing

- **Task 7.4:** Test admin configuration
  - Verify permissions (non-admin cannot access).
  - Test updates and dynamic application.
  - Estimate: 2 days
  - Acceptance: All tests pass.

---

## Phase 8: Security Review, Testing & Rollout

### Security & Hardening

- **Task 8.1:** Conduct security audit
  - Penetration testing on file upload, SSRF, domain allowlist.
  - Review audit logs for sensitive data exposure.
  - Fix any findings.
  - Estimate: 3 days
  - Acceptance: No critical vulnerabilities.

- **Task 8.2:** Implement rate limiting
  - Apply per-user and per-IP limits for discovery endpoints.
  - Use Redis for sliding window.
  - Estimate: 2 days
  - Acceptance: Rate limits enforced.

- **Task 8.3:** Integrate malware scanning for file uploads
  - Call ClamAV (or similar) before processing.
  - Reject infected files.
  - Estimate: 2 days
  - Acceptance: Infected files blocked.

### Load Testing

- **Task 8.4:** Perform load testing
  - Simulate concurrent imports, large files.
  - Monitor background job queue.
  - Tune performance if needed.
  - Estimate: 2 days
  - Acceptance: System handles expected load.

### Documentation

- **Task 8.5:** Update user and developer documentation
  - Include all import methods, admin settings, troubleshooting.
  - Estimate: 2 days
  - Acceptance: Docs reviewed and published.

### Rollout

- **Task 8.6:** Gradual feature rollout
  - Enable feature flag for internal users (dogfooding).
  - Monitor logs and metrics.
  - Fix issues; enable for beta customers.
  - Gradually increase to 100%.
  - Estimate: 3 days
  - Acceptance: Feature fully rolled out with no incidents.

---

## Summary

| Phase | Total Person-Days |
|-------|-------------------|
| 0 Foundation | 10 |
| 1 API Discovery | 20 |
| 2 Dedup/Validation | 15 |
| 3 File Import | 20 |
| 4 Registry Sync | 20 |
| 5 OpenAPI Spec | 20 |
| 6 UI Enhancements | 15 |
| 7 Admin UI | 15 |
| 8 Security/Rollout | 15 |
| **Total** | **150** (30 weeks for one person; 8-10 weeks for team of 3-4) |

---

## Dependencies & Risks

- **External API rate limits:** Registry syncs may hit rate limits; implement exponential backoff and caching.
- **OpenAPI parsing complexity:** Use well-maintained library; have fallback for unsupported features.
- **File upload security:** Scan for malware (ClamAV integration) – add to Phase 3.
- **Background job infrastructure:** Need Redis and job queue (BullMQ) – setup in Phase 0.
- **Feature flag management:** Use existing system (e.g., LaunchDarkly or simple env var).

---

## Success Criteria

- All import methods produce draft entries with correct metadata.
- Duplicate detection prevents pollution; conflicts are clearly flagged.
- Audit logs capture all imports and overrides.
- System handles large imports without performance degradation.
- Admin can configure policies without code changes.
- No security incidents related to import feature.
