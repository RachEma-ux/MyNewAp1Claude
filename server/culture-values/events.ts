/** Culture Values — Event types */
export const CV_EVENTS = {
  valuePublished: "cv.value.published",
} as const;
export type CvEventType = (typeof CV_EVENTS)[keyof typeof CV_EVENTS];
