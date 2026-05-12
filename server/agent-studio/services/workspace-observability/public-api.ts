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
  getJobById,
  listJobs,
  markJobStarted,
  markJobCompleted,
  markJobFailed,
  markJobCancelled,
  pruneOldBackgroundJobs,
  AsdbUnavailableError as BackgroundJobsAsdbUnavailableError,
  JobNotFoundError,
} from "./background-jobs.js";
export type {
  EnqueueJobInput,
  ListJobsInput,
  BackgroundJobRow,
  JobStatus,
  PruneOldBackgroundJobsInput,
  PruneOldBackgroundJobsResult,
} from "./background-jobs.js";

export {
  pushNotification,
  pushNotificationToUsers,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markNotificationsRead,
  markAllNotificationsRead,
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
  PruneOldNotificationsInput,
  PruneOldNotificationsResult,
} from "./user-notifications.js";

export {
  recordErrorEvent,
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
