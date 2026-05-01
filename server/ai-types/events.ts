/** AI Types — Event types */
export const AI_TYPES_EVENTS = {
  catalogPublished: "aiTypes.catalog.published",
  catalogDeprecated: "aiTypes.catalog.deprecated",
} as const;
export type AiTypesEventType =
  (typeof AI_TYPES_EVENTS)[keyof typeof AI_TYPES_EVENTS];
