export const APP_BLOCKER_CATEGORIES = [
  "missing_input",
  "validation_error",
  "lifecycle_rule",
  "governance_block",
  "permission_error",
  "dependency_block",
  "technical_error",
] as const;

export type AppBlockerCategory = (typeof APP_BLOCKER_CATEGORIES)[number];

export interface AppBlockerFieldIssue {
  field: string;
  issue: string;
  message: string;
}

export interface AppBlockerPayload {
  code: string;
  category: AppBlockerCategory;
  title: string;
  summary: string;
  details: string[];
  missingRequirements: string[];
  fieldIssues: AppBlockerFieldIssue[];
  recommendedActions: string[];
  retryable: boolean;
  context: Record<string, unknown>;
  technicalDetails?: string;
}

export function createAppBlockerPayload(
  input: Omit<AppBlockerPayload, "details" | "missingRequirements" | "fieldIssues" | "recommendedActions" | "retryable" | "context"> &
    Partial<Pick<AppBlockerPayload, "details" | "missingRequirements" | "fieldIssues" | "recommendedActions" | "retryable" | "context" | "technicalDetails">>
): AppBlockerPayload {
  return {
    ...input,
    details: input.details ?? [],
    missingRequirements: input.missingRequirements ?? [],
    fieldIssues: input.fieldIssues ?? [],
    recommendedActions: input.recommendedActions ?? [],
    retryable: input.retryable ?? false,
    context: input.context ?? {},
    technicalDetails: input.technicalDetails,
  };
}

export function isAppBlockerPayload(value: unknown): value is AppBlockerPayload {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<AppBlockerPayload>;

  return (
    typeof candidate.code === "string" &&
    typeof candidate.category === "string" &&
    APP_BLOCKER_CATEGORIES.includes(candidate.category as AppBlockerCategory) &&
    typeof candidate.title === "string" &&
    typeof candidate.summary === "string"
  );
}
