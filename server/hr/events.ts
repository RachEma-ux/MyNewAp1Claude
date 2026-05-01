/**
 * HR — Event types
 */
export const HR_EVENTS = {
  employeeCreated: "hr.employee.created",
  assignmentChanged: "hr.assignment.changed",
} as const;

export type HrEventType = (typeof HR_EVENTS)[keyof typeof HR_EVENTS];
