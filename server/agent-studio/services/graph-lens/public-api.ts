/**
 * Graph Lens public-API barrel — Phase 24 §T-F.1.
 *
 * Re-exports the registry surface for consumption by:
 *   - boot installers (lenses registered at startup)
 *   - tRPC layer (`agentStudio.graphLens.*` procedures — ship in
 *     subsequent T-F slices)
 *   - operator dashboard (lens browser UI)
 *
 * Hard-rule compliance: this barrel itself imports only from local
 * modules; no `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 * `credential-resolver` imports.
 */

export {
  GRAPH_LENS_KINDS,
  GRAPH_LENS_LAYOUTS,
  GRAPH_LENS_GOVERNANCE_SCOPES,
  GRAPH_LENS_KIND_METADATA,
  GRAPH_LENS_LAYOUT_METADATA,
  GRAPH_LENS_GOVERNANCE_SCOPE_METADATA,
  isGraphLensKind,
  getGraphLensKindMetadata,
  getGraphLensLayoutMetadata,
  getGraphLensGovernanceScopeMetadata,
  GraphLensIdAlreadyRegisteredError,
  GraphLensNotFoundError,
} from "./contracts.js";

export type {
  GraphLensKind,
  GraphLensLayout,
  GraphLensGovernanceScope,
  GraphLensDefinition,
  GraphLensKindMetadata,
  GraphLensLayoutMetadata,
  GraphLensGovernanceScopeMetadata,
} from "./contracts.js";

export {
  registerGraphLens,
  getGraphLens,
  listGraphLenses,
  listGraphLensesByKind,
  getGraphLensRegistrySize,
  summarizeGraphLensRegistry,
  __resetGraphLensRegistryForTests,
  type GraphLensRegistrySummary,
} from "./registry.js";

export {
  DEFAULT_GRAPH_LENS_DEFINITIONS,
  maybeInstallDefaultGraphLenses,
  type MaybeInstallDefaultGraphLensesOptions,
  type MaybeInstallDefaultGraphLensesResult,
} from "./install-default-lenses.js";

export {
  IMPACT_ANALYSIS_KINDS,
  isImpactAnalysisKind,
  DEFAULT_IMPACT_MAX_DEPTH,
  ABSOLUTE_IMPACT_MAX_DEPTH,
  normalizeImpactMaxDepth,
  summarizeImpactAnalysisResult,
  IMPACT_ANALYSIS_KIND_METADATA,
  getImpactAnalysisKindMetadata,
  type ImpactAnalysisKind,
  type ImpactAnalysisRequest,
  type ImpactAnalysisNode,
  type ImpactAnalysisEdge,
  type ImpactAnalysisResult,
  type ImpactAnalysisResultSummary,
  type ImpactAnalysisKindMetadata,
} from "./impact-analysis-contracts.js";

export {
  IMPACT_ANALYSIS_TEMPLATES,
  findImpactAnalysisTemplate,
  hasImpactAnalysisTemplate,
  buildImpactAnalysisTemplateSeedRows,
  type ImpactAnalysisTemplateEntry,
  type ImpactAnalysisTemplateSeedRow,
} from "./impact-analysis-templates.js";

export {
  runImpactAnalysisStub,
  runImpactAnalysisViaTemplate,
  classifyImpactAnalysisExecutorMode,
} from "./impact-analysis-executor.js";

export {
  registerLensRunner,
  getLensRunner,
  runLens,
  listLensRunnerKinds,
  summarizeLensSnapshot,
  summarizeLensRunnerRegistry,
  __resetLensRunnerRegistryForTests,
  LensRunnerAlreadyRegisteredForKindError,
  LensRunnerNotRegisteredForKindError,
  type LensRunnerFn,
  type LensRunnerViewerContext,
  type LensSnapshot,
  type LensSnapshotNode,
  type LensSnapshotEdge,
  type LensSnapshotSummary,
  type LensRunnerRegistryCoverageSummary,
} from "./runner-contract.js";

export {
  createStubLensRunnerForKind,
  maybeInstallStubLensRunners,
  type MaybeInstallStubLensRunnersOptions,
  type MaybeInstallStubLensRunnersResult,
} from "./stub-runners.js";

export {
  maybeInstallDefaultLensStack,
  type MaybeInstallDefaultLensStackOptions,
  type MaybeInstallDefaultLensStackResult,
  computeLensStackMisconfigWarnings,
  type LensStackMisconfigInput,
} from "./install-default-lens-stack.js";

export {
  buildRuntimeLensSnapshot,
  clampRuntimeLensLimit,
  createRuntimeLensRunner,
  isRuntimeRunVisibleToViewer,
  RUNTIME_LENS_ABSOLUTE_LIMIT,
  RUNTIME_LENS_DEFAULT_LIMIT,
  type BuildRuntimeLensSnapshotInput,
  type CreateRuntimeLensRunnerDeps,
  type RuntimeLensAgentRow,
  type RuntimeLensReadFn,
  type RuntimeLensReadParams,
  type RuntimeLensReadResult,
  type RuntimeLensRunRow,
} from "./runners/runtime-lens-runner.js";

export {
  maybeInstallRuntimeLensRunner,
  type MaybeInstallRuntimeLensRunnerOptions,
  type MaybeInstallRuntimeLensRunnerResult,
} from "./install-runtime-lens-runner.js";

export {
  createRuntimeLensAsdbReader,
  type CreateRuntimeLensAsdbReaderOptions,
} from "./runners/runtime-lens-asdb-reader.js";

export {
  maybeInstallRuntimeLensRunnerWithAsdb,
  type MaybeInstallRuntimeLensRunnerWithAsdbOptions,
} from "./install-runtime-lens-runner-with-asdb.js";

export {
  buildGovernanceLensSnapshot,
  clampGovernanceLensLimit,
  createGovernanceLensRunner,
  isGovernanceNodeVisibleToViewer,
  GOVERNANCE_LENS_ABSOLUTE_LIMIT,
  GOVERNANCE_LENS_DEFAULT_LIMIT,
  type BuildGovernanceLensSnapshotInput,
  type CreateGovernanceLensRunnerDeps,
  type GovernanceLensReadFn,
  type GovernanceLensReadParams,
  type GovernanceLensReadResult,
  type GovernanceLensRequestRow,
  type GovernanceLensStepRow,
} from "./runners/governance-lens-runner.js";

export {
  createGovernanceLensAsdbReader,
  type CreateGovernanceLensAsdbReaderOptions,
} from "./runners/governance-lens-asdb-reader.js";

export {
  maybeInstallGovernanceLensRunner,
  maybeInstallGovernanceLensRunnerWithAsdb,
  type MaybeInstallGovernanceLensRunnerOptions,
  type MaybeInstallGovernanceLensRunnerResult,
  type MaybeInstallGovernanceLensRunnerWithAsdbOptions,
} from "./install-governance-lens-runner.js";

export {
  buildMcpLensSnapshot,
  clampMcpLensLimit,
  createMcpLensRunner,
  isMcpNodeVisibleToViewer,
  MCP_LENS_ABSOLUTE_LIMIT,
  MCP_LENS_DEFAULT_LIMIT,
  type BuildMcpLensSnapshotInput,
  type CreateMcpLensRunnerDeps,
  type McpLensReadFn,
  type McpLensReadParams,
  type McpLensReadResult,
  type McpLensToolCallRow,
} from "./runners/mcp-lens-runner.js";

export {
  createMcpLensAsdbReader,
  type CreateMcpLensAsdbReaderOptions,
} from "./runners/mcp-lens-asdb-reader.js";

export {
  maybeInstallMcpLensRunner,
  maybeInstallMcpLensRunnerWithAsdb,
  type MaybeInstallMcpLensRunnerOptions,
  type MaybeInstallMcpLensRunnerResult,
  type MaybeInstallMcpLensRunnerWithAsdbOptions,
} from "./install-mcp-lens-runner.js";

export {
  buildCagLensSnapshot,
  clampCagLensLimit,
  createCagLensRunner,
  isCagNodeVisibleToViewer,
  CAG_LENS_ABSOLUTE_LIMIT,
  CAG_LENS_DEFAULT_LIMIT,
  type BuildCagLensSnapshotInput,
  type CagLensPackRow,
  type CagLensReadFn,
  type CagLensReadParams,
  type CagLensReadResult,
  type CreateCagLensRunnerDeps,
} from "./runners/cag-lens-runner.js";

export {
  createCagLensAsdbReader,
  type CreateCagLensAsdbReaderOptions,
} from "./runners/cag-lens-asdb-reader.js";

export {
  maybeInstallCagLensRunner,
  maybeInstallCagLensRunnerWithAsdb,
  type MaybeInstallCagLensRunnerOptions,
  type MaybeInstallCagLensRunnerResult,
  type MaybeInstallCagLensRunnerWithAsdbOptions,
} from "./install-cag-lens-runner.js";

export {
  buildRagLensSnapshot,
  clampRagLensLimit,
  createRagLensRunner,
  isRagNodeVisibleToViewer,
  RAG_LENS_ABSOLUTE_LIMIT,
  RAG_LENS_DEFAULT_LIMIT,
  type BuildRagLensSnapshotInput,
  type CreateRagLensRunnerDeps,
  type RagLensReadFn,
  type RagLensReadParams,
  type RagLensReadResult,
  type RagLensSourceRow,
} from "./runners/rag-lens-runner.js";

export {
  createRagLensAsdbReader,
  type CreateRagLensAsdbReaderOptions,
} from "./runners/rag-lens-asdb-reader.js";

export {
  maybeInstallRagLensRunner,
  maybeInstallRagLensRunnerWithAsdb,
  type MaybeInstallRagLensRunnerOptions,
  type MaybeInstallRagLensRunnerResult,
  type MaybeInstallRagLensRunnerWithAsdbOptions,
} from "./install-rag-lens-runner.js";

export {
  buildRacLensSnapshot,
  clampRacLensLimit,
  createRacLensRunner,
  isRacNodeVisibleToViewer,
  RAC_LENS_ABSOLUTE_LIMIT,
  RAC_LENS_DEFAULT_LIMIT,
  type BuildRacLensSnapshotInput,
  type CreateRacLensRunnerDeps,
  type RacLensReadFn,
  type RacLensReadParams,
  type RacLensReadResult,
  type RacLensTraceRow,
} from "./runners/rac-lens-runner.js";

export {
  createRacLensAsdbReader,
  type CreateRacLensAsdbReaderOptions,
} from "./runners/rac-lens-asdb-reader.js";

export {
  maybeInstallRacLensRunner,
  maybeInstallRacLensRunnerWithAsdb,
  type MaybeInstallRacLensRunnerOptions,
  type MaybeInstallRacLensRunnerResult,
  type MaybeInstallRacLensRunnerWithAsdbOptions,
} from "./install-rac-lens-runner.js";

export {
  buildGraphSkillLensSnapshot,
  clampGraphSkillLensLimit,
  createGraphSkillLensRunner,
  isGraphSkillNodeVisibleToViewer,
  GRAPH_SKILL_LENS_ABSOLUTE_LIMIT,
  GRAPH_SKILL_LENS_DEFAULT_LIMIT,
  type BuildGraphSkillLensSnapshotInput,
  type CreateGraphSkillLensRunnerDeps,
  type GraphSkillLensPackRow,
  type GraphSkillLensReadFn,
  type GraphSkillLensReadParams,
  type GraphSkillLensReadResult,
} from "./runners/graph-skill-lens-runner.js";

export {
  createGraphSkillLensAsdbReader,
  type CreateGraphSkillLensAsdbReaderOptions,
} from "./runners/graph-skill-lens-asdb-reader.js";

export {
  maybeInstallGraphSkillLensRunner,
  maybeInstallGraphSkillLensRunnerWithAsdb,
  type MaybeInstallGraphSkillLensRunnerOptions,
  type MaybeInstallGraphSkillLensRunnerResult,
  type MaybeInstallGraphSkillLensRunnerWithAsdbOptions,
} from "./install-graph-skill-lens-runner.js";

export {
  buildInstitutionalMemoryLensSnapshot,
  clampInstitutionalMemoryLensLimit,
  createInstitutionalMemoryLensRunner,
  isInstitutionalMemoryNodeVisibleToViewer,
  INSTITUTIONAL_MEMORY_LENS_ABSOLUTE_LIMIT,
  INSTITUTIONAL_MEMORY_LENS_DEFAULT_LIMIT,
  type BuildInstitutionalMemoryLensSnapshotInput,
  type CreateInstitutionalMemoryLensRunnerDeps,
  type InstitutionalMemoryLensAgentRow,
  type InstitutionalMemoryLensReadFn,
  type InstitutionalMemoryLensReadParams,
  type InstitutionalMemoryLensReadResult,
  type InstitutionalMemoryLensWorkflowRow,
  type InstitutionalMemoryLensPersonRow,
  type InstitutionalMemoryLensProjectRow,
  type InstitutionalMemoryLensDecisionRow,
  type InstitutionalMemoryLensOutcomeRow,
  type InstitutionalMemoryLensTimelineEventRow,
  type InstitutionalMemoryLensDocumentRow,
} from "./runners/institutional-memory-lens-runner.js";

export {
  createInstitutionalMemoryLensAsdbReader,
  type CreateInstitutionalMemoryLensAsdbReaderOptions,
} from "./runners/institutional-memory-lens-asdb-reader.js";

export {
  maybeInstallInstitutionalMemoryLensRunner,
  maybeInstallInstitutionalMemoryLensRunnerWithAsdb,
  type MaybeInstallInstitutionalMemoryLensRunnerOptions,
  type MaybeInstallInstitutionalMemoryLensRunnerResult,
  type MaybeInstallInstitutionalMemoryLensRunnerWithAsdbOptions,
} from "./install-institutional-memory-lens-runner.js";

export {
  buildCodeIntelligenceLensSnapshot,
  clampCodeIntelligenceLensLimit,
  createCodeIntelligenceLensRunner,
  isCodeIntelligenceNodeVisibleToViewer,
  CODE_INTELLIGENCE_LENS_ABSOLUTE_LIMIT,
  CODE_INTELLIGENCE_LENS_DEFAULT_LIMIT,
  type BuildCodeIntelligenceLensSnapshotInput,
  type CreateCodeIntelligenceLensRunnerDeps,
} from "./runners/code-intelligence-lens-runner.js";

export {
  readCodeIntelligenceLensFromAsdb,
  type CodeIntelligenceLensReadFn,
  type CodeIntelligenceLensReadParams,
  type CodeIntelligenceLensReadResult,
} from "./runners/code-intelligence-lens-asdb-reader.js";

export {
  maybeInstallCodeIntelligenceLensRunner,
  maybeInstallCodeIntelligenceLensRunnerWithAsdb,
  type MaybeInstallCodeIntelligenceLensRunnerOptions,
  type MaybeInstallCodeIntelligenceLensRunnerResult,
  type MaybeInstallCodeIntelligenceLensRunnerWithAsdbOptions,
} from "./install-code-intelligence-lens-runner.js";

export {
  buildSecurityDevSecOpsLensSnapshot,
  clampSecurityDevSecOpsLensLimit,
  createSecurityDevSecOpsLensRunner,
  isSecurityDevSecOpsNodeVisibleToViewer,
  SECURITY_DEVSECOPS_LENS_ABSOLUTE_LIMIT,
  SECURITY_DEVSECOPS_LENS_DEFAULT_LIMIT,
  type BuildSecurityDevSecOpsLensSnapshotInput,
  type CreateSecurityDevSecOpsLensRunnerDeps,
} from "./runners/security-devsecops-lens-runner.js";

export {
  readSecurityDevSecOpsLensFromAsdb,
  type SecurityDevSecOpsLensReadFn,
  type SecurityDevSecOpsLensReadParams,
  type SecurityDevSecOpsLensReadResult,
} from "./runners/security-devsecops-lens-asdb-reader.js";

export {
  maybeInstallSecurityDevSecOpsLensRunner,
  maybeInstallSecurityDevSecOpsLensRunnerWithAsdb,
  type MaybeInstallSecurityDevSecOpsLensRunnerOptions,
  type MaybeInstallSecurityDevSecOpsLensRunnerResult,
  type MaybeInstallSecurityDevSecOpsLensRunnerWithAsdbOptions,
} from "./install-security-devsecops-lens-runner.js";

export {
  maybeInstallAllLensRunnersWithAsdb,
  type MaybeInstallAllLensRunnersWithAsdbOptions,
  type MaybeInstallAllLensRunnersWithAsdbResult,
} from "./install-all-lens-runners.js";
