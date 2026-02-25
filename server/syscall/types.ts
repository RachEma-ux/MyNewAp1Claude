/**
 * Syscall Kernel Types — Internal kernel types
 */

import type { SyscallAction, AutonomyLevel } from "@shared/operator-types";

export interface AdapterResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface SyscallAdapter {
  action: SyscallAction;
  requiredAutonomyLevel: AutonomyLevel;
  execute(args: Record<string, unknown>, context: AdapterContext): Promise<AdapterResult>;
}

export interface AdapterContext {
  jobId: string;
  operator: string;
  traceId: string;
  workspaceId?: number;
  autonomyLevel: AutonomyLevel;
}
