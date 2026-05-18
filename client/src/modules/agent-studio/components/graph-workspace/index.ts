/**
 * Graph Workspace Product Work — component barrel.
 *
 * Items 14-25 of the original roadmap shipped 2026-05-17. See
 * `docs/evidence/graph-backend/agent-studio-graph-workspace-product-closure-2026-05-17.md`
 * for the per-item classification.
 */

export { default as VaultExplorer } from "./VaultExplorer";
export { default as MarkdownEditorPane } from "./MarkdownEditorPane";
export { default as WikilinksBacklinksPanel } from "./WikilinksBacklinksPanel";
export { default as LocalGraphView } from "./LocalGraphView";
export { default as GlobalGraphView } from "./GlobalGraphView";
export { default as GraphInspector } from "./GraphInspector";
export type { InspectorTarget } from "./GraphInspector";
export { default as ImpactAnalysisView } from "./ImpactAnalysisView";
export { default as RuntimeAndDecisionTraceView } from "./RuntimeAndDecisionTraceView";
export { default as VaultFsSyncPanel } from "./VaultFsSyncPanel";
export { default as CodeMirrorMdEditor } from "./CodeMirrorMdEditor";
export {
  buildWikilinkCompletionSource,
  wikilinkAutocomplete,
  type WikilinkSuggestion,
  type WikilinkAutocompleteOptions,
} from "./wikilink-autocomplete";
export {
  buildTagCompletionSource,
  tagAutocomplete,
  type TagSuggestion,
  type TagAutocompleteOptions,
} from "./tag-autocomplete";
export {
  default as WorkspaceStateLayer,
  WORKSPACE_STATE_METADATA,
  classifyWorkspaceState,
} from "./WorkspaceStateLayer";
export type { WorkspaceState } from "./WorkspaceStateLayer";
