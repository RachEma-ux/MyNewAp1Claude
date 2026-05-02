/**
 * AI Agent Studio — Shared UI presentation helpers
 *
 * Pure presentational primitives. No data fetching, no mutations, no
 * architectural concerns. Used by every page in the module to keep
 * visual treatment consistent.
 */
export { default as PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";
export { default as EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
export { default as LifecycleBadge } from "./LifecycleBadge";
export type { LifecycleState } from "./LifecycleBadge";
export { default as VerdictBadge, getVerdictIcon } from "./VerdictBadge";
export type { Verdict } from "./VerdictBadge";
export { default as SectionLabel } from "./SectionLabel";
export { default as LoadingState, SkeletonBlock } from "./LoadingState";
export { default as ErrorCallout } from "./ErrorCallout";
