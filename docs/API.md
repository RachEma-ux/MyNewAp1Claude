# API Documentation

## Overview

This document provides comprehensive API documentation for the Unified LLM platform.

## Authentication

All API endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

## Endpoints

### Workspaces

#### List Workspaces
```
GET /api/trpc/workspaces.list
```

Returns all workspaces for the authenticated user.

#### Create Workspace
```
POST /api/trpc/workspaces.create
```

**Body:**
```json
{
  "name": "My Workspace",
  "description": "Workspace description"
}
```

#### Delete Workspace
```
POST /api/trpc/workspaces.delete
```

**Body:**
```json
{
  "workspaceId": 1
}
```

---

### Providers

#### List Providers
```
GET /api/trpc/providers.list
```

Returns all configured LLM providers.

#### Configure Provider
```
POST /api/trpc/providers.configure
```

**Body:**
```json
{
  "providerId": 1,
  "apiKey": "sk-...",
  "config": {}
}
```

#### Test Connection
```
POST /api/trpc/providers.testConnection
```

**Body:**
```json
{
  "providerId": 1
}
```

---

### Chat

#### Send Message
```
POST /api/trpc/chat.sendMessage
```

**Body:**
```json
{
  "providerId": 1,
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "temperature": 0.7,
  "maxTokens": 2000,
  "useRAG": false,
  "workspaceId": 1
}
```

#### Stream Message
```
POST /api/chat/stream
```

**Body:**
```json
{
  "providerId": 1,
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "useRAG": false,
  "workspaceId": 1
}
```

Returns Server-Sent Events (SSE) stream.

#### List Conversations
```
GET /api/trpc/chat.listConversations
```

#### Delete Conversation
```
POST /api/trpc/chat.deleteConversation
```

**Body:**
```json
{
  "conversationId": 1
}
```

---

### Documents

#### Upload Document
```
POST /api/trpc/documentsApi.uploadFile
```

**Body:**
```json
{
  "workspaceId": 1,
  "fileUrl": "https://...",
  "filename": "document.pdf",
  "collectionName": "my-docs"
}
```

#### List Documents
```
GET /api/trpc/documentsApi.list
```

**Query:**
```json
{
  "workspaceId": 1,
  "status": "completed"
}
```

#### Delete Document
```
POST /api/trpc/documentsApi.delete
```

**Body:**
```json
{
  "documentId": 1
}
```

---

### Agents

#### List Agent Templates
```
GET /api/trpc/agents.listTemplates
```

#### Deploy Agent
```
POST /api/trpc/agents.deployTemplate
```

**Body:**
```json
{
  "templateId": "research-assistant",
  "workspaceId": 1,
  "name": "My Research Agent",
  "config": {}
}
```

#### Chat with Agent
```
POST /api/trpc/agents.chat
```

**Body:**
```json
{
  "agentId": 1,
  "message": "Research topic X",
  "conversationId": 1
}
```

---

### Automation

#### Create Workflow
```
POST /api/trpc/automation.createWorkflow
```

**Body:**
```json
{
  "name": "My Workflow",
  "trigger": {
    "type": "time",
    "config": { "schedule": "0 0 * * *" }
  },
  "actions": [
    { "type": "send_email", "config": {} }
  ]
}
```

#### Execute Workflow
```
POST /api/trpc/automation.executeWorkflow
```

**Body:**
```json
{
  "workflowId": 1
}
```

#### List Executions
```
GET /api/trpc/automation.listExecutions
```

---

### Models

#### List Models
```
GET /api/trpc/models.list
```

#### Download Model
```
POST /api/trpc/models.download
```

**Body:**
```json
{
  "modelId": "meta-llama/Llama-2-7b",
  "quantization": "Q4_K_M"
}
```

#### Convert to GGUF
```
POST /api/trpc/models.convertToGGUF
```

**Body:**
```json
{
  "modelPath": "/path/to/model",
  "outputPath": "/path/to/output.gguf"
}
```

---

### Hardware

#### Get Hardware Profile
```
GET /api/trpc/hardware.getProfile
```

Returns GPU/CPU/RAM information.

#### Get Model Recommendations
```
GET /api/trpc/hardware.getRecommendations
```

Returns recommended models based on hardware capabilities.

#### Get Resource Stats
```
GET /api/trpc/hardware.getResourceStats
```

Returns current resource usage statistics.

---

### Vector Database

#### Search
```
POST /api/trpc/vectordb.search
```

**Body:**
```json
{
  "collection": "workspace-1",
  "query": "search text",
  "limit": 10
}
```

#### Insert Vectors
```
POST /api/trpc/vectordb.insert
```

**Body:**
```json
{
  "collection": "workspace-1",
  "vectors": [[0.1, 0.2, ...]],
  "payloads": [{ "text": "..." }]
}
```

---

## Error Handling

All endpoints return errors in the following format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "data": {}
  }
}
```

### Common Error Codes

- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `BAD_REQUEST` - Invalid request parameters
- `INTERNAL_SERVER_ERROR` - Server error

---

## Rate Limiting

API requests are rate-limited to:
- 100 requests per minute for standard endpoints
- 10 requests per minute for model downloads
- 1000 requests per minute for chat streaming

---

## Webhooks

Configure webhooks to receive notifications for events:

```
POST /api/webhooks/register
```

**Body:**
```json
{
  "url": "https://your-server.com/webhook",
  "events": ["workflow.completed", "document.processed"],
  "secret": "your-secret"
}
```

### Webhook Events

- `workflow.completed` - Workflow execution completed
- `workflow.failed` - Workflow execution failed
- `document.processed` - Document processing completed
- `model.downloaded` - Model download completed
- `agent.response` - Agent generated response

---

## SDKs

Official SDKs available for:
- JavaScript/TypeScript
- Python
- Go
- Rust

Install via:
```bash
npm install @unified-llm/sdk
pip install unified-llm
```

---

## Support

For API support:
- Documentation: https://docs.unified-llm.ai
- GitHub: https://github.com/unified-llm/platform
- Discord: https://discord.gg/unified-llm
