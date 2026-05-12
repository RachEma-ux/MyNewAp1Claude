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
  AsdbUnavailableError as BackgroundJobsAsdbUnavailableError,
  JobNotFoundError,
} from "./background-jobs.js";
export type {
  EnqueueJobInput,
  ListJobsInput,
  BackgroundJobRow,
  JobStatus,
} from "./background-jobs.js";

export {
  pushNotification,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  AsdbUnavailableError as UserNotificationsAsdbUnavailableError,
} from "./user-notifications.js";
export type {
  PushNotificationInput,
  ListNotificationsInput,
  NotificationRow,
  UnreadNotificationCount,
} from "./user-notifications.js";

export {
  recordErrorEvent,
  listErrorEvents,
  AsdbUnavailableError as ErrorEventsAsdbUnavailableError,
} from "./error-events.js";
export type {
  RecordErrorEventInput,
  ListErrorEventsInput,
  ErrorEventRow,
} from "./error-events.js";

export {
  captureUnexpectedTrpcError,
  classifyTrpcErrorForCapture,
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
} from "./stats.js";
export type {
  WorkspaceObservabilityStats,
  WorkspaceObservabilityStatsOptions,
} from "./stats.js";
