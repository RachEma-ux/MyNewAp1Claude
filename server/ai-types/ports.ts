/**
 * AI Types Module — Port Interfaces
 *
 * These interfaces define the contracts between the AI Types module
 * and external modules (providers, agents, governance). External
 * dependencies are injected at boot time via setter functions,
 * keeping the module boundary clean.
 *
 * No file inside server/ai-types/ should import directly from
 * server/providers/, server/agents/, or server/governance/.
 */

// ── Provider Port ────────────────────────────────────────────────────────

export interface StreamRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface IStreamingProvider {
  id: string;
  name: string;
  generateStream(request: StreamRequest): AsyncIterable<any>;
}

export interface IProviderRegistry {
  getProvider(providerId: number): IStreamingProvider | undefined;
  getAllProviders(): IStreamingProvider[];
}

export interface ICatalogProviderPort {
  getRegistry(): IProviderRegistry;
}

// ── Agent Port ───────────────────────────────────────────────────────────

export interface AgentRecord {
  id: number;
  name: string;
  systemPrompt?: string | null;
  modelId?: string | null;
  providerId?: number | null;
  [key: string]: unknown;
}

export interface ICatalogAgentPort {
  getAgent(agentId: number): Promise<AgentRecord | null>;
}

// ── Governance Port ──────────────────────────────────────────────────────

export interface StageReviewResult {
  decision: "pass" | "block" | "warn";
  findings: Array<{ code: string; severity: string; message: string }>;
}

export interface ICatalogGovernancePort {
  evaluateStageReview(
    entryId: number,
    stage: string,
    context?: Record<string, unknown>,
  ): Promise<StageReviewResult>;
}

// ── Provider DB Port (for catalog-manage operations) ─────────────────────

export interface ProviderRecord {
  id: number;
  name: string;
  displayName?: string | null;
  [key: string]: unknown;
}

export interface ICatalogProviderDbPort {
  getAllProviders(): Promise<ProviderRecord[]>;
  getProviderById(id: number): Promise<ProviderRecord | null>;
}

// ── Port Registry (singleton, wired at boot) ─────────────────────────────

let _providerPort: ICatalogProviderPort | null = null;
let _agentPort: ICatalogAgentPort | null = null;
let _governancePort: ICatalogGovernancePort | null = null;
let _providerDbPort: ICatalogProviderDbPort | null = null;

export function setProviderPort(port: ICatalogProviderPort) {
  _providerPort = port;
}
export function setAgentPort(port: ICatalogAgentPort) {
  _agentPort = port;
}
export function setGovernancePort(port: ICatalogGovernancePort) {
  _governancePort = port;
}
export function setProviderDbPort(port: ICatalogProviderDbPort) {
  _providerDbPort = port;
}

export function getProviderPort(): ICatalogProviderPort {
  if (!_providerPort) throw new Error("[AI Types] Provider port not initialized. Call bootAiTypesModule() first.");
  return _providerPort;
}
export function getAgentPort(): ICatalogAgentPort {
  if (!_agentPort) throw new Error("[AI Types] Agent port not initialized. Call bootAiTypesModule() first.");
  return _agentPort;
}
export function getGovernancePort(): ICatalogGovernancePort {
  if (!_governancePort) throw new Error("[AI Types] Governance port not initialized. Call bootAiTypesModule() first.");
  return _governancePort;
}
export function getProviderDbPort(): ICatalogProviderDbPort {
  if (!_providerDbPort) throw new Error("[AI Types] Provider DB port not initialized. Call bootAiTypesModule() first.");
  return _providerDbPort;
}
