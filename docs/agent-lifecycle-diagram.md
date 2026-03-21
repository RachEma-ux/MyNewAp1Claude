# Agent Full Lifecycle — A-to-Z Process Diagram

> MyNewAp1Claude / AI Types Platform

```
  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  PHASE 1: AGENT CREATION                                               ║
  ╚══════════════════════════════════════════════════════════════════════════╝

   User (Frontend)
        │
        ├─── Option A: From Scratch (AgentEditor wizard)
        │         │
        │         ▼
        │    ┌─────────────────────────────────┐
        │    │  createOrUpdateDraft (autosave)  │ ◄── Control Plane Router
        │    │  Step 1: Identity               │     POST /agents/draft
        │    │    • name, description, tags     │
        │    │    • roleClass, version          │
        │    │  Step 2: Definition (Anatomy)    │
        │    │    • systemPrompt               │
        │    │    • creationMode               │
        │    │  Step 3: Runtime                 │
        │    │    • modelId, temperature        │
        │    │  Step 4: Capabilities            │
        │    │    • hasDocumentAccess           │
        │    │    • hasToolAccess + allowedTools │
        │    │  Step 5: Limits                  │
        │    │    • maxTokens, dailyBudget      │
        │    │    • sandboxConstraints          │
        │    │    • expiresAt                   │
        │    └───────────────┬─────────────────┘
        │                   │
        ├─── Option B: From Template (AgentTemplates page)
        │         │
        │         ▼
        │    ┌─────────────────────────────────┐
        │    │  deployTemplate                  │ ◄── Agents Router
        │    │  Pre-defined templates:          │     POST /agents/deployTemplate
        │    │    • data-analyst                │
        │    │    • code-reviewer               │
        │    │    • content-writer              │
        │    │    • research-assistant           │
        │    │    • database-admin              │
        │    │    • email-assistant             │
        │    └───────────────┬─────────────────┘
        │                   │
        ├─── Option C: Fork Existing (clone governed → draft)
        │         │
        │         ▼
        │    ┌─────────────────────────────────┐
        │    │  fork                            │ ◄── Control Plane Router
        │    │  • Copy all fields from source   │     POST /agents/:id/fork
        │    │  • Reset to "draft" state        │
        │    │  • Increment version             │
        │    │  • origin = "clone"              │
        │    └───────────────┬─────────────────┘
        │                   │
        ▼                   ▼
   ┌────────────────────────────────────┐
   │         DATABASE INSERT            │
   │  Table: agents (drizzle/schema.ts) │
   │                                    │
   │  Key columns:                      │
   │  • id (serial PK)                  │
   │  • workspaceId (FK)                │
   │  • name, description               │
   │  • systemPrompt                    │
   │  • modelId, temperature            │
   │  • roleClass                       │
   │  • status / lifecycleState         │
   │  • hasDocumentAccess               │
   │  • hasToolAccess, allowedTools     │
   │  • capabilities (jsonb)            │
   │  • limits (jsonb)                  │
   │  • lifecycle (jsonb)               │
   │  • governanceStatus                │
   │  • createdBy (FK → users)          │
   │  • mode: "sandbox" | "governed"    │
   └──────────────┬─────────────────────┘
                  │
                  ▼

  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  PHASE 2: AGENT LIFECYCLE STATE MACHINE                                ║
  ╚══════════════════════════════════════════════════════════════════════════╝

           ┌──────────┐
           │  DRAFT   │  ◄── Initial state on creation
           └────┬─────┘
                │
                │  admitToSandbox (POST /agents/:id/sandbox)
                │    ├── Zod schema validation (SandboxAgent)
                │    ├── Policy validation via OPA
                │    └── Record agentHistory event
                │
                ▼
           ┌──────────┐           ┌──────────────────────┐
           │ SANDBOX  │──────────►│  PROMOTION DECISION  │
           └──────────┘           └──────────┬───────────┘
                                             │
                          ┌──────────────────┼──────────────────┐
                          │                  │                  │
                          ▼                  ▼                  ▼
                ┌─────────────────┐  ┌──────────────┐  ┌──────────────┐
                │ Direct Promote  │  │  Approval    │  │   Reject     │
                │ (approvals OFF) │  │  Workflow    │  │   (stay in   │
                │                 │  │ (approvals ON│  │   sandbox)   │
                └────────┬────────┘  └──────┬───────┘  └──────────────┘
                         │                  │
                         │         ┌────────▼────────┐
                         │         │ createRequest   │ POST promotions/requests
                         │         │ • agentId       │
                         │         │ • approvers[]   │
                         │         │ • 24h SLA       │
                         │         │ • incident check│
                         │         └────────┬────────┘
                         │                  │
                         │         ┌────────▼────────┐
                         │         │ approve/reject  │ POST promotions/:id/approve
                         │         │ • approver check│
                         │         │ • audit log     │
                         │         │ • agentHistory  │
                         │         └────────┬────────┘
                         │                  │
                         │         ┌────────▼────────┐
                         │         │ execute         │ POST promotions/:id/execute
                         │         │ • incident check│
                         │         └────────┬────────┘
                         │                  │
                         ▼                  ▼
                    ┌─────────────────────────┐
                    │  PROMOTION EXECUTION     │
                    │                          │
                    │  1. Policy validation    │
                    │     (on_promotion_attempt)│
                    │  2. computeSpecHash()    │
                    │  3. Generate governance  │
                    │     proof (agentProofs)  │
                    │  4. Increment version    │
                    │  5. Set lifecycleState   │
                    │     = "governed"         │
                    │  6. Record agentHistory  │
                    │  7. Audit log            │
                    └───────────┬──────────────┘
                                │
                                ▼
                         ┌──────────┐
                         │ GOVERNED │
                         └────┬─────┘
                              │
                              ├──── fork → back to DRAFT (new version)
                              │
                              ├──── disable (POST /agents/:id/disable)
                              │        │
                              │        ▼
                              │   ┌──────────┐
                              │   │ DISABLED │  (terminal state)
                              │   └──────────┘
                              │
                              └──── Can be INVALIDATED by policy hot-reload
                                       │
                                       ▼
                              ┌───────────────────┐
                              │ GOVERNED_INVALIDATED│
                              └───────────────────┘


  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  PHASE 3: CATALOG PUBLICATION (Agent → Callable Service)               ║
  ╚══════════════════════════════════════════════════════════════════════════╝

   Governed Agent
        │
        ▼
   ┌─────────────────────────────────────┐
   │  CATALOG ENTRY                       │ ◄── catalog-manage router
   │                                      │
   │  • Import governed agent into Catalog│
   │  • Set entryType = "agent"           │
   │  • Configure execution settings:     │
   │    - sourceAgentId (FK → agents)     │
   │    - modelId, roleClass              │
   │    - hasDocumentAccess               │
   │    - hasToolAccess, allowedTools      │
   │    - callable = true                 │
   │  • reviewState flow:                 │
   │    draft → pending → approved        │
   │  • Tag with "published"              │
   │  • status = "active"                 │
   └──────────────┬──────────────────────┘
                  │
                  ▼
   ┌─────────────────────────────────────┐
   │  PUBLISH BUNDLE                      │
   │                                      │
   │  • Snapshot all config + metadata    │
   │  • Generate snapshotHash (SHA-256)   │
   │  • Store as immutable bundle         │
   │  • versionLabel for tracking         │
   │  • publishedAt timestamp             │
   └──────────────┬──────────────────────┘
                  │
                  ▼
   ┌─────────────────────────────────────┐
   │  CATALOG REGISTRY (read-only)        │ ◄── catalog-registry router
   │                                      │
   │  • getActive() — list published      │
   │  • getByHash() — integrity check     │
   │  • getByEntry() — lookup by ID       │
   │  • listForDropdown() — UI consumers  │
   │  • getAgentExecutionTarget() ────────┼──► Used by executor
   │  • executionRuns() — observability   │
   └──────────────────────────────────────┘


  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  PHASE 4: RUNTIME STARTUP & ADMISSION CONTROL                         ║
  ╚══════════════════════════════════════════════════════════════════════════╝

   Start Agent Request
        │
        ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  RuntimeSelector.getRuntime(workspaceId, config)             │
   │                                                              │
   │  ┌─────────────────┐          ┌──────────────────────┐      │
   │  │ Embedded Runtime │    OR    │  External Runtime    │      │
   │  │ (in-process)     │          │  (remote gRPC/HTTP)  │      │
   │  └────────┬─────────┘          └──────────────────────┘      │
   └───────────┼──────────────────────────────────────────────────┘
               │
               ▼
   ┌─────────────────────────────────────────────────┐
   │  ADMISSION CONTROL  (embedded-runtime.ts)        │
   │                                                  │
   │  IF mode == "sandbox":                           │
   │    ├── Check expiry date                         │
   │    └── Allow if not expired                      │
   │                                                  │
   │  IF mode == "governed":                          │
   │    ├── Check governanceStatus                    │
   │    │   ├── GOVERNED_INVALIDATED → DENY           │
   │    │   └── GOVERNED_RESTRICTED  → DENY           │
   │    ├── Verify agent_proofs record exists          │
   │    ├── Recompute specHash & compare to proof     │
   │    │   └── Hash mismatch → DENY (tampering!)     │
   │    └── Verify policy hash matches current OPA    │
   │        └── Policy changed → INVALIDATE & DENY    │
   │                                                  │
   │  Result: { status: "running" | "denied" }        │
   └──────────────────────┬──────────────────────────┘
                          │
                          ▼

  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  PHASE 5: AGENT EXECUTION (The Core Loop)                             ║
  ╚══════════════════════════════════════════════════════════════════════════╝

   ┌──── Two Execution Paths ────────────────────────────────────────────┐
   │                                                                      │
   │  PATH A: Direct Agent Execution         PATH B: Catalog Execution    │
   │  (DISABLED in router — throws error)    (Primary/production path)    │
   │                                                                      │
   └──────────────────────────────────────────────────────────────────────┘

   User sends message (CatalogAgentChat page)
        │
        ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  executeCatalogChatStream()   (catalog/execution.ts)             │
   │                                                                  │
   │  1. CREATE EXECUTION RUN                                         │
   │     └── state: "created" → "validating"                          │
   │                                                                  │
   │  2. RESOLVE CATALOG TARGET  ◄── resolveCatalogAgentExecutionTarget│
   │     ├── Verify catalog entry exists                              │
   │     ├── Verify entryType == "agent"                              │
   │     ├── Verify "published" tag + reviewState == "approved"       │
   │     ├── Verify status == "active"                                │
   │     ├── Load active publish bundle                               │
   │     ├── Verify config.callable == true                           │
   │     ├── Parse execution config (Zod validation)                  │
   │     └── Load source agent definition                             │
   │                                                                  │
   │  3. RESOLVE PROVIDER                                             │
   │     ├── Extract providerId from snapshot/config                  │
   │     └── Get provider instance from ProviderRegistry              │
   │                                                                  │
   │  4. SETUP CONVERSATION                                           │
   │     ├── Reuse existing or create new conversation                │
   │     └── Store user message in DB                                 │
   │                                                                  │
   │  5. UPDATE RUN → state: "running"                                │
   │     └── Record metadata (bundleId, version, hash, provider...)   │
   │                                                                  │
   │  6. STREAM LLM RESPONSE                                         │
   │     ├── Send messages to LLM provider                            │
   │     ├── Yield tokens as SSE events                               │
   │     ├── Record firstTokenAt timestamp                            │
   │     └── Accumulate full response                                 │
   │                                                                  │
   │  7. PERSIST RESPONSE                                             │
   │     ├── Store assistant message in DB                            │
   │     └── Update run → state: "completed", success: true           │
   │                                                                  │
   │  Events emitted:                                                 │
   │     { type: "run_started", runId, conversationId }               │
   │     { type: "token", content: "..." }   (repeated)               │
   │     { type: "complete", runId, conversationId, content }         │
   │     { type: "error", runId, error }     (on failure)             │
   └──────────────────────────────────────────────────────────────────┘


   ┌──────────────────────────────────────────────────────────────────┐
   │  ALTERNATIVE: Direct executeAgent()  (agents/executor.ts)        │
   │  (Used when conversation has an agentId, not catalog path)       │
   │                                                                  │
   │  1. Load conversation + agent config                             │
   │  2. Add user message to DB                                       │
   │  3. Build messages array:                                        │
   │     ├── System prompt (from agent definition)                    │
   │     ├── Recent conversation history (last 10)                    │
   │     ├── RAG context (if hasDocumentAccess)                       │
   │     │   └── embeddingService.searchSimilarChunks()               │
   │     └── Tool descriptions (if hasToolAccess)                     │
   │                                                                  │
   │  4. GENERATION LOOP (max 10 iterations):                         │
   │     ┌─────────────────────────────────────────────┐              │
   │     │  Send to LLM provider.generate()            │              │
   │     │         │                                   │              │
   │     │         ▼                                   │              │
   │     │  Is response a tool call JSON?              │              │
   │     │    YES:                                     │              │
   │     │    ├── Parse {"tool": "...", "params": ...} │              │
   │     │    ├── Execute via ToolRegistry.execute()   │              │
   │     │    ├── Append tool result to messages       │              │
   │     │    └── LOOP AGAIN for final answer          │              │
   │     │    NO:                                      │              │
   │     │    └── BREAK — this is the final response   │              │
   │     └─────────────────────────────────────────────┘              │
   │                                                                  │
   │  5. Store assistant response in DB                               │
   │  6. Return: { response, toolCalls[], retrievedChunks[], iters }  │
   └──────────────────────────────────────────────────────────────────┘


  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  PHASE 6: TOOL SYSTEM                                                  ║
  ╚══════════════════════════════════════════════════════════════════════════╝

   ┌───────────────────────────────────────────────┐
   │  ToolRegistry  (agents/tools.ts)               │
   │                                                │
   │  Built-in tools:                               │
   │    ├── calculator      (math expressions)      │
   │    ├── current_time    (date/time formats)      │
   │    ├── text_analysis   (word/char counts)       │
   │    ├── json_parser     (parse + extract fields) │
   │    └── url_parser      (URL component extract)  │
   │                                                │
   │  Per-agent allowed tools:                      │
   │    agent.allowedTools[] filters which tools     │
   │    the agent can call from the registry         │
   │                                                │
   │  Flow:                                         │
   │    LLM output → parse JSON → registry.execute()│
   │    → validate params → tool.execute(params)     │
   │    → return string result → feed back to LLM   │
   └───────────────────────────────────────────────┘


  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  PHASE 7: MULTI-AGENT ORCHESTRATION                                    ║
  ╚══════════════════════════════════════════════════════════════════════════╝

   ┌───────────────────────────────────────────────────────────────┐
   │  MultiAgentOrchestrator  (agents/orchestrator.ts)             │
   │                                                               │
   │  createOrchestratedTask(goal, agentIds[])                     │
   │         │                                                     │
   │         ▼                                                     │
   │  ┌─────────────────────────┐                                  │
   │  │  1. PLANNING            │                                  │
   │  │  Generate PlanStep[] with│                                 │
   │  │  dependency graph        │                                 │
   │  └────────────┬────────────┘                                  │
   │               ▼                                               │
   │  ┌─────────────────────────┐                                  │
   │  │  2. EXECUTION           │                                  │
   │  │  For each step:         │                                  │
   │  │  ├── Check dependencies │                                  │
   │  │  │   satisfied?         │                                  │
   │  │  ├── YES → run in       │                                  │
   │  │  │   parallel           │                                  │
   │  │  └── NO → wait          │                                  │
   │  │                         │                                  │
   │  │  Each step:             │                                  │
   │  │  agentEngine.createTask │                                  │
   │  │  → waitForTask()        │                                  │
   │  └────────────┬────────────┘                                  │
   │               ▼                                               │
   │  ┌─────────────────────────┐                                  │
   │  │  3. COLLECT RESULTS     │                                  │
   │  │  Aggregate step outputs │                                  │
   │  │  → final task result    │                                  │
   │  └─────────────────────────┘                                  │
   │                                                               │
   │  Pre-registered agents:                                       │
   │    ├── research-agent  (web search, doc analysis)             │
   │    ├── code-agent      (code generation, debugging)           │
   │    └── data-agent      (data analysis, visualization)         │
   └───────────────────────────────────────────────────────────────┘


  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  PHASE 8: CHAT STREAMING (User ↔ Agent Communication)                 ║
  ╚══════════════════════════════════════════════════════════════════════════╝

   Browser (React)
        │
        │  POST /api/chat/stream   (SSE)
        ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  handleChatStream()  (chat/stream.ts)                        │
   │                                                              │
   │  1. Authenticate user (or DEV_MODE bypass)                   │
   │  2. Validate body (Zod: providerId, messages[], temp, etc.)  │
   │  3. Resolve provider:                                        │
   │     ├── Unified routing (providerRouter.resolvePlan)          │
   │     └── Direct selection (providerId)                        │
   │  4. Set SSE headers (text/event-stream)                      │
   │  5. Inject RAG context if useRAG:                            │
   │     └── retrieveRelevantChunks() from Qdrant vector DB       │
   │  6. Stream LLM tokens:                                       │
   │     ├── data: { type: "token", content: "..." }              │
   │     └── data: { type: "complete", content, usage, cost,      │
   │                  sources, routing }                           │
   │  7. Track usage (tokens, cost, latency)                      │
   └─────────────────────────────────────────────────────────────┘


  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  PHASE 9: AUTOMATION & TRIGGERS                                        ║
  ╚══════════════════════════════════════════════════════════════════════════╝

   ┌───────────────────────────────────────────────────────────────┐
   │  AutomationEngine  (automation/automation-engine.ts)           │
   │                                                               │
   │  Trigger Types:                                               │
   │    ├── TIME     (cron schedule → auto-run agent tasks)        │
   │    ├── EVENT    (document.uploaded → trigger actions)          │
   │    └── WEBHOOK  (external HTTP call → trigger actions)        │
   │                                                               │
   │  Action Types:                                                │
   │    ├── run_agent   → agentEngine.createTask(agentId, goal)    │
   │    ├── send_email  → notification                             │
   │    ├── create_task → task creation                            │
   │    └── call_webhook→ outbound HTTP                            │
   │                                                               │
   │  Example flows:                                               │
   │    Cron 9AM → run data-agent "Generate report" → send email   │
   │    doc.uploaded event → send team notification email           │
   └───────────────────────────────────────────────────────────────┘


  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  PHASE 10: GOVERNANCE & POLICY ENFORCEMENT                            ║
  ╚══════════════════════════════════════════════════════════════════════════╝

   ┌───────────────────────────────────────────────────────────────┐
   │  OPA Engine  (agents/opa-engine.ts)                           │
   │                                                               │
   │  Policy evaluation hooks:                                     │
   │    • on_field_change       (live form validation)             │
   │    • on_step_exit          (wizard step completion)           │
   │    • on_review_open        (review panel opened)              │
   │    • on_create_attempt     (sandbox admission)                │
   │    • on_promotion_attempt  (govern promotion)                 │
   │    • before_execute        (pre-execution check)              │
   │                                                               │
   │  Policy results: ALLOW / WARN / DENY                         │
   │    • violations[] → block action                              │
   │    • warnings[] → allow with caution                          │
   │    • lockedFields[] → prevent modification                    │
   │    • mutations[] → auto-apply changes                         │
   │                                                               │
   │  Hot reload:                                                  │
   │    PUT /v1/policies/agents → OPA                              │
   │    → Revalidate all governed agents                           │
   │    → INVALIDATE agents that no longer comply                  │
   │                                                               │
   │  Drift detection:                                             │
   │    agents/drift-detector.ts scans for spec changes            │
   └───────────────────────────────────────────────────────────────┘


  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  PHASE 11: OBSERVABILITY & AUDIT                                       ║
  ╚══════════════════════════════════════════════════════════════════════════╝

   ┌───────────────────────────────────────────────────────────────┐
   │  Execution Runs (catalog/execution.ts)                        │
   │    • State machine: created → validating → running            │
   │      → completed/failed                                       │
   │    • Tracks: firstTokenAt, completedAt, blockerCode,          │
   │      provider, modelId, metadata                              │
   │    • Blocker categories: dependency_block, validation_error,   │
   │      lifecycle_rule, permission_error, technical_error         │
   │                                                               │
   │  Agent History (agentHistory table)                           │
   │    • Events: admitted_to_sandbox, promoted_to_governed,        │
   │      promotion_approved, promotion_rejected, disabled          │
   │    • Links to actorId, metadata                               │
   │                                                               │
   │  Audit Logger (services/auditLogger.ts)                       │
   │    • LIFECYCLE_TRANSITION events                              │
   │    • actor_id, action_type, target_type, decision_result      │
   │                                                               │
   │  Catalog Audit Events                                         │
   │    • All catalog publish/review/config changes tracked         │
   │                                                               │
   │  Compliance Export (agents/compliance-export.ts)               │
   │    • Exportable governance + audit records                     │
   └───────────────────────────────────────────────────────────────┘
```

## End-to-End Flow Summary (Happy Path)

```
  User creates agent (wizard/template/fork)
       │
       ▼
  [DRAFT] ──── validate + policy check ────► [SANDBOX]
       │                                         │
       │                              Promotion request (if approvals ON)
       │                              or direct promote (if approvals OFF)
       │                                         │
       │                               Policy check + spec hash
       │                               + governance proof
       │                                         │
       │                                         ▼
       │                                    [GOVERNED]
       │                                         │
       │                              Import into Catalog
       │                              Configure callable = true
       │                              Review → Approve → Publish
       │                                         │
       │                                         ▼
       │                              [CATALOG ENTRY — active, published]
       │                                         │
       │                              User opens CatalogAgentChat
       │                              Sends message
       │                                         │
       │                                         ▼
       │                              resolveCatalogAgentExecutionTarget()
       │                              ├── 7-step validation gate
       │                              ├── Resolve provider
       │                              └── Create execution run
       │                                         │
       │                                         ▼
       │                              LLM streaming response
       │                              ├── Optional RAG context injection
       │                              ├── Optional tool calling loop
       │                              └── Persist to conversation
       │                                         │
       │                                         ▼
       │                              Response delivered to user via SSE
       │
       └── At any point: disable → [DISABLED]
           Or: policy hot-reload → [GOVERNED_INVALIDATED]
           Or: fork → new [DRAFT] (version++)
```

## Key Source Files

| File | Purpose |
|---|---|
| `server/agents/create-definition.ts` | Agent creation from structured input |
| `server/agents/db.ts` | CRUD operations for agents, conversations, messages |
| `server/agents/router.ts` | tRPC router for agent management + templates |
| `server/agents/executor.ts` | Agent execution engine with tool calling loop |
| `server/agents/tools.ts` | Tool registry with 5 built-in tools |
| `server/agents/orchestrator.ts` | Multi-agent orchestration with dependency graph |
| `server/agents/agent-engine.ts` | In-memory agent task engine |
| `server/agents/embedded-runtime.ts` | Admission control + governance enforcement |
| `server/agents/runtime-selector.ts` | Embedded vs external runtime selection |
| `server/agents/opa-engine.ts` | OPA policy evaluation engine |
| `server/agents/drift-detector.ts` | Spec drift detection |
| `server/catalog/execution.ts` | Catalog-based execution with full observability |
| `server/routers/agents-control-plane.ts` | Lifecycle state transitions (draft/sandbox/governed) |
| `server/routers/agents-promotions.ts` | Promotion approval workflow |
| `server/routers/catalog-registry.ts` | Read-only catalog bundle registry |
| `server/chat/stream.ts` | SSE chat streaming with RAG + provider routing |
| `server/automation/automation-engine.ts` | Trigger-based automation (cron/event/webhook) |
