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
  markJobStarted,
  markJobCompleted,
  markJobFailed,
  markJobCancelled,
  bumpJobHeartbeat,
  retryJob,
  retryJobs,
  cancelJobs,
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
  BackgroundJobRow,
  JobStatus,
  RetryJobsResult,
  CancelJobsResult,
  FailStaleRunningJobsInput,
  FailStaleRunningJobsResult,
  PruneOldBackgroundJobsInput,
  PruneOldBackgroundJobsResult,
} from "./background-jobs.js";

export {
  pushNotification,
  pushNotificationToUsers,
  getNotificationById,
  getNotificationsByIds,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markNotificationsRead,
  markAllNotificationsRead,
  dismissNotifications,
  pruneOldNotifications,
  AsdbUnavailableError as UserNotificationsAsdbUnavailableError,
} from "./user-notifications.js";
export type {
  PushNotificationInput,
  PushNotificationToUsersInput,
  PushNotificationToUsersResult,
  ListNotificationsInput,
  NotificationRow,
  UnreadNotificationCount,
  MarkNotificationsReadInput,
  MarkNotificationsReadResult,
  DismissNotificationsInput,
  DismissNotificationsResult,
  PruneOldNotificationsInput,
  PruneOldNotificationsResult,
} from "./user-notifications.js";

export {
  recordErrorEvent,
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
