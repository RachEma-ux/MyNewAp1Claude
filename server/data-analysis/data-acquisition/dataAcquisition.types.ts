/**
 * Data Acquisition — internal types
 *
 * Cross-boundary types live in `dataAcquisition.contracts.ts`.
 * This file is for shapes used between repository / service / pipelines.
 */

import type {
  CanonicalRecordType,
  ConnectorStatus,
  ItemStatus,
  ItemType,
  OutputType,
  Pipeline,
  RunStatus,
  SourceType,
} from "./dataAcquisition.constants";

export interface DiscoverInput {
  sourceId: number;
  workspaceId: number;
  cursor?: string;
  limit?: number;
}

export interface DiscoveredItem {
  itemType: ItemType;
  sourceUri: string;
  rawLocation?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksum?: string;
  metadata?: Record<string, unknown>;
}

export interface AcquireInput {
  sourceId: number;
  workspaceId: number;
  itemRefs?: Array<string | number>;
}

export interface AcquiredItem extends DiscoveredItem {
  acquiredAt: string;
}

export interface ClassificationInput {
  itemId: number;
  itemType: ItemType;
  metadata?: Record<string, unknown>;
}

export interface ClassificationOutput {
  dataType: string;
  mode: Pipeline;
  complexity?: "simple" | "structured" | "complex" | "scan";
  language?: string;
  requiresOcr?: boolean;
  hasTables?: boolean;
  recommendedProcessor?: string;
  confidence: number;
  result?: Record<string, unknown>;
}

export interface RoutingInput {
  itemId: number;
  classification: ClassificationOutput;
}

export interface RoutingDecision {
  selectedPipeline: Pipeline;
  selectedProcessor: string;
  fallbackChain: string[];
  strategy: "default" | "fallback" | "manual_override" | "policy";
  costEstimate?: string;
  slaClass?: string;
  decision?: Record<string, unknown>;
}

export interface ProcessingInput {
  itemId: number;
  pipeline: Pipeline;
  processorName: string;
  runId?: number;
}

export interface ProcessingOutput {
  status: RunStatus;
  outputLocation?: string;
  confidence?: number;
  errorMessage?: string;
  result?: Record<string, unknown>;
}

export interface OutputRunInput {
  workspaceId: number;
  itemId?: number;
  canonicalRecordId?: number;
  outputType: OutputType;
  targetRef?: string;
}

export interface SourceSummary {
  id: number;
  workspaceId: number;
  sourceType: SourceType;
  sourceUri: string;
  displayName: string;
  status: ItemStatus | string;
}

export interface ConnectorDescriptor {
  key: string;
  sourceTypes: SourceType[];
  displayName: string;
  envVars?: string[];
  notes?: string;
}

export interface ConnectorRuntimeStatus {
  status: ConnectorStatus;
  message: string;
  url?: string;
}
