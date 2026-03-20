import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import {
  createAppBlockerPayload,
  isAppBlockerPayload,
  type AppBlockerPayload,
} from "@shared/blockers";

export function getAppBlocker(error: unknown): AppBlockerPayload {
  if (error instanceof TRPCClientError) {
    const blocker = (error.data as { appBlocker?: unknown } | undefined)?.appBlocker;
    if (isAppBlockerPayload(blocker)) {
      return blocker;
    }

    return createAppBlockerPayload({
      code: "trpc_unknown_failure",
      category: "technical_error",
      title: "Something went wrong",
      summary: error.message || "Something went wrong while processing this request. No changes were made.",
      recommendedActions: ["Try again in a moment."],
      retryable: true,
      technicalDetails: error.message,
    });
  }

  if (error instanceof Error) {
    return createAppBlockerPayload({
      code: "client_unknown_failure",
      category: "technical_error",
      title: "Something went wrong",
      summary: error.message || "Something went wrong while processing this request. No changes were made.",
      recommendedActions: ["Try again in a moment."],
      retryable: true,
      technicalDetails: error.message,
    });
  }

  return createAppBlockerPayload({
    code: "unknown_failure",
    category: "technical_error",
    title: "Something went wrong",
    summary: "Something went wrong while processing this request. No changes were made.",
    recommendedActions: ["Try again in a moment."],
    retryable: true,
  });
}

export function getBlockerDescription(blocker: AppBlockerPayload): string | undefined {
  const nextStep = blocker.recommendedActions[0];
  if (nextStep) {
    return `${blocker.summary} ${nextStep}`;
  }
  return blocker.summary;
}

export function showBlockerToast(error: unknown, fallbackTitle?: string) {
  const blocker = getAppBlocker(error);
  toast.error(fallbackTitle ?? blocker.title, {
    description: getBlockerDescription(blocker),
  });
  return blocker;
}

export function isAuthRequiredError(error: unknown): boolean {
  const blocker = getAppBlocker(error);
  return blocker.category === "permission_error" && blocker.code === "auth_required";
}
