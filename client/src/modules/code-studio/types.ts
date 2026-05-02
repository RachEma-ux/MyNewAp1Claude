/**
 * Code Studio — Public types.
 *
 * Re-exported from `./index.ts` so other modules can typecheck
 * against Code Studio shapes without reaching into private files.
 * Keep this file dependency-free and minimal: only the data
 * structures other modules legitimately need to refer to.
 */

export type CodeStudioJobStatus =
  | "pending"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface CodeStudioJobSummary {
  id: string;
  status: CodeStudioJobStatus;
  /** Human-readable title for the job. */
  title?: string;
}

export type CodeStudioApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface CodeStudioApprovalSummary {
  id: string;
  status: CodeStudioApprovalStatus;
  /** Module key that requested the approval (always "codeStudio" for
   * Code Studio's own approvals; carried explicitly so multi-source
   * inboxes can disambiguate). */
  sourceModule: string;
}

export type CodeStudioSubdomain =
  | "dashboard"
  | "jobs"
  | "templates"
  | "sessions"
  | "approvals"
  | "repos"
  | "agents"
  | "ai-catalog"
  | "policies"
  | "control-panel"
  | "opencode-settings"
  | "how-to";
