import { useMemo } from "react";

type Role = "admin" | "member" | "viewer";

interface UsePermissionGateOptions {
  userRole?: Role | null;
  requiredRole?: Role;
}

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
};

export function usePermissionGate(options: UsePermissionGateOptions = {}) {
  const { userRole = "member", requiredRole = "member" } = options;

  const hasAccess = useMemo(() => {
    if (!userRole) return false;
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
  }, [userRole, requiredRole]);

  const isAdmin = useMemo(() => userRole === "admin", [userRole]);

  const reason = useMemo(() => {
    if (!userRole) return "No role assigned";
    if (!hasAccess)
      return `Requires ${requiredRole} role (current: ${userRole})`;
    return "";
  }, [userRole, requiredRole, hasAccess]);

  return { hasAccess, isAdmin, userRole, reason };
}
