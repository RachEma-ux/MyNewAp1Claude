# Agent Governance Platform - API Documentation

## Overview

The Agent Governance Platform provides a comprehensive tRPC-based API for managing AI agents, policies, and governance workflows. All endpoints are authenticated and require valid user credentials.

## Base URL

```
https://your-domain.com/api/trpc
```

## Authentication

All requests require authentication via JWT token in the Authorization header or session cookie.

```
Authorization: Bearer <token>
```

---

## Agent Management

### List Agents

Retrieve all agents for the current workspace.

**Endpoint**: `agents.list`  
**Method**: Query  
**Authentication**: Required

**Response**:
```json
{
  "agents": [
    {
      "id": 1,
      "name": "Data Analyst",
      "description": "Analyzes data and generates reports",
      "roleClass": "analyst",
      "status": "governed",
      "temperature": "0.7",
      "hasDocumentAccess": true,
      "hasToolAccess": true,
      "allowedTools": ["web_search", "code_execution"],
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Get Agent

Retrieve a single agent by ID.

**Endpoint**: `agents.get`  
**Method**: Query  
**Authentication**: Required

**Input**:
```json
{
  "id": 1
}
```

**Response**:
```json
{
  "id": 1,
  "name": "Data Analyst",
  "description": "Analyzes data and generates reports",
  "roleClass": "analyst",
  "status": "governed",
  "temperature": "0.7",
  "hasDocumentAccess": true,
  "hasToolAccess": true,
  "allowedTools": ["web_search", "code_execution"],
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### Create Agent

Create a new agent.

**Endpoint**: `agents.create`  
**Method**: Mutation  
**Authentication**: Required

**Input**:
```json
{
  "name": "Data Analyst",
  "description": "Analyzes data and generates reports",
  "roleClass": "analyst",
  "systemPrompt": "You are a data analyst...",
  "modelId": "gpt-4",
  "temperature": 0.7,
  "hasDocumentAccess": true,
  "hasToolAccess": true,
  "allowedTools": ["web_search", "code_execution"]
}
```

**Response**:
```json
{
  "success": true
}
```

### Update Agent

Update an existing agent.

**Endpoint**: `agents.update`  
**Method**: Mutation  
**Authentication**: Required

**Input**:
```json
{
  "id": 1,
  "name": "Updated Analyst",
  "temperature": 0.8,
  "allowedTools": ["web_search", "code_execution", "database_query"]
}
```

**Response**:
```json
{
  "success": true
}
```

### Delete Agent

Delete an agent (soft delete - archives the agent).

**Endpoint**: `agents.delete`  
**Method**: Mutation  
**Authentication**: Required

**Input**:
```json
{
  "id": 1
}
```

**Response**:
```json
{
  "success": true
}
```

### Promote Agent

Promote an agent from draft/sandbox to governed status with policy evaluation.

**Endpoint**: `agents.promote`  
**Method**: Mutation  
**Authentication**: Required

**Input**:
```json
{
  "id": 1
}
```

**Response**:
```json
{
  "success": true,
  "compliant": true,
  "violations": [],
  "score": 100,
  "policyName": "Default Policy"
}
```

---

## Orchestrator Integration

### Start Agent

Start an agent on the external orchestrator.

**Endpoint**: `orchestrator.startAgent`  
**Method**: Mutation  
**Authentication**: Required

**Input**:
```json
{
  "agentId": 1,
  "workspaceId": 1
}
```

**Response**:
```json
{
  "success": true,
  "agentId": 1
}
```

### Stop Agent

Stop an agent on the orchestrator.

**Endpoint**: `orchestrator.stopAgent`  
**Method**: Mutation  
**Authentication**: Required

**Input**:
```json
{
  "agentId": 1,
  "workspaceId": 1
}
```

**Response**:
```json
{
  "success": true
}
```

### Get Agent Status

Get the current status of an agent.

**Endpoint**: `orchestrator.getAgentStatus`  
**Method**: Query  
**Authentication**: Required

**Input**:
```json
{
  "agentId": 1,
  "workspaceId": 1
}
```

**Response**:
```json
{
  "agentId": 1,
  "status": "running",
  "lastHeartbeat": "2024-01-15T10:35:00Z",
  "errorMessage": null
}
```

### Get Agents Statuses

Get status of multiple agents (paginated).

**Endpoint**: `orchestrator.getAgentsStatuses`  
**Method**: Query  
**Authentication**: Required

**Input**:
```json
{
  "workspaceId": 1,
  "page": 1,
  "pageSize": 20
}
```

**Response**:
```json
{
  "agents": [
    {
      "agentId": 1,
      "status": "running",
      "lastHeartbeat": "2024-01-15T10:35:00Z"
    }
  ],
  "total": 50,
  "page": 1,
  "pageSize": 20
}
```

### Get Policy Snapshot

Get the current policy snapshot from the orchestrator.

**Endpoint**: `orchestrator.getPolicySnapshot`  
**Method**: Query  
**Authentication**: Required

**Input**:
```json
{
  "workspaceId": 1
}
```

**Response**:
```json
{
  "version": 1,
  "hash": "abc123def456",
  "content": "package agent_governance...",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Hot Reload Policy

Hot reload a policy on the orchestrator.

**Endpoint**: `orchestrator.hotReloadPolicy`  
**Method**: Mutation  
**Authentication**: Required

**Input**:
```json
{
  "workspaceId": 1,
  "policyContent": "package agent_governance..."
}
```

**Response**:
```json
{
  "success": true,
  "affectedAgents": 5,
  "invalidatedAgents": [2, 3],
  "errors": []
}
```

### Revalidate Agents

Trigger revalidation of agents against a new policy.

**Endpoint**: `orchestrator.revalidateAgents`  
**Method**: Mutation  
**Authentication**: Required

**Input**:
```json
{
  "workspaceId": 1,
  "agentIds": [1, 2, 3]
}
```

**Response**:
```json
{
  "success": true,
  "affectedAgents": 3,
  "invalidatedAgents": [],
  "errors": []
}
```

### Get Agent Governance

Get governance status of an agent.

**Endpoint**: `orchestrator.getAgentGovernance`  
**Method**: Query  
**Authentication**: Required

**Input**:
```json
{
  "agentId": 1,
  "workspaceId": 1
}
```

**Response**:
```json
{
  "agentId": 1,
  "status": "governed",
  "policyHash": "abc123def456",
  "proofValid": true
}
```

### Orchestrator Health Check

Check orchestrator connectivity and health.

**Endpoint**: `orchestrator.healthCheck`  
**Method**: Query  
**Authentication**: Public

**Response**:
```json
{
  "healthy": true,
  "message": "Orchestrator is healthy"
}
```

---

## OPA Policy Management

### Evaluate Agent

Evaluate an agent against OPA policies.

**Endpoint**: `opaPolicy.evaluateAgent`  
**Method**: Mutation  
**Authentication**: Required

**Input**:
```json
{
  "agentId": 1,
  "workspaceId": 1,
  "agentData": {
    "name": "Data Analyst",
    "roleClass": "analyst",
    "temperature": 0.7,
    "hasDocumentAccess": true,
    "hasToolAccess": true,
    "allowedTools": ["web_search"]
  }
}
```

**Response**:
```json
{
  "allowed": true,
  "violations": [],
  "score": 100,
  "details": {
    "temperature_check": true,
    "access_check": true,
    "tools_check": true,
    "role_check": true
  }
}
```

### Compile Policy

Compile and validate a Rego policy.

**Endpoint**: `opaPolicy.compilePolicy`  
**Method**: Mutation  
**Authentication**: Required

**Input**:
```json
{
  "regoContent": "package agent_governance\n\nevaluate[result] { ... }"
}
```

**Response**:
```json
{
  "success": true,
  "errors": []
}
```

### Get OPA Version

Get the OPA engine version.

**Endpoint**: `opaPolicy.getVersion`  
**Method**: Query  
**Authentication**: Required

**Response**:
```json
{
  "version": "0.45.0"
}
```

### OPA Health Check

Check OPA engine health.

**Endpoint**: `opaPolicy.healthCheck`  
**Method**: Query  
**Authentication**: Required

**Response**:
```json
{
  "healthy": true,
  "message": "OPA is healthy"
}
```

### Save Policy

Save a policy to the database.

**Endpoint**: `opaPolicy.savePolicy`  
**Method**: Mutation  
**Authentication**: Required

**Input**:
```json
{
  "workspaceId": 1,
  "name": "Default Policy",
  "regoContent": "package agent_governance...",
  "description": "Default governance policy",
  "isActive": true
}
```

**Response**:
```json
{
  "success": true,
  "policyId": 123
}
```

### Get Policies

Get all policies for a workspace.

**Endpoint**: `opaPolicy.getPolicies`  
**Method**: Query  
**Authentication**: Required

**Input**:
```json
{
  "workspaceId": 1
}
```

**Response**:
```json
[
  {
    "id": 1,
    "name": "Default Policy",
    "content": "package agent_governance...",
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

### Get Active Policy

Get the active policy for a workspace.

**Endpoint**: `opaPolicy.getActivePolicy`  
**Method**: Query  
**Authentication**: Required

**Input**:
```json
{
  "workspaceId": 1
}
```

**Response**:
```json
{
  "id": 1,
  "name": "Default Policy",
  "content": "package agent_governance...",
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

## Error Handling

All endpoints return errors in the following format:

```json
{
  "code": "INTERNAL_SERVER_ERROR",
  "message": "Descriptive error message"
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Resource not found |
| `BAD_REQUEST` | Invalid input parameters |
| `UNAUTHORIZED` | Authentication required |
| `FORBIDDEN` | Access denied |
| `INTERNAL_SERVER_ERROR` | Server error |

---

## Rate Limiting

API requests are rate-limited to 1000 requests per hour per user.

---

## Pagination

Paginated endpoints support the following parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number (1-indexed) |
| `pageSize` | number | 20 | Number of items per page |

---

## Timestamps

All timestamps are in ISO 8601 format (UTC):

```
2024-01-15T10:30:00Z
```

---

## Examples

### Create and Promote an Agent

```typescript
// 1. Create agent
const createResponse = await trpc.agents.create.mutate({
  name: "Data Analyst",
  roleClass: "analyst",
  systemPrompt: "You are a data analyst...",
  modelId: "gpt-4",
  hasDocumentAccess: true,
  hasToolAccess: true,
  allowedTools: ["web_search"],
});

// 2. Get the agent ID from the response
const agentId = createResponse.id;

// 3. Promote the agent
const promoteResponse = await trpc.agents.promote.mutate({
  id: agentId,
});

// 4. Check compliance
if (promoteResponse.compliant) {
  console.log("Agent promoted successfully");
} else {
  console.log("Violations:", promoteResponse.violations);
}
```

### Start an Agent and Monitor Status

```typescript
// 1. Start the agent
await trpc.orchestrator.startAgent.mutate({
  agentId: 1,
  workspaceId: 1,
});

// 2. Poll for status
const status = await trpc.orchestrator.getAgentStatus.query({
  agentId: 1,
  workspaceId: 1,
});

console.log("Agent status:", status.status);
```

### Hot Reload Policy

```typescript
// 1. Get current policy
const policy = await trpc.opaPolicy.getActivePolicy.query({
  workspaceId: 1,
});

// 2. Update policy content
const updatedContent = policy.content + "\n// New rule...";

// 3. Hot reload
const result = await trpc.orchestrator.hotReloadPolicy.mutate({
  workspaceId: 1,
  policyContent: updatedContent,
});

console.log("Affected agents:", result.affectedAgents);
```
