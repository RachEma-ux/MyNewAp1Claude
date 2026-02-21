# Workflow Builder Production Compliance TODO

**Goal:** Make the Workflow Builder fully production-ready  
**Based on:** Compliance Audit Report (Jan 2, 2026)  
**Estimated Total Effort:** 6-8 weeks (1 developer)

---

## 🔴 CRITICAL PRIORITY (Week 1-2) - MUST FIX BEFORE ANY PRODUCTION USE

### 1. Schema Versioning & Migration System
- [ ] Add `schemaVersion` field to workflows table (INT, default 1)
- [ ] Create migration function `migrateWorkflow(workflow, targetVersion)`
- [ ] Add version check on workflow load
- [ ] Write migration tests for v1 → v2 transitions
- [ ] Document schema version changelog
- [ ] Add schema version to workflow export/import

### 2. Workflow Validation System
- [ ] Create `server/automation/validation.ts` with structured validation
- [ ] Implement validation error interface (severity, code, message, location)
- [ ] Add validation: workflow must have at least one trigger node
- [ ] Add validation: detect disconnected nodes (orphaned subgraphs)
- [ ] Add validation: detect cycles (infinite loops)
- [ ] Add validation: check required node config fields are present
- [ ] Add validation: check edge source/target nodes exist
- [ ] Add validation: prevent duplicate node IDs
- [ ] Create shared validation library (use on both client and server)
- [ ] Add validation tests (unit tests for each validation rule)
- [ ] Block workflow save if validation errors exist
- [ ] Show structured validation errors in UI (not just toast)
- [ ] Add "Validate" button in builder UI
- [ ] Add validation status indicator (✓ Valid / ⚠️ Warnings / ✗ Errors)

### 3. Publish/Draft Separation & Versioning
- [ ] Create `workflow_versions` table with schema:
  - [ ] id (PK)
  - [ ] workflowId (FK)
  - [ ] version (INT, incremental)
  - [ ] nodes (TEXT, JSON)
  - [ ] edges (TEXT, JSON)
  - [ ] schemaVersion (INT)
  - [ ] publishedAt (TIMESTAMP)
  - [ ] publishedBy (FK to users)
  - [ ] changeNotes (TEXT)
  - [ ] status (ENUM: published, archived)
- [ ] Add `publishedVersionId` field to workflows table (FK to workflow_versions)
- [ ] Add `draftData` JSON field to workflows table (unpublished changes)
- [ ] Update workflow status enum: add "validated", "published", "archived"
- [ ] Implement `publishWorkflow()` function (creates immutable snapshot)
- [ ] Implement `createDraft()` function (copies published to draft)
- [ ] Implement `rollbackToVersion()` function (restore older version)
- [ ] Add tRPC mutation: `automation.publishWorkflow`
- [ ] Add tRPC mutation: `automation.rollbackToVersion`
- [ ] Add tRPC query: `automation.getWorkflowVersions`
- [ ] Add "Publish" button in builder UI (only enabled if validated)
- [ ] Add "Version History" panel in builder UI
- [ ] Add "Rollback to this version" action in version history
- [ ] Show published vs draft indicator in workflow list
- [ ] Prevent editing published workflows directly (must create draft first)
- [ ] Add optimistic concurrency control (etag or version check)
- [ ] Write tests for publish/rollback flow

---

## 🟠 MAJOR PRIORITY (Week 3-4) - BLOCKS PRODUCTION READINESS

### 4. Execution Persistence to Database
- [ ] Create `workflow_executions` table with schema:
  - [ ] id (VARCHAR 36, UUID, PK)
  - [ ] workflowId (INT, FK)
  - [ ] workflowVersionId (INT, FK to workflow_versions)
  - [ ] correlationId (VARCHAR 36, for tracing)
  - [ ] status (ENUM: queued, running, completed, failed, cancelled)
  - [ ] startedAt (TIMESTAMP)
  - [ ] completedAt (TIMESTAMP)
  - [ ] duration (INT, milliseconds)
  - [ ] triggerData (JSON)
  - [ ] error (TEXT)
  - [ ] retryCount (INT, default 0)
  - [ ] executedBy (INT, FK to users)
  - [ ] priority (INT)
- [ ] Create `node_execution_logs` table with schema:
  - [ ] id (INT, PK)
  - [ ] executionId (VARCHAR 36, FK)
  - [ ] nodeId (VARCHAR 100)
  - [ ] nodeType (VARCHAR 100)
  - [ ] startedAt (TIMESTAMP)
  - [ ] completedAt (TIMESTAMP)
  - [ ] duration (INT, milliseconds)
  - [ ] status (ENUM: running, completed, failed, skipped)
  - [ ] input (JSON, redacted)
  - [ ] output (JSON, redacted)
  - [ ] error (TEXT)
  - [ ] retryAttempt (INT, default 0)
- [ ] Update execution engine to persist to database (not just in-memory)
- [ ] Add `db.createExecution()` function
- [ ] Add `db.updateExecutionStatus()` function
- [ ] Add `db.createNodeExecutionLog()` function
- [ ] Add `db.getExecutionById()` function
- [ ] Add `db.getExecutionsByWorkflow()` function
- [ ] Update tRPC queries to read from database
- [ ] Add execution retention policy (delete old executions after 90 days)
- [ ] Write tests for execution persistence

### 5. Node Registry with Typed Configs & Execution Handlers
- [ ] Create `server/automation/node-registry.ts` with NodeDefinition interface
- [ ] Define NodeDefinition interface:
  - [ ] type (string)
  - [ ] category (trigger | action | condition)
  - [ ] displayName (string)
  - [ ] icon (string)
  - [ ] defaultConfig (object)
  - [ ] configSchema (Zod schema)
  - [ ] execute (async function)
  - [ ] uiComponent (optional, path to custom React component)
- [ ] Implement Time Trigger node:
  - [ ] Config schema (schedule: cron string, timezone: string)
  - [ ] Execution handler (cron scheduling logic)
  - [ ] Default config (daily at midnight UTC)
- [ ] Implement Webhook Trigger node:
  - [ ] Config schema (url: string, method: GET/POST, headers: object)
  - [ ] Execution handler (HTTP webhook logic)
  - [ ] Default config
- [ ] Implement File Upload Trigger node:
  - [ ] Config schema (path: string, fileTypes: array)
  - [ ] Execution handler (file upload detection)
  - [ ] Default config
- [ ] Implement Database Query Action node:
  - [ ] Config schema (query: string, params: object)
  - [ ] Execution handler (SQL execution)
  - [ ] Default config
- [ ] Implement AI Processing Action node:
  - [ ] Config schema (prompt: string, model: string, temperature: number)
  - [ ] Execution handler (LLM invocation)
  - [ ] Default config
- [ ] Implement Send Email Action node:
  - [ ] Config schema (to: string, subject: string, body: string)
  - [ ] Execution handler (email sending)
  - [ ] Default config
- [ ] Implement Run Code Action node:
  - [ ] Config schema (code: string, language: javascript/python)
  - [ ] Execution handler (sandboxed code execution)
  - [ ] Default config
- [ ] Implement Send Message Action node:
  - [ ] Config schema (channel: string, message: string)
  - [ ] Execution handler (message sending)
  - [ ] Default config
- [ ] Add node config validation on save
- [ ] Add node config editor UI (modal/drawer)
- [ ] Add node config form generation from Zod schema
- [ ] Update execution engine to use node registry handlers
- [ ] Add node migration handling (breaking config changes)
- [ ] Write tests for each node type execution

### 6. Audit Log System
- [ ] Create `workflow_audit_log` table with schema:
  - [ ] id (INT, PK)
  - [ ] workflowId (INT, FK)
  - [ ] userId (INT, FK)
  - [ ] action (ENUM: create, edit, publish, execute, delete, rollback)
  - [ ] changes (JSON, diff of what changed)
  - [ ] metadata (JSON, additional context)
  - [ ] ipAddress (VARCHAR 45)
  - [ ] userAgent (TEXT)
  - [ ] timestamp (TIMESTAMP)
- [ ] Add `db.createAuditLog()` function
- [ ] Add audit logging to workflow create
- [ ] Add audit logging to workflow edit
- [ ] Add audit logging to workflow publish
- [ ] Add audit logging to workflow execute
- [ ] Add audit logging to workflow delete
- [ ] Add audit logging to workflow rollback
- [ ] Add tRPC query: `automation.getAuditLog`
- [ ] Add "Audit Log" tab in workflow detail view
- [ ] Add audit log filtering (by action, user, date range)
- [ ] Add audit log export (CSV)
- [ ] Write tests for audit logging

### 7. Permissions & Access Control
- [ ] Create `workflow_permissions` table with schema:
  - [ ] id (INT, PK)
  - [ ] workflowId (INT, FK)
  - [ ] userId (INT, FK)
  - [ ] permission (ENUM: view, edit, publish, execute)
  - [ ] grantedBy (INT, FK to users)
  - [ ] grantedAt (TIMESTAMP)
- [ ] Add `db.grantPermission()` function
- [ ] Add `db.revokePermission()` function
- [ ] Add `db.checkPermission()` function
- [ ] Add `db.getUserPermissions()` function
- [ ] Add permission check to workflow edit mutation
- [ ] Add permission check to workflow publish mutation
- [ ] Add permission check to workflow execute mutation
- [ ] Add permission check to workflow delete mutation
- [ ] Add tRPC mutation: `automation.grantPermission`
- [ ] Add tRPC mutation: `automation.revokePermission`
- [ ] Add tRPC query: `automation.getWorkflowPermissions`
- [ ] Add "Share" button in workflow detail view
- [ ] Add permission management UI (add/remove users, set permissions)
- [ ] Add permission indicator in workflow list (shared icon)
- [ ] Write tests for permission enforcement

### 8. Autosave & Dirty State Tracking
- [ ] Add `isDirty` state to AutomationBuilder
- [ ] Track changes to nodes, edges, workflow name
- [ ] Add "unsaved changes" indicator in UI (dot next to workflow name)
- [ ] Implement autosave to localStorage every 30 seconds
- [ ] Add `beforeunload` event handler (warn before navigation if dirty)
- [ ] Add wouter navigation guard (warn before route change if dirty)
- [ ] Add "Discard changes" button
- [ ] Add "Restore from autosave" on load (if autosave exists)
- [ ] Clear autosave after successful save
- [ ] Add autosave timestamp indicator ("Last autosaved 2 minutes ago")
- [ ] Write tests for autosave logic

### 9. Execution Replay & Observability UI
- [ ] Add "View Execution" button in executions list
- [ ] Create execution replay view (loads workflow with execution overlay)
- [ ] Highlight executed nodes in green (completed) or red (failed)
- [ ] Highlight executed edges (show execution path)
- [ ] Add node execution timeline (horizontal bar chart)
- [ ] Add per-node execution details panel:
  - [ ] Start/end time
  - [ ] Duration
  - [ ] Status
  - [ ] Input data (redacted)
  - [ ] Output data (redacted)
  - [ ] Error message (if failed)
  - [ ] Retry attempts
- [ ] Add execution metrics dashboard:
  - [ ] Total executions
  - [ ] Success rate
  - [ ] Average duration
  - [ ] Failure rate by node type
  - [ ] Retry count distribution
- [ ] Add execution filtering (by status, date range, workflow)
- [ ] Add execution search (by execution ID, correlation ID)
- [ ] Write tests for execution replay UI

### 10. Undo/Redo System
- [ ] Implement history stack (array of workflow states)
- [ ] Add `undo()` function (pop from history, restore previous state)
- [ ] Add `redo()` function (push to redo stack, restore next state)
- [ ] Add Undo button in builder toolbar
- [ ] Add Redo button in builder toolbar
- [ ] Add keyboard shortcuts (Ctrl+Z for undo, Ctrl+Y for redo)
- [ ] Add history limit (max 50 states)
- [ ] Show undo/redo availability (disable buttons when stack empty)
- [ ] Clear redo stack on new change
- [ ] Persist history to localStorage (survive page refresh)
- [ ] Write tests for undo/redo logic

---

## 🟡 IMPORTANT PRIORITY (Week 5-6) - ENABLES COMPLEX WORKFLOWS

### 11. Conditional Branching & Logic
- [ ] Add `edgeType` field to edges (ENUM: default, conditional)
- [ ] Add `condition` field to edges (TEXT, expression)
- [ ] Update edge schema in database
- [ ] Create condition editor UI (modal with expression builder)
- [ ] Implement condition evaluation engine
- [ ] Add condition syntax documentation (variables, operators, functions)
- [ ] Add condition validation (syntax check)
- [ ] Update execution engine to evaluate conditions
- [ ] Add "Add Condition" button when connecting nodes
- [ ] Show condition label on conditional edges
- [ ] Add condition testing UI (test with sample data)
- [ ] Write tests for condition evaluation

### 12. Parallel Execution & Join Logic
- [ ] Add `parallelGroup` field to nodes (INT, optional)
- [ ] Add `joinType` field to nodes (ENUM: all, any, first)
- [ ] Update node schema in database
- [ ] Implement parallel execution in execution engine
- [ ] Implement join logic (wait for all/any/first)
- [ ] Add "Parallel Group" UI (group nodes visually)
- [ ] Add "Join Type" selector in node config
- [ ] Show parallel execution in execution replay (concurrent timelines)
- [ ] Write tests for parallel execution

### 13. Retry & Timeout Configuration
- [ ] Add `retryPolicy` field to nodes (JSON):
  - [ ] maxRetries (INT)
  - [ ] backoff (ENUM: linear, exponential)
  - [ ] retryDelay (INT, milliseconds)
- [ ] Add `timeout` field to nodes (INT, milliseconds)
- [ ] Add `onError` field to nodes (ENUM: stop, continue, retry)
- [ ] Update node schema in database
- [ ] Implement retry logic in execution engine
- [ ] Implement timeout logic in execution engine
- [ ] Add retry/timeout config UI in node config modal
- [ ] Show retry attempts in execution logs
- [ ] Show timeout errors in execution logs
- [ ] Write tests for retry/timeout logic

### 14. Variable System & Data Passing
- [ ] Add `variables` field to workflows (JSON):
  - [ ] name (string)
  - [ ] type (string | number | boolean | object | array)
  - [ ] defaultValue (any)
  - [ ] description (string)
- [ ] Add `inputs` field to nodes (JSON, variable references)
- [ ] Add `outputs` field to nodes (JSON, variable definitions)
- [ ] Update workflow schema in database
- [ ] Implement variable resolution in execution engine
- [ ] Add variable editor UI (workflow-level)
- [ ] Add variable selector UI (node-level inputs)
- [ ] Add variable validation (check references exist)
- [ ] Show variable values in execution replay
- [ ] Write tests for variable system

### 15. Workflow Templates & Cloning
- [ ] Add `isTemplate` field to workflows (BOOLEAN)
- [ ] Add `templateCategory` field to workflows (VARCHAR)
- [ ] Add `clonedFrom` field to workflows (INT, FK)
- [ ] Create workflow templates table (optional, for curated templates)
- [ ] Add tRPC mutation: `automation.cloneWorkflow`
- [ ] Add tRPC query: `automation.getTemplates`
- [ ] Add "Save as Template" button
- [ ] Add "Clone Workflow" button
- [ ] Add template gallery UI
- [ ] Create 5-10 starter templates:
  - [ ] Daily Email Report
  - [ ] Data Backup Workflow
  - [ ] Notification Scheduler
  - [ ] File Processing Pipeline
  - [ ] API Integration Workflow
- [ ] Write tests for cloning logic

---

## 🟢 POLISH PRIORITY (Week 7-8) - IMPROVES UX & DEVELOPER EXPERIENCE

### 16. Delete Confirmations & Safety Guards
- [ ] Add confirmation dialog for workflow delete
- [ ] Add confirmation dialog for node delete (if connected)
- [ ] Add confirmation dialog for edge delete
- [ ] Add confirmation dialog for discard changes
- [ ] Add "Are you sure?" text with impact description
- [ ] Add "Don't ask again" checkbox (store in localStorage)
- [ ] Write tests for confirmation dialogs

### 17. Custom Node Renderers
- [ ] Create custom node component for Time Trigger (show cron schedule)
- [ ] Create custom node component for Webhook (show URL)
- [ ] Create custom node component for Database Query (show SQL preview)
- [ ] Create custom node component for AI Processing (show model name)
- [ ] Create custom node component for Send Email (show recipient)
- [ ] Add node status indicator (configured vs unconfigured)
- [ ] Add node validation indicator (valid vs invalid config)
- [ ] Add node execution status indicator (in execution replay)
- [ ] Write tests for custom node renderers

### 18. Drag-and-Drop Block Placement
- [ ] Implement drag-and-drop from sidebar to canvas
- [ ] Add `onDrop` handler to ReactFlow
- [ ] Add `onDragStart` handler to block templates
- [ ] Show drop zone indicator on canvas
- [ ] Show block preview while dragging
- [ ] Remove click-to-place interaction (replace with drag-and-drop)
- [ ] Write tests for drag-and-drop

### 19. Connection Handles & Visual Feedback
- [ ] Add connection handles to nodes (small circles on edges)
- [ ] Style handles by type (input vs output)
- [ ] Add hover effect on handles
- [ ] Add connection validation (prevent invalid connections)
- [ ] Show connection preview while dragging
- [ ] Add connection type indicators (data vs control flow)
- [ ] Write tests for connection handles

### 20. Keyboard Shortcuts
- [ ] Add Ctrl+S (save workflow)
- [ ] Add Ctrl+Z (undo)
- [ ] Add Ctrl+Y (redo)
- [ ] Add Delete (delete selected node/edge)
- [ ] Add Ctrl+C (copy selected node)
- [ ] Add Ctrl+V (paste node)
- [ ] Add Ctrl+A (select all nodes)
- [ ] Add Escape (deselect all)
- [ ] Add Ctrl+F (search nodes)
- [ ] Add keyboard shortcuts help modal (?)
- [ ] Write tests for keyboard shortcuts

### 21. Search & Filter
- [ ] Add search bar in workflow list (search by name, description)
- [ ] Add filter by status (draft, published, active, paused)
- [ ] Add filter by owner (my workflows, shared with me)
- [ ] Add filter by last modified date
- [ ] Add sort by name, created date, last modified
- [ ] Add search in builder (find node by name)
- [ ] Write tests for search/filter

### 22. Workflow Export/Import
- [ ] Add "Export Workflow" button (download JSON)
- [ ] Add "Import Workflow" button (upload JSON)
- [ ] Add workflow validation on import
- [ ] Add schema version migration on import
- [ ] Add conflict resolution (if workflow ID already exists)
- [ ] Add bulk export (export all workflows)
- [ ] Add bulk import (import multiple workflows)
- [ ] Write tests for export/import

### 23. Workflow Scheduling (Cron Triggers)
- [ ] Add cron scheduler service (separate from execution engine)
- [ ] Add cron job registration on workflow publish
- [ ] Add cron job removal on workflow unpublish
- [ ] Add cron job update on workflow edit
- [ ] Add next run time calculation
- [ ] Add "Next Run" indicator in workflow list
- [ ] Add "Schedule" tab in workflow detail view
- [ ] Add manual trigger button (run now)
- [ ] Write tests for cron scheduling

### 24. Webhook Endpoints
- [ ] Create webhook endpoint: `POST /api/webhooks/:workflowId`
- [ ] Add webhook authentication (API key or signature)
- [ ] Add webhook payload validation
- [ ] Add webhook rate limiting
- [ ] Add webhook logging
- [ ] Generate webhook URL on workflow publish
- [ ] Show webhook URL in workflow detail view
- [ ] Add webhook testing UI (send test payload)
- [ ] Write tests for webhook endpoints

### 25. Performance Optimization
- [ ] Add database indexes:
  - [ ] workflows: userId, status, createdAt
  - [ ] workflow_executions: workflowId, status, startedAt
  - [ ] workflow_audit_log: workflowId, userId, timestamp
- [ ] Add pagination to workflow list (load 20 at a time)
- [ ] Add pagination to execution list (load 50 at a time)
- [ ] Add virtual scrolling for large node lists
- [ ] Add lazy loading for execution logs
- [ ] Add caching for workflow versions
- [ ] Add debouncing for autosave
- [ ] Optimize ReactFlow rendering (memoization)
- [ ] Write performance tests

### 26. Error Handling & User Feedback
- [ ] Add global error boundary
- [ ] Add error logging to server (Sentry or similar)
- [ ] Add user-friendly error messages (no stack traces)
- [ ] Add error recovery suggestions
- [ ] Add toast notifications for all actions
- [ ] Add loading states for all async operations
- [ ] Add skeleton loaders for workflow list
- [ ] Add empty states for all lists
- [ ] Write tests for error handling

### 27. Documentation
- [ ] Write user guide (how to create workflows)
- [ ] Write node reference (each node type with examples)
- [ ] Write API documentation (tRPC endpoints)
- [ ] Write developer guide (how to add new node types)
- [ ] Write deployment guide
- [ ] Write troubleshooting guide
- [ ] Add inline help tooltips in UI
- [ ] Add video tutorials (optional)

### 28. Testing & Quality Assurance
- [ ] Achieve 80%+ test coverage for automation module
- [ ] Add E2E tests:
  - [ ] Create workflow → add nodes → save → publish
  - [ ] Execute workflow → view logs → verify success
  - [ ] Edit workflow → rollback → verify restored
  - [ ] Share workflow → verify permissions
- [ ] Add load testing (100 concurrent executions)
- [ ] Add stress testing (1000 workflows)
- [ ] Add security testing (SQL injection, XSS)
- [ ] Add accessibility testing (WCAG 2.1 AA)
- [ ] Add browser compatibility testing (Chrome, Firefox, Safari, Edge)
- [ ] Add mobile responsiveness testing

---

## 📊 Progress Tracking

**Total Items:** 280+  
**Critical:** 47 items  
**Major:** 98 items  
**Important:** 58 items  
**Polish:** 77 items

**Estimated Effort:**
- Critical: 2 weeks (80 hours)
- Major: 2 weeks (80 hours)
- Important: 2 weeks (80 hours)
- Polish: 2 weeks (80 hours)
- **Total: 8 weeks (320 hours)**

---

## 🎯 Milestone Definitions

### Milestone 1: Safe Workflows (Week 2)
- ✅ Schema versioning implemented
- ✅ Validation system working
- ✅ Publish/draft separation complete
- **Gate:** Can save and publish workflows without data loss

### Milestone 2: Observable Workflows (Week 4)
- ✅ Execution persistence to database
- ✅ Node registry with execution handlers
- ✅ Audit log system
- ✅ Permissions model
- **Gate:** Can execute workflows and debug failures

### Milestone 3: Production-Ready (Week 6)
- ✅ Autosave and dirty state tracking
- ✅ Execution replay UI
- ✅ Undo/redo system
- ✅ Conditional branching
- ✅ Retry/timeout config
- **Gate:** Can deploy to production with confidence

### Milestone 4: Feature-Complete (Week 8)
- ✅ All polish items complete
- ✅ 80%+ test coverage
- ✅ Documentation complete
- ✅ Performance optimized
- **Gate:** Ready for public release

---

## 🚀 Quick Start (First 3 Tasks)

To get started immediately, tackle these three tasks first:

1. **Add schema versioning** (4 hours)
   - Add `schemaVersion` field to workflows table
   - Run migration: `pnpm db:push`
   - Update create/update functions to set version

2. **Implement basic validation** (8 hours)
   - Create `server/automation/validation.ts`
   - Add trigger check, disconnected node check
   - Block save on validation errors

3. **Create workflow_versions table** (4 hours)
   - Add table to schema
   - Run migration: `pnpm db:push`
   - Add `publishWorkflow()` function

**Total: 16 hours (2 days) → Achieves Milestone 1 foundation**

---

## 📝 Notes

- This list is based on the compliance audit report
- All items are actionable and specific
- Estimated times are for a single developer
- Items can be parallelized with multiple developers
- Some items may be split into smaller subtasks during implementation
- Priority can be adjusted based on business needs

**Last Updated:** January 2, 2026  
**Next Review:** After Milestone 1 completion
