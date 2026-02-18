# Agent Governance Platform

A comprehensive system for managing, monitoring, and governing AI agents with policy enforcement, lifecycle management, and real-time monitoring.

## 🎯 Overview

The Agent Governance Platform provides a complete solution for organizations to:

- **Create and manage AI agents** with fine-grained configuration options
- **Enforce governance policies** using Open Policy Agent (OPA) and Rego
- **Monitor agent lifecycle** through an external orchestrator
- **Track compliance** with real-time policy evaluation
- **Audit operations** with comprehensive event logging
- **Backup and restore** agent configurations and policies

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ database
- Docker (optional)
- External Orchestrator service
- OPA (Open Policy Agent) service

### Installation

```bash
# Clone repository
git clone <repository>
cd agent-governance-platform

# Install dependencies
pnpm install

# Setup environment
cp .env.example .env

# Configure environment variables
# DATABASE_URL=postgresql://user:password@localhost:5432/agent_governance
# ORCHESTRATOR_BASE_URL=https://orchestrator.example.com
# OPA_BASE_URL=https://opa.example.com

# Run migrations
pnpm db:push

# Start development server
pnpm dev
```

## 📋 Features

### Agent Management

- **Create agents** with customizable configurations
- **Edit agent properties** including role, temperature, and access controls
- **Promote agents** from draft to governed status
- **Monitor agent status** in real-time
- **Delete agents** with soft-delete support

### Policy Management

- **Define governance policies** using Rego language
- **Evaluate agents** against policies
- **Hot reload policies** without restarting
- **Revalidate agents** against new policies
- **View policy snapshots** from orchestrator

### Monitoring & Logging

- **Real-time metrics** dashboard
- **Structured logging** with multiple transports
- **Event streaming** for real-time updates
- **Health checks** for all services
- **Audit trail** of all operations

### Backup & Restore

- **Create backups** of agents and policies
- **Restore from backups** with selective options
- **Schedule automatic backups** with retention policies
- **Verify backup integrity** before restoration

## 📚 Documentation

- **[API Documentation](./API_DOCUMENTATION.md)** - Complete endpoint reference
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment instructions
- **[OPA Policy Guide](./OPA_POLICY_GUIDE.md)** - Policy writing examples
- **[Testing Guide](./TESTING_GUIDE.md)** - Testing patterns and best practices
- **[Architecture Guide](./GOVERNANCE_ARCHITECTURE.md)** - System architecture
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - Common issues and solutions

## 🏗️ Architecture

The platform consists of several key components:

```
Frontend (React 19)
    ↓
tRPC API Layer
    ↓
Service Layer (Business Logic)
    ↓
Data Layer (PostgreSQL)
    ↓
External Services (Orchestrator, OPA)
```

### Key Services

- **ExternalOrchestratorClient**: HTTP client for orchestrator communication
- **OPAPolicyEngine**: Policy evaluation and compilation
- **EventStreamManager**: Event subscription and routing
- **LoggingService**: Structured logging and metrics
- **BackupRestoreService**: Backup and restore operations

## 🔌 API Endpoints

### Agent Management

- `POST /api/trpc/agents.create` - Create agent
- `GET /api/trpc/agents.list` - List agents
- `GET /api/trpc/agents.get` - Get agent details
- `PUT /api/trpc/agents.update` - Update agent
- `DELETE /api/trpc/agents.delete` - Delete agent
- `POST /api/trpc/agents.promote` - Promote agent

### Orchestrator Integration

- `POST /api/trpc/orchestrator.startAgent` - Start agent
- `POST /api/trpc/orchestrator.stopAgent` - Stop agent
- `GET /api/trpc/orchestrator.getAgentStatus` - Get status
- `POST /api/trpc/orchestrator.hotReloadPolicy` - Hot reload policy
- `GET /api/trpc/orchestrator.healthCheck` - Health check

### Policy Management

- `POST /api/trpc/opaPolicy.evaluateAgent` - Evaluate agent
- `POST /api/trpc/opaPolicy.compilePolicy` - Compile policy
- `GET /api/trpc/opaPolicy.getActivePolicy` - Get active policy
- `POST /api/trpc/opaPolicy.savePolicy` - Save policy

### Monitoring

- `GET /api/trpc/logging.getHealth` - System health
- `GET /api/trpc/logging.getMetrics` - Get metrics
- `POST /api/trpc/logging.recordMetric` - Record metric

### Backup & Restore

- `POST /api/trpc/backup.createBackup` - Create backup
- `GET /api/trpc/backup.listBackups` - List backups
- `POST /api/trpc/backup.restoreBackup` - Restore backup
- `POST /api/trpc/backup.scheduleAutomaticBackups` - Schedule backups

## 🔐 Security

- **OAuth 2.0** authentication via Manus OAuth
- **JWT** token-based sessions
- **Role-based access control** (admin/user)
- **TLS/SSL** for external communications
- **Database encryption** at rest
- **Audit logging** of all operations

## 📊 Monitoring

### Metrics Collected

- API response times
- Error rates
- Agent status changes
- Policy evaluation results
- Event processing times

### Health Checks

```bash
# Application health
curl http://localhost:3000/api/trpc/logging.getHealth

# Orchestrator health
curl http://localhost:3000/api/trpc/orchestrator.healthCheck

# OPA health
curl http://localhost:3000/api/trpc/opaPolicy.healthCheck
```

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test server/services/externalOrchestrator.test.ts
```

## 🚢 Deployment

### Development

```bash
pnpm dev
```

### Production

```bash
pnpm build
pnpm start
```

### Docker

```bash
docker build -t agent-governance:latest .
docker run -d -p 3000:3000 agent-governance:latest
```

See [Deployment Guide](./DEPLOYMENT.md) for detailed instructions.

## 🔧 Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/agent_governance

# Authentication
JWT_SECRET=your-secret-key
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://oauth.manus.im

# Application
VITE_APP_ID=your-app-id
VITE_APP_TITLE=Agent Governance Platform

# External Services
ORCHESTRATOR_BASE_URL=https://orchestrator.example.com
ORCHESTRATOR_API_KEY=your-orchestrator-key
OPA_BASE_URL=https://opa.example.com
OPA_TIMEOUT=30000

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/agent-governance.log
```

## 📝 Usage Examples

### Create an Agent

```bash
curl -X POST http://localhost:3000/api/trpc/agents.create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "Data Analyst",
    "roleClass": "analyst",
    "systemPrompt": "You are a data analyst...",
    "modelId": "gpt-4",
    "temperature": 0.7,
    "hasDocumentAccess": true,
    "hasToolAccess": true,
    "allowedTools": ["web_search", "code_execution"]
  }'
```

### Promote an Agent

```bash
curl -X POST http://localhost:3000/api/trpc/agents.promote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"id": 1}'
```

### Start an Agent

```bash
curl -X POST http://localhost:3000/api/trpc/orchestrator.startAgent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"agentId": 1, "workspaceId": 1}'
```

### Get Agent Status

```bash
curl http://localhost:3000/api/trpc/orchestrator.getAgentStatus?agentId=1&workspaceId=1 \
  -H "Authorization: Bearer <token>"
```

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Create a feature branch
2. Write tests for new functionality
3. Follow code style guidelines
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:

1. Check the [Troubleshooting Guide](./TROUBLESHOOTING.md)
2. Review the [API Documentation](./API_DOCUMENTATION.md)
3. Check existing issues on GitHub
4. Submit a new issue with detailed information

## 🗺️ Roadmap

- [ ] WebSocket support for real-time events
- [ ] GraphQL API alternative
- [ ] Multi-tenancy support
- [ ] Advanced analytics dashboard
- [ ] Machine learning-based anomaly detection
- [ ] Distributed tracing support

## 📞 Contact

For questions and support, please reach out to the Manus team.

---

**Version**: 1.0.0  
**Last Updated**: January 2024  
**Status**: Production Ready
