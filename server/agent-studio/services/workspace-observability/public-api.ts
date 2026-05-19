/**
 * Workspace Observability — public-api barrel.
 *
 * Phase 22. The three service surfaces (background jobs, user
 * notifications, error events) that wire the dormant Phase 22
 * tables.
 *
 * ADR: docs/architecture/agent-studio-native-graph-workspace.md
 */

export {
  enqueueJob,
  enqueueJobs,
  getJobById,
  getJobsByIds,
  listJobs,
  listStaleRunningJobs,
  listOldestPendingJobs,
  markJobStarted,
  markJobsStarted,
  markJobCompleted,
  markJobsCompleted,
  markJobFailed,
  markJobsFailed,
  markJobCancelled,
  bumpJobHeartbeat,
  bumpJobHeartbeats,
  retryJob,
  retryJobs,
  retryJobsByQuery,
  cancelJobs,
  cancelJobsByQuery,
  failStaleRunningJobs,
  pruneOldBackgroundJobs,
  AsdbUnavailableError as BackgroundJobsAsdbUnavailableError,
  JobNotFoundError,
  JobNotRetryableError,
  JobNotCancellableError,
  JobNotRunningError,
} from "./background-jobs.js";
export type {
  EnqueueJobInput,
  ListJobsInput,
  ListStaleRunningJobsInput,
  ListOldestPendingJobsInput,
  BackgroundJobRow,
  JobStatus,
  RetryJobsResult,
  RetryJobsByQueryInput,
  RetryJobsByQueryResult,
  CancelJobsResult,
  CancelJobsByQueryInput,
  CancelJobsByQueryResult,
  BumpJobHeartbeatsResult,
  MarkJobsCompletedResult,
  MarkJobsFailedInput,
  MarkJobsFailedResult,
  MarkJobsStartedResult,
  FailStaleRunningJobsInput,
  FailStaleRunningJobsResult,
  PruneOldBackgroundJobsInput,
  PruneOldBackgroundJobsResult,
} from "./background-jobs.js";
export { TERMINAL_BACKGROUND_JOB_STATUSES, BACKGROUND_JOB_STATUSES } from "./background-jobs.js";

export {
  DEFAULT_BACKGROUND_JOB_STATUS_METADATA,
  getBackgroundJobStatusMetadata,
  getTerminalBackgroundJobStatuses,
  getMetadataForStatus,
  seedBackgroundJobStatusMetadata,
  loadBackgroundJobStatusMetadataFromDb,
  __resetBackgroundJobStatusMetadataCacheForTests,
} from "./background-job-status-metadata.js";
export type { BackgroundJobStatusMetadata } from "./background-job-status-metadata.js";

export {
  pushNotification,
  pushNotifications,
  pushNotificationToUsers,
  getNotificationById,
  getNotificationsByIds,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markNotificationsRead,
  markAllNotificationsRead,
  markAllNotificationsReadByKind,
  dismissNotifications,
  dismissAllNotifications,
  dismissAllNotificationsByKind,
  pruneOldNotifications,
  AsdbUnavailableError as UserNotificationsAsdbUnavailableError,
} from "./user-notifications.js";
export type {
  PushNotificationInput,
  PushNotificationsResult,
  PushNotificationToUsersInput,
  PushNotificationToUsersResult,
  ListNotificationsInput,
  NotificationRow,
  UnreadNotificationCount,
  MarkNotificationsReadInput,
  MarkNotificationsReadResult,
  MarkAllNotificationsReadByKindInput,
  MarkAllNotificationsReadByKindResult,
  DismissNotificationsInput,
  DismissNotificationsResult,
  DismissAllNotificationsInput,
  DismissAllNotificationsResult,
  DismissAllNotificationsByKindInput,
  DismissAllNotificationsByKindResult,
  PruneOldNotificationsInput,
  PruneOldNotificationsResult,
} from "./user-notifications.js";

export {
  recordErrorEvent,
  recordErrorEvents,
  getErrorEventById,
  getErrorEventsByIds,
  listErrorEvents,
  pruneOldErrorEvents,
  AsdbUnavailableError as ErrorEventsAsdbUnavailableError,
} from "./error-events.js";
export type {
  RecordErrorEventInput,
  ListErrorEventsInput,
  ErrorEventRow,
  PruneOldErrorEventsInput,
  PruneOldErrorEventsResult,
} from "./error-events.js";

export {
  captureUnexpectedTrpcError,
  classifyTrpcErrorForCapture,
  extractTrpcErrorMetadata,
  EXPECTED_TRPC_CODES,
} from "./trpc-error-capture.js";
export type {
  CaptureContext,
  CaptureDecision,
  CaptureOptions,
} from "./trpc-error-capture.js";

export {
  getWorkspaceObservabilityStats,
  rollupSourceKindsByLane,
  rollupByLane,
  zeroFillErrorEventsTrend,
  zeroFillDayTrend,
} from "./stats.js";

export { runRetentionSweep } from "./retention-sweep.js";
export { getObservabilityDashboard } from "./dashboard.js";
export type {
  ObservabilityDashboardInput,
  ObservabilityDashboardOptions,
  ObservabilityDashboardPayload,
} from "./dashboard.js";
export { getInboxComposite } from "./inbox.js";
export type {
  InboxCompositeInput,
  InboxCompositePayload,
} from "./inbox.js";
export type {
  RunRetentionSweepInput,
  RunRetentionSweepResult,
  RunRetentionSweepOptions,
} from "./retention-sweep.js";
export type {
  WorkspaceObservabilityStats,
  WorkspaceObservabilityStatsOptions,
  ErrorEventsTrendBucket,
  DayTrendBucket,
} from "./stats.js";
