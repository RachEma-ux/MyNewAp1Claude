/**
 * PSM — Event types
 */
export const PSM_EVENTS = {
  methodPublished: "psm.method.published",
} as const;

export type PsmEventType = (typeof PSM_EVENTS)[keyof typeof PSM_EVENTS];
