export const roles = ["management", "employee", "noviply"] as const;
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
  "print.fulfil",
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions: Record<UserRole, ReadonlySet<Permission>> = {
  management: new Set(permissions),
  employee: new Set([
    "inventory.view",
    "inventory.mutate",
    "conversion.execute",
  ]),
  // Noviply is een partner, geen collega: meekijken met voorraad en de
  // bestellijst afhandelen, verder niets.
  noviply: new Set([
    "inventory.view",
    "print.fulfil",
  ]),
};

export function can(role: UserRole, permission: Permission) {
  return rolePermissions[role].has(permission);
}

export function permissionsForRole(role: UserRole) {
  return [...rolePermissions[role]];
}
