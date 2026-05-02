/**
 * Manual pipeline — form-submission normalizer.
 *
 * The webhook/manual connector hands us a payload of named fields.
 * This normalizer trims whitespace, converts dates to ISO strings,
 * and shapes the payload for `data_acquisition_form_submissions`.
 */

import type { InsertDataAcquisitionFormSubmission } from "../../../../../drizzle/schema";

export interface RawFormSubmission {
  formKey?: string;
  submittedBy?: number;
  submittedAt?: string | number | Date;
  fields: Record<string, unknown>;
}

export function normalizeFormSubmission(
  itemId: number,
  raw: RawFormSubmission,
): InsertDataAcquisitionFormSubmission {
  const trimmed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw.fields ?? {})) {
    if (typeof v === "string") trimmed[k] = v.trim();
    else trimmed[k] = v;
  }
  return {
    itemId,
    formKey: raw.formKey ?? null,
    submittedBy: raw.submittedBy ?? null,
    fieldsJson: trimmed,
    submittedAt: raw.submittedAt ? new Date(raw.submittedAt) : null,
  };
}
