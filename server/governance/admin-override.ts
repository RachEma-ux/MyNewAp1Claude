export function requireAdminOverride(user: any) {
  if (!user.roles.includes("admin")) {
    throw new Error("Admin role required");
  }
}
