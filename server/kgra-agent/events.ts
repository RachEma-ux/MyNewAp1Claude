/** KGRA Agent — Event types */
export const KGRA_EVENTS = { runCompleted: "kgra.run.completed" } as const;
export type KgraEventType = (typeof KGRA_EVENTS)[keyof typeof KGRA_EVENTS];
