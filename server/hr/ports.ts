/** HR — Provided ports. */
import type { HrEmployeeSummary } from "./contracts";

export interface HrDirectoryReadPort {
  list(workspaceId: number): Promise<HrEmployeeSummary[]>;
  get(employeeId: string): Promise<HrEmployeeSummary | null>;
}
