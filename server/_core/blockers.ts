import { TRPCError, type TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { ZodError } from "zod";
import {
  createAppBlockerPayload,
  type AppBlockerFieldIssue,
  type AppBlockerPayload,
} from "@shared/blockers";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import {
  containsTechnicalDetails,
  toUserSafeText,
} from "@shared/error-presentation";

type BlockerInput = Parameters<typeof createAppBlockerPayload>[0];

export class AppBlockerError extends Error {
  readonly blocker: AppBlockerPayload;
  readonly trpcCode: TRPC_ERROR_CODE_KEY;

  constructor(
    blocker: BlockerInput,
    trpcCode: TRPC_ERROR_CODE_KEY = "BAD_REQUEST"
  ) {
    const payload = createAppBlockerPayload(blocker);
    super(payload.summary);
    this.name = "AppBlockerError";
    this.blocker = payload;
    this.trpcCode = trpcCode;
  }
}

export function createAppBlockerError(
  blocker: BlockerInput,
  trpcCode: TRPC_ERROR_CODE_KEY = "BAD_REQUEST"
): AppBlockerError {
  return new AppBlockerError(blocker, trpcCode);
}

export function appBlockerToTRPCError(error: AppBlockerError): TRPCError {
  return new TRPCError({
    code: error.trpcCode,
    message: error.blocker.summary,
    cause: error,
  });
}

export function toTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  if (error instanceof AppBlockerError) return appBlockerToTRPCError(error);
  if (error instanceof ZodError) {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: "Request validation failed",
      cause: error,
    });
  }
  if (error instanceof Error) {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
      cause: error,
    });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unknown error",
  });
}

export function getAppBlockerFromUnknown(error: unknown): AppBlockerPayload {
  if (error instanceof AppBlockerError) {
    return error.blocker;
  }

  if (error instanceof TRPCError) {
    return getAppBlockerFromTRPCError(error);
  }

  if (error instanceof ZodError) {
    return fromZodError(error);
  }

  if (error instanceof Error) {
    return createGenericTechnicalBlocker(error.message, error.message);
  }

  return createGenericTechnicalBlocker();
}

export function getAppBlockerFromTRPCError(
  error: TRPCError
): AppBlockerPayload {
  if (error.cause instanceof AppBlockerError) {
    return error.cause.blocker;
  }

  if (error.cause instanceof ZodError) {
    return fromZodError(error.cause);
  }

  const normalizedMessage =
    error.message || (error.cause instanceof Error ? error.cause.message : "");

  if (normalizedMessage === UNAUTHED_ERR_MSG || error.code === "UNAUTHORIZED") {
    return createAppBlockerPayload({
      code: "auth_required",
      category: "permission_error",
      title: "Sign-in required",
      summary: "You need to sign in before this page can load your data.",
      recommendedActions: ["Sign in, then try the same action again."],
      retryable: true,
      context: { trpcCode: error.code },
      technicalDetails: normalizedMessage,
    });
  }

  if (
    normalizedMessage === NOT_ADMIN_ERR_MSG ||
    error.code === "FORBIDDEN" ||
    /access denied|RBAC denial|lacks capability/i.test(normalizedMessage)
  ) {
    return createAppBlockerPayload({
      code: "access_denied",
      category: "permission_error",
      title: "You do not have access to do that",
      summary: "This action is restricted for your current account or role.",
      details:
        normalizedMessage && normalizedMessage !== NOT_ADMIN_ERR_MSG
          ? [normalizedMessage]
          : [],
      recommendedActions: [
        "Use an account with the required permission, or ask an administrator for access.",
      ],
      context: { trpcCode: error.code },
      technicalDetails: normalizedMessage,
    });
  }

  const governanceBlocker = tryBuildGovernanceOrLifecycleBlocker(
    normalizedMessage,
    error.code
  );
  if (governanceBlocker) {
    return governanceBlocker;
  }

  const dependencyBlocker = tryBuildDependencyBlocker(
    normalizedMessage,
    error.code
  );
  if (dependencyBlocker) {
    return dependencyBlocker;
  }

  if (error.code === "NOT_FOUND") {
    return createAppBlockerPayload({
      code: "resource_not_found",
      category: "dependency_block",
      title: "Required item was not found",
      summary:
        "This action cannot continue because a required record does not exist anymore.",
      details: normalizedMessage ? [normalizedMessage] : [],
      recommendedActions: [
        "Refresh the page and confirm the item still exists before trying again.",
      ],
      context: { trpcCode: error.code },
      technicalDetails: normalizedMessage,
    });
  }

  return createGenericTechnicalBlocker(normalizedMessage, normalizedMessage);
}

export function createGenericTechnicalBlocker(
  message?: string,
  technicalDetails?: string
): AppBlockerPayload {
  return createAppBlockerPayload({
    code: "technical_failure",
    category: "technical_error",
    title: "Something went wrong",
    summary:
      "Something went wrong while processing this request. No changes were made.",
    details: [],
    recommendedActions: [
      "Try again in a moment.",
      "If this keeps happening, check the server logs or contact support.",
    ],
    retryable: true,
    technicalDetails,
  });
}

export function wrapDbError(
  error: unknown,
  options: {
    operation: string;
    entity: string;
    missingDependencyTitle?: string;
    missingDependencySummary?: string;
    missingDependencyActions?: string[];
  }
): AppBlockerError {
  const technicalDetails =
    error instanceof Error ? error.message : String(error);
  const message = technicalDetails.toLowerCase();

  if (
    isForeignKeyError(error) ||
    /constraint|violates foreign key|ownerid_users_id_fk|workspaceid_workspaces_id_fk/.test(
      message
    )
  ) {
    return createAppBlockerError(
      {
        code: `${options.entity}_dependency_missing`,
        category: "dependency_block",
        title:
          options.missingDependencyTitle ?? "A required setup item is missing",
        summary:
          options.missingDependencySummary ??
          `The app could not ${options.operation} this ${options.entity} because a required linked record does not exist yet.`,
        recommendedActions: options.missingDependencyActions ?? [
          "Create or restore the missing linked record, then try again.",
          "If this should have been seeded automatically, check the bootstrap data first.",
        ],
        technicalDetails,
      },
      "CONFLICT"
    );
  }

  if (/database not available|db unavailable/.test(message)) {
    return createAppBlockerError(
      {
        code: "database_unavailable",
        category: "technical_error",
        title: "The service is not ready",
        summary:
          "The app could not reach its database, so this request could not be completed.",
        recommendedActions: [
          "Confirm the database is running, then try again.",
        ],
        retryable: true,
        technicalDetails,
      },
      "INTERNAL_SERVER_ERROR"
    );
  }

  return createAppBlockerError(
    {
      code: `${options.entity}_technical_failure`,
      category: "technical_error",
      title: `The ${options.entity} could not be ${options.operation}`,
      summary: `Something went wrong while trying to ${options.operation} this ${options.entity}. No changes were made.`,
      recommendedActions: [
        "Try the action again.",
        "If it keeps failing, inspect the server logs for the technical cause.",
      ],
      retryable: true,
      technicalDetails,
    },
    "INTERNAL_SERVER_ERROR"
  );
}

function fromZodError(error: ZodError): AppBlockerPayload {
  const fieldIssues: AppBlockerFieldIssue[] = error.issues.map(issue => ({
    field: issue.path.join(".") || "request",
    issue: issue.code,
    message: issue.message,
  }));

  return createAppBlockerPayload({
    code: "request_validation_failed",
    category: "validation_error",
    title: "Some information is not valid",
    summary:
      "This request cannot continue until the invalid information is corrected.",
    fieldIssues,
    recommendedActions: [
      "Review the highlighted fields and fix the invalid values.",
    ],
    context: { issueCount: error.issues.length },
    technicalDetails: JSON.stringify(error.flatten()),
  });
}

function tryBuildGovernanceOrLifecycleBlocker(
  message: string,
  trpcCode: TRPC_ERROR_CODE_KEY
): AppBlockerPayload | null {
  const missingEvidenceMatch = message.match(
    /Missing evidence types:\s*([^.]+)/i
  );
  if (missingEvidenceMatch) {
    const missingRequirements = missingEvidenceMatch[1]
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
    return createAppBlockerPayload({
      code: "required_evidence_missing",
      category: "missing_input",
      title: "Required approval details are missing",
      summary:
        "This action cannot continue because some required information has not been provided yet.",
      missingRequirements,
      details: [
        "This governed action requires supporting evidence before it can proceed.",
      ],
      recommendedActions: [
        `Add the required items${missingRequirements.length ? `: ${missingRequirements.join(", ")}` : ""}, then try again.`,
      ],
      context: { trpcCode },
      technicalDetails: message,
    });
  }

  if (/No further lifecycle transition is allowed from/i.test(message)) {
    return createAppBlockerPayload({
      code: "lifecycle_complete",
      category: "lifecycle_rule",
      title: "This item cannot move to another stage",
      summary:
        "This lifecycle action is blocked because the item is already at its last allowed stage.",
      details: [],
      recommendedActions: [
        "Choose a different action, or review the current lifecycle status before trying again.",
      ],
      context: { trpcCode },
      technicalDetails: message,
    });
  }

  const transitionMatch = message.match(
    /Transition from\s+(\w+)\s+to\s+(\w+)\s+is not allowed/i
  );
  if (transitionMatch) {
    return createAppBlockerPayload({
      code: "invalid_lifecycle_transition",
      category: "lifecycle_rule",
      title: "This lifecycle move is not allowed",
      summary: "This item cannot move directly to the selected stage.",
      details: [
        `Current stage: ${transitionMatch[1]}`,
        `Requested stage: ${transitionMatch[2]}`,
      ],
      recommendedActions: [
        "Move the item through the required intermediate stage first.",
      ],
      context: { from: transitionMatch[1], to: transitionMatch[2], trpcCode },
      technicalDetails: message,
    });
  }

  const skipMatch = message.match(/must go through\s+(\w+)/i);
  if (
    /Stage skipping prohibited|Backward transition not allowed/i.test(message)
  ) {
    return createAppBlockerPayload({
      code: "lifecycle_order_violation",
      category: "lifecycle_rule",
      title: "Lifecycle stages must be completed in order",
      summary:
        "This action is blocked because the selected stage is out of order.",
      details: skipMatch ? [`Required next stage: ${skipMatch[1]}`] : [],
      recommendedActions: [
        skipMatch
          ? `Complete the ${skipMatch[1]} stage first, then try this action again.`
          : "Use the next allowed stage in the lifecycle order.",
      ],
      context: { trpcCode },
      technicalDetails: message,
    });
  }

  if (
    /FREEZE|gate FAIL|risk finding|governance denied|policy|compliance/i.test(
      message
    )
  ) {
    return createAppBlockerPayload({
      code: "governance_denied",
      category: "governance_block",
      title: "Governance blocked this action",
      summary:
        "This action cannot continue because it did not pass the required governance checks.",
      details: [
        toUserSafeText(
          message,
          "The system could not load the agents needed for this action."
        ),
      ],
      recommendedActions: [
        "Review the failed checks or policy requirements, fix them, and try again.",
      ],
      context: { trpcCode },
      technicalDetails: message,
    });
  }

  return null;
}

function tryBuildDependencyBlocker(
  message: string,
  trpcCode: TRPC_ERROR_CODE_KEY
): AppBlockerPayload | null {
  const moduleMatch = message.match(
    /Module "([^"]+)" is not enabled for workspace (\d+)/i
  );
  if (moduleMatch) {
    return createAppBlockerPayload({
      code: "workspace_module_disabled",
      category: "dependency_block",
      title: "A required workspace feature is turned off",
      summary: `This action cannot continue because the ${moduleMatch[1]} module is not enabled for this workspace.`,
      recommendedActions: [
        "Enable the required module for this workspace, or switch to a workspace where it is available.",
      ],
      context: {
        workspaceId: moduleMatch[2],
        moduleKey: moduleMatch[1],
        trpcCode,
      },
      technicalDetails: message,
    });
  }

  if (
    /platform workspace not available|required linked record does not exist|required setup item is missing|foreign key/i.test(
      message
    )
  ) {
    return createAppBlockerPayload({
      code: "required_dependency_missing",
      category: "dependency_block",
      title: "A required setup item is missing",
      summary:
        "This action cannot continue because the app is missing a required linked record or setup item.",
      details: containsTechnicalDetails(message) ? [] : [message],
      recommendedActions: [
        "Create or restore the missing dependency, then try again.",
      ],
      context: { trpcCode },
      technicalDetails: message,
    });
  }

  return null;
}

function isForeignKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code === "23503" || candidate.cause?.code === "23503";
}
