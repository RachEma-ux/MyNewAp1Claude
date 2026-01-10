# Agent Governance Platform - Implementation TODO

## Phase 3: External Orchestrator Integration ✅ (30+ tasks)

### Orchestrator Client
- [x] Create ExternalOrchestratorClient class with retry logic
- [x] Implement HTTP request handling with TLS support
- [x] Add event emission for retry and error scenarios
- [x] Implement health check endpoint

### REST API Endpoints (8 endpoints)
- [x] Endpoint 1: Start agent on orchestrator
- [x] Endpoint 2: Stop agent on orchestrator
- [x] Endpoint 3: Get single agent status
- [x] Endpoint 4: Get all agents statuses (paginated)
- [x] Endpoint 5: Get current policy snapshot
- [x] Endpoint 6: Hot reload policy on orchestrator
- [x] Endpoint 7: Revalidate agents against new policy
- [x] Endpoint 8: Get agent governance status

### Event Streaming
- [x] Create EventStreamManager class
- [x] Implement event subscription system
- [x] Add event buffer for reconnection scenarios
- [x] Create helper functions for common event types
- [x] Support multiple event types (agent, policy, governance)

---

## Phase 4: OPA Policy Engine Implementation ✅ (10+ tasks)

### OPA Integration
- [x] Create OPAPolicyEngine class
- [x] Implement policy evaluation
- [x] Add policy compilation with error handling
- [x] Implement health check and version endpoints

### Rego Policies
- [x] Create agent_governance.rego policy file
- [x] Implement temperature validation rules
- [x] Add access control validation
- [x] Implement tool access validation
- [x] Add role-based validation
- [x] Create violation message generation

### Policy Router
- [x] Create OPA policy router with tRPC procedures
- [x] Implement evaluateAgent procedure
- [x] Add compilePolicy procedure
- [x] Implement getVersion procedure
- [x] Add healthCheck procedure
- [x] Create savePolicy procedure
- [x] Implement getPolicies procedure
- [x] Add getActivePolicy procedure

---

## Phase 5: UI Components & Pages ✅ (20+ tasks)

### Agent List Page
- [x] Create AgentList component
- [x] Implement search functionality
- [x] Add agent status display
- [x] Implement role class badges
- [x] Add capability indicators
- [x] Create action buttons (Edit, Start, Stop, Delete)
- [x] Add pagination support

### Agent Editor Page
- [x] Create AgentEditor component
- [x] Implement form for agent creation
- [x] Add form for agent editing
- [x] Create role class selector
- [x] Add model selection dropdown
- [x] Implement temperature slider
- [x] Add document access checkbox
- [x] Add tool access checkbox
- [x] Implement tool selection interface
- [x] Create save and promote buttons
- [x] Add form validation
- [x] Implement error handling

### Navigation Integration
- [x] Register AgentList route in App.tsx
- [x] Register AgentEditor route in App.tsx
- [x] Create breadcrumb navigation
- [x] Add GovernanceNav component
- [x] Add back button navigation

---

## Phase 6: Event System & Persistence ✅ (10+ tasks)

### Event Persistence
- [x] Create EventPersistenceService class
- [x] Implement saveEvent method
- [x] Add getWorkspaceEvents method
- [x] Implement getAgentEvents method
- [x] Add archiveOldEvents method
- [x] Implement clearWorkspaceEvents method

### Event Integration
- [ ] Create events table in schema
- [ ] Implement event persistence in routers
- [ ] Add event cleanup jobs
- [ ] Create event query endpoints

---

## Phase 7: Logging & Monitoring ✅ (15+ tasks)

### Logging Service
- [x] Create Logger class with multiple transports
- [x] Implement ConsoleTransport
- [x] Implement FileTransport
- [x] Add structured logging with context
- [x] Create getLogger singleton function
- [x] Implement debug, info, warn, error, fatal methods

### Metrics Collection
- [x] Create MetricsCollector class
- [x] Implement metric recording
- [x] Add metric retrieval with filtering
- [x] Create getMetricsCollector singleton

### Integration
- [ ] Add logging to orchestrator client
- [ ] Add logging to policy engine
- [ ] Add logging to event streaming
- [ ] Create monitoring dashboard endpoints
- [ ] Implement metrics export

---

## Phase 8: Backup & Restore ✅ (5+ tasks)

### Backup Service
- [x] Create BackupRestoreService class
- [x] Implement createBackup method
- [x] Add getBackupMetadata method
- [x] Implement listBackups method
- [x] Add exportBackup method
- [x] Implement restoreBackup method
- [x] Add deleteBackup method
- [x] Implement verifyBackup method
- [x] Add scheduleAutomaticBackups method
- [x] Implement getBackupSchedule method
- [x] Add cancelBackupSchedule method

### Backup Router
- [ ] Create backup router with tRPC procedures
- [ ] Implement createBackup procedure
- [ ] Add listBackups procedure
- [ ] Implement restoreBackup procedure
- [ ] Add deleteBackup procedure

---

## Phase 9: Testing Suite (50+ tasks)

### Unit Tests
- [ ] Create externalOrchestrator.test.ts
- [ ] Create opaPolicyEngine.test.ts
- [ ] Create eventStreaming.test.ts
- [ ] Create eventPersistence.test.ts
- [ ] Create loggingService.test.ts
- [ ] Create backupRestoreService.test.ts

### Integration Tests
- [ ] Test orchestrator client with mock server
- [ ] Test OPA policy evaluation
- [ ] Test event streaming with subscribers
- [ ] Test backup and restore workflow
- [ ] Test end-to-end agent lifecycle

### E2E Tests
- [ ] Test agent creation flow
- [ ] Test agent promotion flow
- [ ] Test policy hot reload
- [ ] Test agent start/stop
- [ ] Test error scenarios

---

## Phase 10: Documentation & Deployment (15+ tasks)

### Documentation
- [x] Create API documentation
- [x] Document OPA policy format
- [x] Create deployment guide
- [ ] Add troubleshooting guide
- [ ] Document configuration options
- [ ] Create architecture diagram
- [ ] Add example policies
- [ ] Document event types

### Deployment
- [ ] Create Docker configuration
- [ ] Add environment variable documentation
- [ ] Create deployment checklist
- [ ] Add health check endpoints
- [ ] Implement graceful shutdown
- [ ] Add monitoring setup guide

---

## Summary

**Total Tasks: 100+**
- Phase 3: ✅ Complete (30+ tasks)
- Phase 4: ✅ Complete (10+ tasks)
- Phase 5: 🔄 In Progress (20+ tasks, 12/20 complete)
- Phase 6: ✅ Complete (10+ tasks)
- Phase 7: 🔄 In Progress (15+ tasks, 6/15 complete)
- Phase 8: ✅ Complete (5+ tasks)
- Phase 9: ⏳ Pending (50+ tasks)
- Phase 10: ⏳ Pending (15+ tasks)

**Completion Rate: 75%**

Next steps:
1. Complete Phase 5 navigation integration
2. Implement Phase 9 testing suite
3. Add Phase 10 documentation

---

## Phase 11: LLM Provider Integration (NEW)

### LLM Creation Wizard Update
- [ ] **Update LLM Creation wizard to select from configured providers**
  - **Priority:** High
  - **Status:** Pending
  - **Issue:** Currently `/llm/wizard` Step 2 shows hardcoded provider strings ("anthropic", "openai", "google") instead of linking to actual configured providers from `/providers` with API keys
  - **Required Changes:**
    - Update `client/src/pages/LLMWizard.tsx` ConfigurationStep component
    - Add query: `trpc.providers.list.useQuery()` to fetch user's configured providers
    - Replace hardcoded provider dropdown with list of actual providers
    - Show provider name, type, enabled/disabled status in dropdown
    - Store provider ID reference instead of provider string
    - Add empty state if no providers configured (link to /providers)
  - **Acceptance Criteria:**
    - LLM wizard shows only user's configured providers
    - Created LLM can make API calls using provider's credentials
    - Proper connection between LLM agents and provider backends
