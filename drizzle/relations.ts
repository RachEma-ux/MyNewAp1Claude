import { relations } from "drizzle-orm";
import {
  users,
  workspaces,
  workspaceMembers,
  models,
  modelConfigs,
  documents,
  documentChunks,
  conversations,
  messages,
  workflows,
  workflowVersions,
  workflowExecutions,
  workflowExecutionLogs,
  providers,
  workspaceProviders,
  providerUsage,
  providerHealthChecks,
  providerMetrics,
  routingAuditLogs,
  agents,
  agentHistory,
  agentVersions,
  promotionRequests,
  protocols,
} from "./schema";

// ============================================================================
// User Relations
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  ownedWorkspaces: many(workspaces),
  workspaceMemberships: many(workspaceMembers),
  modelConfigs: many(modelConfigs),
  documents: many(documents),
  conversations: many(conversations),
  workflows: many(workflows),
  agents: many(agents),
  protocols: many(protocols),
}));

// ============================================================================
// Workspace Relations
// ============================================================================

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, { fields: [workspaces.ownerId], references: [users.id] }),
  members: many(workspaceMembers),
  documents: many(documents),
  conversations: many(conversations),
  workflows: many(workflows),
  providers: many(workspaceProviders),
  agents: many(agents),
  protocols: many(protocols),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));

// ============================================================================
// Model Relations
// ============================================================================

export const modelsRelations = relations(models, ({ many }) => ({
  configs: many(modelConfigs),
  conversations: many(conversations),
}));

export const modelConfigsRelations = relations(modelConfigs, ({ one }) => ({
  model: one(models, { fields: [modelConfigs.modelId], references: [models.id] }),
  user: one(users, { fields: [modelConfigs.userId], references: [users.id] }),
}));

// ============================================================================
// Document Relations
// ============================================================================

export const documentsRelations = relations(documents, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [documents.workspaceId], references: [workspaces.id] }),
  uploader: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
  chunks: many(documentChunks),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, { fields: [documentChunks.documentId], references: [documents.id] }),
}));

// ============================================================================
// Conversation Relations
// ============================================================================

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [conversations.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  agent: one(agents, { fields: [conversations.agentId], references: [agents.id] }),
  model: one(models, { fields: [conversations.modelId], references: [models.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

// ============================================================================
// Workflow Relations
// ============================================================================

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  owner: one(users, { fields: [workflows.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [workflows.workspaceId], references: [workspaces.id] }),
  versions: many(workflowVersions),
  executions: many(workflowExecutions),
}));

export const workflowVersionsRelations = relations(workflowVersions, ({ one }) => ({
  workflow: one(workflows, { fields: [workflowVersions.workflowId], references: [workflows.id] }),
  publisher: one(users, { fields: [workflowVersions.publishedBy], references: [users.id] }),
}));

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one, many }) => ({
  workflow: one(workflows, { fields: [workflowExecutions.workflowId], references: [workflows.id] }),
  version: one(workflowVersions, { fields: [workflowExecutions.versionId], references: [workflowVersions.id] }),
  logs: many(workflowExecutionLogs),
}));

export const workflowExecutionLogsRelations = relations(workflowExecutionLogs, ({ one }) => ({
  execution: one(workflowExecutions, { fields: [workflowExecutionLogs.executionId], references: [workflowExecutions.id] }),
}));

// ============================================================================
// Provider Relations
// ============================================================================

export const providersRelations = relations(providers, ({ many }) => ({
  workspaceLinks: many(workspaceProviders),
  usage: many(providerUsage),
  healthChecks: many(providerHealthChecks),
  metrics: many(providerMetrics),
}));

export const workspaceProvidersRelations = relations(workspaceProviders, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceProviders.workspaceId], references: [workspaces.id] }),
  provider: one(providers, { fields: [workspaceProviders.providerId], references: [providers.id] }),
}));

export const providerUsageRelations = relations(providerUsage, ({ one }) => ({
  workspace: one(workspaces, { fields: [providerUsage.workspaceId], references: [workspaces.id] }),
  provider: one(providers, { fields: [providerUsage.providerId], references: [providers.id] }),
}));

export const providerHealthChecksRelations = relations(providerHealthChecks, ({ one }) => ({
  provider: one(providers, { fields: [providerHealthChecks.providerId], references: [providers.id] }),
}));

export const providerMetricsRelations = relations(providerMetrics, ({ one }) => ({
  provider: one(providers, { fields: [providerMetrics.providerId], references: [providers.id] }),
}));

export const routingAuditLogsRelations = relations(routingAuditLogs, ({ one }) => ({
  workspace: one(workspaces, { fields: [routingAuditLogs.workspaceId], references: [workspaces.id] }),
  primaryProvider: one(providers, { fields: [routingAuditLogs.primaryProviderId], references: [providers.id] }),
  actualProvider: one(providers, { fields: [routingAuditLogs.actualProviderId], references: [providers.id] }),
}));

// ============================================================================
// Agent Relations
// ============================================================================

export const agentsRelations = relations(agents, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [agents.workspaceId], references: [workspaces.id] }),
  creator: one(users, { fields: [agents.createdBy], references: [users.id] }),
  history: many(agentHistory),
  versions: many(agentVersions),
  promotionRequests: many(promotionRequests),
  conversations: many(conversations),
}));

export const agentHistoryRelations = relations(agentHistory, ({ one }) => ({
  agent: one(agents, { fields: [agentHistory.agentId], references: [agents.id] }),
}));

export const agentVersionsRelations = relations(agentVersions, ({ one }) => ({
  agent: one(agents, { fields: [agentVersions.agentId], references: [agents.id] }),
  creator: one(users, { fields: [agentVersions.createdBy], references: [users.id] }),
}));

export const promotionRequestsRelations = relations(promotionRequests, ({ one }) => ({
  agent: one(agents, { fields: [promotionRequests.agentId], references: [agents.id] }),
  requester: one(users, { fields: [promotionRequests.requestedBy], references: [users.id] }),
}));

// ============================================================================
// Protocol Relations
// ============================================================================

export const protocolsRelations = relations(protocols, ({ one }) => ({
  workspace: one(workspaces, { fields: [protocols.workspaceId], references: [workspaces.id] }),
  creator: one(users, { fields: [protocols.createdBy], references: [users.id] }),
}));
