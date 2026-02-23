/**
 * JSON Reporter — outputs validation report as formatted JSON
 */

import type { ValidationReport } from "../index";

export function jsonReporter(report: ValidationReport): string {
  return JSON.stringify(report, null, 2);
}
