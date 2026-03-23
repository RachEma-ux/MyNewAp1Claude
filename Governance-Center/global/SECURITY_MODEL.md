# Security Model

## Implemented Security Controls

### Authentication
- OAuth-based authentication when `VITE_OAUTH_PORTAL_URL` and `VITE_APP_ID` are configured
- Demo mode bypasses auth entirely when OAuth env vars are absent
- Three procedure levels: `publicProcedure`, `protectedProcedure`, `adminProcedure`

### Authorization (RBAC)
- Role-based access control defined in `server/governance/rbac-model.ts`
- Workspace-level membership with role assignments (owner, admin, member, viewer)
- HR module uses a dedicated permission model (`requireHrPermission`, `resolveDataScope`)
- `policyGate` service enforces RBAC at the service layer

### Secrets Management
- Secrets stored via `server/secrets/` module
- Provider API keys managed through provider connection lifecycle
- Key rotation support via `server/services/keyRotation.ts`
- Known gap: some API keys stored unencrypted in catalog config (see risk matrix C5)

### Input Validation
- tRPC input schemas via Zod validators on all endpoints
- Workspace access checks on resource endpoints (`hasWorkspaceAccess`)

### Audit Trail
- Governance audit logger (`server/services/governanceLogger.ts`)
- Evidence emitter for governance artifacts (`server/governance/evidence-emitter.ts`)
- Routing audit logs in database (`routing_audit_logs` table)
- HR module: sensitive read logging, SoD enforcement

### Freeze / Change Control
- Freeze protocol blocks mutations during controlled periods
- Freeze state checked by governance engine before each governed mutation
- Drift detection monitors freeze violations

### Network / Deployment
- Express server with Vite middleware (dev) or static serving (production)
- No TLS termination at app layer (expected to be handled by reverse proxy)
- Tunnel-based access for remote development/testing

## Known Security Gaps

Refer to [Risk Matrix](../reports/audit/06_risk_matrix.md) for the full list of identified security risks, ranked by severity.
