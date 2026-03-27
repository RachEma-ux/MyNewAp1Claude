/**
 * Action Key Map — Unified Governance v1
 *
 * Maps tRPC procedure paths to platform_action_registry.yaml action keys.
 * Every mutation in the system must appear here.
 *
 * Format: "router.procedure" → "registry.action.key"
 *
 * If a tRPC path is not in this map, the governance middleware will
 * derive a fallback key from the path itself. The coverage map script
 * will flag any unmapped mutations.
 */

export const ACTION_KEY_MAP: Record<string, string> = {
  // ── Auth ─────────────────────────────────────────────────────────────────
  "auth.logout": "auth.logout",

  // ── Workspace ────────────────────────────────────────────────────────────
  "workspaces.create": "workspace.create",
  "workspaces.createDraft": "workspace.createDraft",
  "workspaces.update": "workspace.update",
  "workspaces.updateDraft": "workspace.updateDraft",
  "workspaces.submitForReview": "workspace.submitForReview",
  "workspaces.review": "workspace.review",
  "workspaces.approve": "workspace.approve",
  "workspaces.publish": "workspace.publish",
  "workspaces.activate": "workspace.activate",
  "workspaces.reject": "workspace.reject",
  "workspaces.archive": "workspace.archive",
  "workspaces.returnToDraft": "workspace.returnToDraft",
  "workspaces.updateRoutingProfile": "workspace.updateRoutingProfile",
  "workspaces.delete": "workspace.delete",
  "workspaces.members.add": "workspace.members.add",
  "workspaces.members.remove": "workspace.members.remove",
  "workspaces.members.updateRole": "workspace.members.updateRole",
  "workspaces.crew.add": "workspace.crew.add",
  "workspaces.crew.remove": "workspace.crew.remove",
  "workspaces.crew.update": "workspace.crew.update",
  "workspaces.modules.updateConfig": "workspace.modules.updateConfig",

  // ── Models ───────────────────────────────────────────────────────────────
  "models.create": "model.create",
  "models.update": "model.update",
  "models.delete": "model.delete",
  "models.startDownload": "model.startDownload",
  "models.importToCatalog": "model.importToCatalog",

  // ── Providers ────────────────────────────────────────────────────────────
  "providers.create": "provider.create",
  "providers.update": "provider.update",
  "providers.delete": "provider.delete",
  "providers.testConnection": "provider.testConnection",
  "providers.enableModel": "provider.enableModel",
  "providers.disableModel": "provider.disableModel",
  "providers.setDefault": "provider.setDefault",
  "providers.updateModelConfig": "provider.updateModelConfig",
  "providers.updateRateLimits": "provider.updateRateLimits",
  "providers.resetStats": "provider.resetStats",
  "providers.importToCatalog": "provider.importToCatalog",
  "providers.refreshModels": "provider.refreshModels",
  "providers.batchToggle": "provider.batchToggle",

  // ── Provider Connections ─────────────────────────────────────────────────
  "providerConnections.test": "providerConnection.test",
  "providerConnections.create": "providerConnection.create",
  "providerConnections.validateAndStore": "providerConnection.validateAndStore",
  "providerConnections.activate": "providerConnection.activate",
  "providerConnections.disable": "providerConnection.disable",
  "providerConnections.healthCheck": "providerConnection.healthCheck",
  "providerConnections.rotate": "providerConnection.rotate",
  "providerConnections.delete": "providerConnection.delete",

  // ── Chat ─────────────────────────────────────────────────────────────────
  "chat.send": "chat.send",
  "chat.createConversation": "chat.createConversation",
  "chat.clearConversation": "chat.clearConversation",
  "chat.deleteConversation": "chat.deleteConversation",
  "chat.updateSettings": "chat.updateSettings",
  "chat.generateTitle": "chat.generateTitle",

  // ── Conversations ────────────────────────────────────────────────────────
  "conversations.create": "conversation.create",
  "conversations.update": "conversation.update",
  "conversations.delete": "conversation.delete",

  // ── Agents (standalone router) ───────────────────────────────────────────
  "agents.create": "agent.create",
  "agents.update": "agent.update",
  "agents.delete": "agent.delete",
  "agents.runDriftDetection": "agent.runDriftDetection",
  "agents.exportCompliance": "agent.exportCompliance",
  "agents.autoRemediate": "agent.autoRemediate",
  "agents.deployTemplate": "agent.deployTemplate",
  "agents.promote": "agent.promote",
  "agents.register": "agent.register",
  "agents.updateConfig": "agent.updateConfig",
  "agents.invoke": "agent.invoke",
  "agents.admitToSandbox": "agent.admitToSandbox",
  "agents.controlPlane.promote": "agent.controlPlane.promote",
  "agents.disable": "agent.disable",
  "agents.diff": "agent.diff",
  "agents.importToCatalog": "agent.importToCatalog",

  // ── Agent Promotions ─────────────────────────────────────────────────────
  "agentPromotions.createRequest": "agentPromotion.createRequest",
  "agentPromotions.approve": "agentPromotion.approve",
  "agentPromotions.reject": "agentPromotion.reject",
  "agentPromotions.execute": "agentPromotion.execute",

  // ── Documents ────────────────────────────────────────────────────────────
  "documents.create": "document.create",
  "documents.update": "document.update",
  "documents.delete": "document.delete",
  "documents.upload": "document.upload",
  "documents.bulkDelete": "document.bulkDelete",
  "documentsApi.process": "document.process",
  "documentsApi.reprocess": "document.reprocess",

  // ── Automation / Workflows ───────────────────────────────────────────────
  "automation.createWorkflow": "workflow.create",
  "automation.updateWorkflow": "workflow.update",
  "automation.deleteWorkflow": "workflow.delete",
  "automation.publishWorkflow": "workflow.publish",
  "automation.rollbackToVersion": "workflow.rollback",
  "automation.executeWorkflow": "workflow.execute",
  "automation.cancelExecution": "workflow.cancel",

  // ── Secrets ──────────────────────────────────────────────────────────────
  "secrets.create": "secret.create",
  "secrets.update": "secret.update",
  "secrets.delete": "secret.delete",

  // ── Key Rotation ─────────────────────────────────────────────────────────
  "keyRotation.keys.create": "keyRotation.createKey",
  "keyRotation.keys.activate": "keyRotation.activateKey",
  "keyRotation.keys.revoke": "keyRotation.revokeKey",
  "keyRotation.versions.create": "keyRotation.createVersion",
  "keyRotation.versions.activate": "keyRotation.activateVersion",
  "keyRotation.versions.deprecate": "keyRotation.deprecateVersion",
  "keyRotation.rotations.create": "keyRotation.createRotation",
  "keyRotation.rotations.complete": "keyRotation.completeRotation",
  "keyRotation.rotations.fail": "keyRotation.failRotation",
  "keyRotation.rotations.rollback": "keyRotation.rollbackRotation",
  "keyRotation.policies.create": "keyRotation.createPolicy",
  "keyRotation.policies.activate": "keyRotation.activatePolicy",
  "keyRotation.policies.deactivate": "keyRotation.deactivatePolicy",

  // ── Triggers & Actions ───────────────────────────────────────────────────
  "triggers.create": "trigger.create",
  "triggers.approve": "trigger.approve",
  "triggers.reject": "trigger.reject",
  "triggers.delete": "trigger.delete",
  "actions.create": "action.create",
  "actions.approve": "action.approve",
  "actions.reject": "action.reject",
  "actions.delete": "action.delete",

  // ── Templates ────────────────────────────────────────────────────────────
  "templates.create": "template.create",
  "templates.update": "template.update",
  "templates.delete": "template.delete",
  "templates.duplicate": "template.duplicate",

  // ── Protocols ────────────────────────────────────────────────────────────
  "protocols.create": "protocol.create",
  "protocols.update": "protocol.update",
  "protocols.delete": "protocol.delete",
  "protocols.activate": "protocol.activate",

  // ── WCP Workflows ────────────────────────────────────────────────────────
  "wcpWorkflows.create": "wcpWorkflow.create",
  "wcpWorkflows.update": "wcpWorkflow.update",
  "wcpWorkflows.delete": "wcpWorkflow.delete",

  // ── Policies ─────────────────────────────────────────────────────────────
  "policies.create": "policy.create",
  "policies.update": "policy.update",
  "policies.delete": "policy.delete",
  "policies.activate": "policy.activate",
  "policies.createFromTemplate": "policy.createFromTemplate",

  // ── Wiki ─────────────────────────────────────────────────────────────────
  "wiki.create": "wiki.create",
  "wiki.update": "wiki.update",
  "wiki.delete": "wiki.delete",
  "wiki.reorder": "wiki.reorder",
  "wiki.move": "wiki.move",
  "wiki.addTag": "wiki.addTag",

  // ── LLM Engine ───────────────────────────────────────────────────────────
  "llm.create": "llm.create",
  "llm.update": "llm.update",
  "llm.delete": "llm.delete",
  "llm.activate": "llm.activate",
  "llm.benchmark": "llm.benchmark",
  "llm.updateCapabilities": "llm.updateCapabilities",
  "llm.updatePricing": "llm.updatePricing",
  "llm.setDefault": "llm.setDefault",
  "llm.configureRouting": "llm.configureRouting",
  "llm.importToCatalog": "llm.importToCatalog",

  // ── LLM Providers ───────────────────────────────────────────────────────
  "llm.providers.register": "llmProvider.register",
  "llm.providers.configureProvider": "llmProvider.configureProvider",
  "llm.providers.deleteCredentials": "llmProvider.deleteCredentials",
  "llm.providers.updateStatus": "llmProvider.updateStatus",
  "llm.providers.test": "llmProvider.test",
  "llm.providers.sync": "llmProvider.sync",

  // ── LLM Creation ────────────────────────────────────────────────────────
  "llm.creation.create": "llmCreation.create",
  "llm.creation.update": "llmCreation.update",
  "llm.creation.delete": "llmCreation.delete",
  "llm.creation.startTraining": "llmCreation.startTraining",
  "llm.creation.cancelTraining": "llmCreation.cancelTraining",
  "llm.creation.startQuantization": "llmCreation.startQuantization",
  "llm.creation.updateDataset": "llmCreation.updateDataset",
  "llm.creation.deleteDataset": "llmCreation.deleteDataset",
  "llm.creation.uploadDataset": "llmCreation.uploadDataset",
  "llm.creation.createEvaluation": "llmCreation.createEvaluation",
  "llm.creation.deleteEvaluation": "llmCreation.deleteEvaluation",
  "llm.creation.addCheckpoint": "llmCreation.addCheckpoint",
  "llm.creation.removeCheckpoint": "llmCreation.removeCheckpoint",

  // ── Deploy ───────────────────────────────────────────────────────────────
  "deploy.trigger": "deploy.trigger",
  "deploy.cancel": "deploy.cancel",
  "deploy.rerun": "deploy.rerun",

  // ── Bots ───────────────────────────────────────────────────────────────
  "bots.create": "bot.create",
  "bots.updateStatus": "bot.updateStatus",
  "bots.importToCatalog": "bot.importToCatalog",

  // ── Catalog Management ───────────────────────────────────────────────────
  "catalogManage.discoverProvider": "catalog.discover",
  "catalogManage.submitFromDiscovery": "catalog.submitFromDiscovery",
  "catalogManage.create": "catalog.create",
  "catalogManage.update": "catalog.update",
  "catalogManage.delete": "catalog.delete",
  "catalogManage.validate": "catalog.validate",
  "catalogManage.approve": "catalog.approve",
  "catalogManage.reject": "catalog.reject",
  "catalogManage.activate": "catalog.activate",
  "catalogManage.publish": "catalog.publish",
  "catalogManage.syncProviders": "catalog.syncProviders",
  "catalogManage.syncRegistry": "catalog.syncRegistry",
  "catalogManage.recall": "catalog.recall",
  "catalogManage.classify": "catalog.classify",
  "catalogManage.autoClassify": "catalog.autoClassify",
  "catalogManage.bulkAutoClassify": "catalog.bulkAutoClassify",

  // ── Catalog Import ───────────────────────────────────────────────────────
  "catalogImport.discoverFromApi": "catalogImport.discoverFromApi",
  "catalogImport.parseFile": "catalogImport.parseFile",
  "catalogImport.bulkCreate": "catalogImport.bulkCreate",
  "catalogImport.importUrl": "catalogImport.importUrl",
  "catalogImport.retryAll": "catalogImport.retryAll",
  "catalogImport.resolveConflict": "catalogImport.resolveConflict",

  // ── Discovery Ops ────────────────────────────────────────────────────────
  "discoveryOps.markInReview": "discoveryOps.markInReview",
  "discoveryOps.reject": "discoveryOps.reject",
  "discoveryOps.accept": "discoveryOps.accept",
  "discoveryOps.batchAutoPromote": "discoveryOps.batchAutoPromote",
  "discoveryOps.cleanup": "discoveryOps.cleanup",

  // ── Embeddings ───────────────────────────────────────────────────────────
  "embeddings.generate": "embedding.generate",
  "embeddings.clearCache": "embedding.clearCache",

  // ── Vector DB ────────────────────────────────────────────────────────────
  "vectordb.createCollection": "vectordb.createCollection",
  "vectordb.deleteCollection": "vectordb.deleteCollection",
  "vectordb.upsertPoints": "vectordb.upsertPoints",

  // ── Inference ────────────────────────────────────────────────────────────
  "inference.run": "inference.run",
  "inference.batch": "inference.batch",
  "inference.hybrid": "inference.hybrid",

  // ── Model Downloads ──────────────────────────────────────────────────────
  "modelDownloads.start": "modelDownload.start",
  "modelDownloads.cancel": "modelDownload.cancel",
  "modelDownloads.pause": "modelDownload.pause",
  "modelDownloads.resume": "modelDownload.resume",
  "modelDownloads.retry": "modelDownload.retry",
  "modelDownloads.delete": "modelDownload.delete",
  "modelDownloads.cleanup": "modelDownload.cleanup",
  "modelDownloads.convert": "modelDownload.convert",

  // ── Model Benchmarks ────────────────────────────────────────────────────
  "modelBenchmarks.run": "modelBenchmark.run",

  // ── Model Versions ──────────────────────────────────────────────────────
  "modelVersions.create": "modelVersion.create",
  "modelVersions.activate": "modelVersion.activate",
  "modelVersions.archive": "modelVersion.archive",
  "modelVersions.delete": "modelVersion.delete",
  "modelVersions.rollback": "modelVersion.rollback",

  // ── Hardware ─────────────────────────────────────────────────────────────
  "hardware.clearCache": "hardware.clearCache",

  // ── System ───────────────────────────────────────────────────────────────
  "system.updateSetting": "system.updateSetting",

  // ── Governance ───────────────────────────────────────────────────────────
  "governance.stageTransition": "governance.stageTransition",
  "governance.driftToggle": "governance.driftToggle",
  "governance.unfreezeSubject": "governance.unfreezeSubject",

  // ── Platform Engines — PMT ───────────────────────────────────────────────
  "modules.pmt.projects.create": "pmt.project.create",
  "modules.pmt.projects.update": "pmt.project.update",
  "modules.pmt.projects.delete": "pmt.project.delete",
  "modules.pmt.tasks.create": "pmt.task.create",
  "modules.pmt.tasks.update": "pmt.task.update",
  "modules.pmt.tasks.delete": "pmt.task.delete",
  "modules.pmt.dependencies.add": "pmt.dependency.add",
  "modules.pmt.dependencies.remove": "pmt.dependency.remove",
  "modules.pmt.templates.projectTemplates.create": "pmt.projectTemplate.create",
  "modules.pmt.templates.projectTemplates.update": "pmt.projectTemplate.update",
  "modules.pmt.templates.projectTemplates.delete": "pmt.projectTemplate.delete",
  "modules.pmt.templates.projectTemplates.useTemplate": "pmt.projectTemplate.apply",
  "modules.pmt.templates.projectTemplates.applyExample": "pmt.projectTemplate.apply",
  "modules.pmt.templates.projectTemplates.seed": "pmt.projectTemplate.seed",
  "modules.pmt.templates.workItemTemplates.create": "pmt.workItemTemplate.create",
  "modules.pmt.templates.workItemTemplates.update": "pmt.workItemTemplate.update",
  "modules.pmt.templates.workItemTemplates.delete": "pmt.workItemTemplate.delete",
  "modules.pmt.templates.workItemTemplates.useTemplate": "pmt.workItemTemplate.apply",

  // ── Platform Engines — Knowledge ─────────────────────────────────────────
  "modules.knowledge.documents.create": "knowledge.document.create",
  "modules.knowledge.documents.update": "knowledge.document.update",
  "modules.knowledge.documents.delete": "knowledge.document.delete",
  "modules.knowledge.chunks.create": "knowledge.chunk.create",
  "modules.knowledge.chunks.update": "knowledge.chunk.update",
  "modules.knowledge.decisions.create": "knowledge.decision.create",
  "modules.knowledge.decisions.update": "knowledge.decision.update",

  // ── Platform Engines — Agent Orchestration ───────────────────────────────
  "modules.agentOrch.agents.create": "agents.workspace.create",
  "modules.agentOrch.agents.update": "agents.workspace.update",
  "modules.agentOrch.agents.delete": "agents.workspace.delete",
  "modules.agentOrch.runs.request": "agents.run.request",
  "modules.agentOrch.runs.execute": "agents.run.execute",
  "modules.agentOrch.runs.complete": "agents.run.complete",

  // ── Platform Engines — Collaboration ─────────────────────────────────────
  "modules.collaboration.threads.create": "collaboration.thread.create",
  "modules.collaboration.threads.update": "collaboration.thread.update",
  "modules.collaboration.threads.delete": "collaboration.thread.delete",
  "modules.collaboration.messages.create": "collaboration.message.create",
  "modules.collaboration.messages.update": "collaboration.message.update",
  "modules.collaboration.messages.delete": "collaboration.message.delete",

  // ── Platform Engines — Reporting ────────────────────────────────────────
  "modules.reporting.velocity.view": "reporting.velocity.view",
  "modules.reporting.approvalLatency.view": "reporting.approvalLatency.view",
  "modules.reporting.agentReliability.view": "reporting.agentReliability.view",
  "modules.reporting.riskHeatmap.view": "reporting.riskHeatmap.view",
  "modules.reporting.export": "reporting.export",

  // ── Projects System (PS) ───────────────────────────────────────────────
  "ps.systems.create": "ps.system.create",
  "ps.systems.updateName": "ps.system.update",
  "ps.projects.create": "ps.project.create",
  "ps.projects.validate": "ps.project.validate",
  "ps.projects.sendToPM": "ps.project.sendToPM",
  "ps.wizardRuns.create": "ps.wizardRun.create",
  "ps.wizardRuns.accept": "ps.wizardRun.create",
  "ps.lifecycle.submit": "ps.project.submit",
  "ps.lifecycle.validate": "ps.project.validate",
  "ps.lifecycle.reject": "ps.project.reject",
  "ps.lifecycle.publish": "ps.project.publish",
  "ps.lifecycle.sendToPM": "ps.project.sendToPM",
  "ps.governance.approve": "ps.project.validate",
  "ps.governance.reject": "ps.project.reject",
  "ps.governance.overrideScope": "ps.project.override",
  "ps.pmBridge.sendToPM": "ps.project.sendToPM",
  "ps.feedback.create": "ps.feedback.create",
  "ps.demand.create": "ps.demand.create",
  "ps.demand.updateStatus": "ps.demand.updateStatus",
  "ps.demand.generateForSystem": "ps.demand.generate",

  // ── Modules (Engine Binding) ─────────────────────────────────────────────
  "modules.manage.setEnabled": "module.setEnabled",
  "modules.manage.seed": "module.seed",
};

/**
 * Resolve a tRPC procedure path to an action key.
 * Returns the mapped key if found, otherwise constructs a fallback.
 */
export function resolveActionKey(trpcPath: string): string {
  const mapped = ACTION_KEY_MAP[trpcPath];
  if (mapped) return mapped;

  // Fallback: convert path to dot notation (already is)
  // This will hit deny-by-default in the registry
  return trpcPath;
}
