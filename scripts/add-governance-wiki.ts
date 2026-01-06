import { getDb } from '../server/db';
import { wikiPages } from '../drizzle/wiki-schema';

async function addGovernanceWikiPage() {
  try {
    const db = getDb();
    
    const content = `# Agent Governance Platform - Governance Architecture

## System Overview

The Agent Governance Platform is a comprehensive system for managing, monitoring, and governing AI agents. It consists of multiple interconnected components working together to provide policy enforcement, lifecycle management, and real-time monitoring.

## Architecture Diagram

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ AgentList    │  │ AgentEditor  │  │ MonitoringDashboard  │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│         │                  │                     │                │
│         └──────────────────┼─────────────────────┘                │
│                            │                                      │
│                      tRPC Client                                  │
└────────────────────────────┼──────────────────────────────────────┘
                             │
                    /api/trpc (HTTP)
                             │
┌────────────────────────────┼──────────────────────────────────────┐
│                   Backend (Express + tRPC)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  tRPC Routers                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐ │   │
│  │  │ agents      │  │ orchestrator │  │ opaPolicy        │ │   │
│  │  └─────────────┘  └─────────────┘  └──────────────────┘ │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐ │   │
│  │  │ logging     │  │ backup      │  │ (more routers)   │ │   │
│  │  └─────────────┘  └─────────────┘  └──────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Services Layer                           │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ ExternalOrchestratorClient                       │   │   │
│  │  │ - HTTP client with retry logic                   │   │   │
│  │  │ - Event emission                                 │   │   │
│  │  │ - TLS support                                    │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ OPAPolicyEngine                                  │   │   │
│  │  │ - Policy evaluation                              │   │   │
│  │  │ - Policy compilation                             │   │   │
│  │  │ - Health checks                                  │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ EventStreamManager                               │   │   │
│  │  │ - Event subscription                             │   │   │
│  │  │ - Event buffer                                   │   │   │
│  │  │ - Event routing                                  │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ LoggingService & MetricsCollector                │   │   │
│  │  │ - Structured logging                             │   │   │
│  │  │ - Multiple transports                            │   │   │
│  │  │ - Metrics collection                             │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ BackupRestoreService                             │   │   │
│  │  │ - Backup creation                                │   │   │
│  │  │ - Restore operations                             │   │   │
│  │  │ - Backup scheduling                              │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Data Layer                              │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ Database (MySQL/TiDB)                            │   │   │
│  │  │ - agents table                                   │   │   │
│  │  │ - policies table                                 │   │   │
│  │  │ - events table                                   │   │   │
│  │  │ - audit logs table                               │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   External            OPA Service         Orchestrator
   Services            (Policy)            (Agent Lifecycle)
\`\`\`

## Component Details

### Frontend Layer

The frontend is built with React 19 and Tailwind CSS, providing a responsive user interface for managing agents and policies.

**Key Pages:**
- **AgentList**: Displays all agents with search, filtering, and bulk actions
- **AgentEditor**: Create and edit agent configurations
- **MonitoringDashboard**: Real-time metrics and system health
- **PolicyManagement**: Create and manage governance policies

### Backend Layer

The backend is built with Express and tRPC, providing type-safe API endpoints.

**tRPC Routers:**
- **agents**: Agent CRUD operations
- **orchestrator**: External orchestrator integration
- **opaPolicy**: OPA policy management
- **logging**: Logging and metrics
- **backup**: Backup and restore operations

### Services Layer

Reusable business logic components that handle core functionality.

**ExternalOrchestratorClient:**
- HTTP client for communicating with external orchestrator
- Automatic retry logic with exponential backoff
- Event emission for monitoring
- TLS/SSL support

**OPAPolicyEngine:**
- Evaluates agents against Rego policies
- Compiles and validates policies
- Health checks and version management

**EventStreamManager:**
- Manages event subscriptions
- Routes events to subscribers
- Maintains event buffer for reconnection

**LoggingService:**
- Structured logging with multiple transports
- Console and file logging
- Metrics collection and aggregation

**BackupRestoreService:**
- Creates and manages backups
- Restores from backups
- Schedules automatic backups

## Data Flow

### Agent Creation Flow

\`\`\`
1. User submits form in AgentEditor
   ↓
2. Frontend calls trpc.agents.create
   ↓
3. Backend validates input
   ↓
4. Database stores agent record
   ↓
5. Response sent to frontend
   ↓
6. UI updates with new agent
\`\`\`

### Agent Promotion Flow

\`\`\`
1. User clicks "Promote" button
   ↓
2. Frontend calls trpc.agents.promote
   ↓
3. Backend fetches agent and active policy
   ↓
4. OPA evaluates agent against policy
   ↓
5. If compliant: update status to "governed"
   ↓
6. Emit governance.approved event
   ↓
7. Response sent to frontend
\`\`\`

### Policy Hot Reload Flow

\`\`\`
1. User updates policy in PolicyManagement
   ↓
2. Frontend calls trpc.orchestrator.hotReloadPolicy
   ↓
3. Backend sends policy to external orchestrator
   ↓
4. Orchestrator reloads policy for all agents
   ↓
5. Emit policy.reloaded event
   ↓
6. Affected agents are revalidated
   ↓
7. Response sent to frontend with results
\`\`\`

## Event System

Events flow through the system to provide real-time updates and audit trails.

**Event Types:**
- **agent.started**: Agent started on orchestrator
- **agent.stopped**: Agent stopped
- **agent.error**: Agent encountered error
- **agent.status_changed**: Agent status changed
- **policy.updated**: Policy was updated
- **policy.reloaded**: Policy was hot-reloaded
- **governance.violation**: Agent failed policy check
- **governance.approved**: Agent passed policy check

## Security

### Authentication
- OAuth 2.0 via Manus OAuth
- JWT tokens for session management
- Protected procedures require authentication

### Authorization
- Workspace-level access control
- Role-based access control (admin/user)
- Resource ownership verification

### Data Protection
- TLS/SSL for all external communications
- Database encryption at rest
- Sensitive data masked in logs

## Monitoring

### Metrics Collected
- API response times
- Error rates
- Agent status changes
- Policy evaluation results
- Event processing times

### Logging
- Structured logging with context
- Multiple log levels (debug, info, warn, error, fatal)
- Log aggregation support

### Health Checks
- Application health endpoint
- Orchestrator connectivity check
- OPA service health check
- Database connection check

## Deployment

### Development
\`\`\`bash
pnpm dev
\`\`\`

### Production
\`\`\`bash
pnpm build
pnpm start
\`\`\`

### Docker
\`\`\`bash
docker build -t agent-governance:latest .
docker run -d -p 3000:3000 agent-governance:latest
\`\`\`

## References

For more details, see:
- [API Documentation](/wiki/api-reference)
- [Deployment Guide](/wiki/deployment-guide)
- [OPA Policy Guide](/wiki/opa-policy-guide)`;

    const excerpt = 'Comprehensive system for managing, monitoring, and governing AI agents with policy enforcement, lifecycle management, and real-time monitoring.';

    // Insert the wiki page
    const result = await db.insert(wikiPages).values({
      workspaceId: 1,
      categoryId: 1,
      title: 'Agent Governance Platform - Governance Architecture',
      slug: 'agent-governance-architecture',
      content,
      excerpt,
      viewCount: 0,
      isPublished: true,
      createdBy: 1,
      updatedBy: 1,
    });

    console.log('✅ Wiki page created successfully!');
    console.log('Page: Agent Governance Platform - Governance Architecture');
    console.log('Slug: agent-governance-architecture');
    console.log('Category: Architecture');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating wiki page:', error);
    process.exit(1);
  }
}

addGovernanceWikiPage();
