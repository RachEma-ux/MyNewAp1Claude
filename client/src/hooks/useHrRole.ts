/**
 * useHrRole — Frontend hook for HR role-based governance
 *
 * Queries the current user's HR role and allowed actions from the server.
 * Used by HR pages and navigation to conditionally render based on permissions.
 */

import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

export function useHrRole() {
  const { data, isLoading } = trpc.hr.me.getRole.useQuery(undefined, {
    staleTime: 60_000, // Cache for 60s (matches server role cache TTL)
    retry: false,
  });

  const role = data?.role ?? "employee";
  const allowedActions = useMemo(() => new Set(data?.allowedActions ?? []), [data?.allowedActions]);

  return {
    role,
    allowedActions,
    isLoading,
    /** Check if the user can perform a specific HR action */
    can: (action: string) => allowedActions.has(action),
    /** Shorthand checks for common section access */
    isAdmin: role === "admin",
    isHrbp: role === "hrbp" || role === "admin",
    isManager: role === "manager" || role === "hrbp" || role === "admin",
  };
}
