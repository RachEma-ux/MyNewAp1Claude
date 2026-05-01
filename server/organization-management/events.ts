/** Organization Management — Event types */
export const OM_EVENTS = {
  entityCreated: "om.entity.created",
  assignmentChanged: "om.assignment.changed",
} as const;
export type OmEventType = (typeof OM_EVENTS)[keyof typeof OM_EVENTS];
