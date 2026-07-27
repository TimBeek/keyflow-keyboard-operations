export const roles = ["management", "employee"] as const;
export type UserRole = (typeof roles)[number];

export const permissions = [
  "dashboard.management",
  "inventory.view",
  "inventory.mutate",
  "conversion.execute",
  "imports.manage",
  "planning.view",
  "orders.approve",
  "models.manage",
  "reports.view",
  "users.manage",
  "policies.manage",
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions: Record<UserRole, ReadonlySet<Permission>> = {
  management: new Set(permissions),
  employee: new Set([
    "inventory.view",
    "inventory.mutate",
    "conversion.execute",
  ]),
};

export function can(role: UserRole, permission: Permission) {
  return rolePermissions[role].has(permission);
}

export function permissionsForRole(role: UserRole) {
  return [...rolePermissions[role]];
}
